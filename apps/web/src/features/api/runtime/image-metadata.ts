import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  ImageMetadataError,
  MAX_IMAGE_BYTES,
} from "@workspace/tools/image/metadata-containers";
import { runImageMetadataWorker } from "@/features/tools/image-metadata/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const shape = {
  input: z
    .string()
    .max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
    .optional(),
  inputUploadId: z.string().min(1).optional(),
  delivery: z.enum(["inline", "artifact"]).default("inline"),
};
const exactly = (p: {
  input?: string;
  inputUploadId?: string;
  inputPath?: string;
}) =>
  [p.input, p.inputUploadId, p.inputPath].filter((x) => x !== undefined)
    .length === 1;
export const imageMetadataInputSchema = z.strictObject(shape).refine(exactly);
export const imageMetadataMcpInputSchema = z
  .strictObject({ ...shape, inputPath: z.string().min(1).max(4096).optional() })
  .refine(exactly);
const artifact = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  path: z.string().optional(),
  downloadUrl: z.string().optional(),
});
const summary = {
  tool: z.enum(["exif-viewer", "image-metadata-cleaner"]),
  format: z.string(),
  bytes: z.number(),
  fields: z.number().optional(),
  gps: z
    .object({ latitude: z.number(), longitude: z.number() })
    .nullable()
    .optional(),
  warnings: z.array(z.string()),
  removedBytes: z.number().optional(),
  removed: z.record(z.string(), z.number()).optional(),
  preservesCompressedPixels: z.literal(true).optional(),
  appearanceMayChange: z.literal(true).optional(),
};
export const imageMetadataOutputSchema = z.union([
  z.strictObject({
    ...summary,
    delivery: z.literal("inline"),
    encoding: z.enum(["utf8", "base64"]),
    output: z.string(),
  }),
  z.strictObject({ ...summary, delivery: z.literal("artifact"), artifact }),
]);
let active = false;
export async function runImageMetadataTool(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (active) throw new ImageMetadataError("busy");
  active = true;
  let saved: string | undefined;
  try {
    if (id !== "exif-viewer" && id !== "image-metadata-cleaner")
      throw new ImageMetadataError("invalid_image");
    const p = imageMetadataMcpInputSchema.parse(input);
    let bytes: Uint8Array;
    if (p.input !== undefined) {
      if (p.input.length % 4 !== 0)
        throw new ImageMetadataError("invalid_image");
      const b = Buffer.from(p.input, "base64");
      if (b.toString("base64") !== p.input)
        throw new ImageMetadataError("invalid_image");
      bytes = b;
    } else if (p.inputPath) {
      if (context?.transport === "http")
        throw new ImageMetadataError("invalid_image");
      const chunks: Uint8Array[] = [];
      let length = 0;
      for await (const chunk of streamAuthorizedFile(
        p.inputPath,
        roots,
        signal,
        MAX_IMAGE_BYTES,
      )) {
        chunks.push(chunk);
        length += chunk.length;
      }
      bytes = new Uint8Array(length);
      let n = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, n);
        n += chunk.length;
      }
    } else {
      if (!context || !p.inputUploadId)
        throw new ImageMetadataError("invalid_image");
      const record = await context.artifacts.get(p.inputUploadId, "upload");
      if (record.bytes > MAX_IMAGE_BYTES)
        throw new ImageMetadataError("too_large");
      bytes = new Uint8Array(await readFile(record.path, { signal }));
    }
    if (bytes.length > MAX_IMAGE_BYTES)
      throw new ImageMetadataError("too_large");
    const result = await runImageMetadataWorker(
      { kind: id === "exif-viewer" ? "inspect" : "clean", bytes },
      signal,
      undefined,
      import.meta.env.PROD
        ? () =>
            new Worker(
              serviceWorkerUrl("image-metadata-worker", import.meta.url),
              { type: "module" },
            )
        : undefined,
    );
    signal?.throwIfAborted();
    const out =
      result.kind === "metadata"
        ? new TextEncoder().encode(result.json)
        : result.bytes;
    const meta = {
      tool: id,
      format: result.format,
      bytes: out.length,
      ...(result.kind === "metadata"
        ? { fields: result.fields, gps: result.gps, warnings: result.warnings }
        : {
            removedBytes: result.removedBytes,
            removed: result.removed,
            preservesCompressedPixels: true as const,
            appearanceMayChange: true as const,
            warnings: [
              "appearance_may_change",
              "unknown_private_chunks_may_remain",
            ],
          }),
    };
    if (p.delivery === "inline") {
      if (out.length > 16384) throw new ImageMetadataError("artifact_required");
      const response = {
        ...meta,
        delivery: "inline" as const,
        encoding:
          result.kind === "metadata" ? ("utf8" as const) : ("base64" as const),
        output:
          result.kind === "metadata"
            ? result.json
            : Buffer.from(out).toString("base64"),
      };
      if (Buffer.byteLength(JSON.stringify(response)) > 65536)
        throw new ImageMetadataError("artifact_required");
      return response;
    }
    if (!context) throw new ImageMetadataError("artifact_required");
    const record = await context.artifacts.write(
      (async function* () {
        for (let i = 0; i < out.length; i += 65536) {
          signal?.throwIfAborted();
          yield out.subarray(i, i + 65536);
        }
      })(),
      {
        filename:
          result.kind === "metadata"
            ? "image-metadata.json"
            : `cleaned.${result.format === "jpeg" ? "jpg" : result.format}`,
        mimeType:
          result.kind === "metadata"
            ? "application/json"
            : `image/${result.format}`,
        limit: MAX_IMAGE_BYTES,
      },
      signal,
    );
    saved = record.id;
    signal?.throwIfAborted();
    return {
      ...meta,
      delivery: "artifact" as const,
      artifact: {
        id: record.id,
        bytes: record.bytes,
        mimeType: record.mimeType,
        filename: record.filename,
        expiresAt: record.expiresAt,
        ...(context.transport === "mcp"
          ? { path: record.path }
          : { downloadUrl: `/api/v1/artifacts/${record.id}` }),
      },
    };
  } catch (e) {
    if (saved && context) await context.artifacts.remove(saved).catch(() => {});
    throw e;
  } finally {
    active = false;
  }
}
export const imageMetadataOperations: Operation[] = [
  "exif-viewer",
  "image-metadata-cleaner",
].map((id) => ({
  id,
  name:
    id === "exif-viewer" ? "inspect_image_metadata" : "clean_image_metadata",
  description:
    id === "exif-viewer"
      ? "Read image metadata locally; no remote location lookup."
      : "Remove supported metadata without reencoding pixels; orientation/color appearance may change.",
  inputSchema: imageMetadataInputSchema,
  outputSchema: imageMetadataOutputSchema,
  idempotent: false,
  bodyLimit: Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 65536,
  async run(input, signal, context) {
    return runImageMetadataTool(
      id,
      imageMetadataInputSchema.parse(input),
      signal,
      [],
      context,
    );
  },
}));
