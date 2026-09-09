import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  type FormatSettings,
  ImageFormatError,
  MAX_FORMAT_FILES,
  MAX_FORMAT_INPUT,
  MAX_FORMAT_OUTPUT,
} from "@workspace/tools/image";
import { streamAuthorizedFile } from "./files";
import { runImageFormatsWorker } from "./image-formats-worker-client";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";

const metadata = { name: z.string().max(255).default("image") };
const inline = z.strictObject({
    ...metadata,
    input: z.string().max(Math.ceil(MAX_FORMAT_INPUT / 3) * 4),
  }),
  upload = z.strictObject({ ...metadata, inputUploadId: z.string().min(1) }),
  path = z.strictObject({
    ...metadata,
    inputPath: z.string().min(1).max(4096),
  });
const source = z.union([inline, upload]),
  mcpSource = z.union([inline, upload, path]);
const avif = z.strictObject({
  quality: z.number().int().min(0).max(100).default(75),
  scale: z.number().int().min(10).max(400).default(100),
  speed: z.number().int().min(0).max(10).default(6),
  lossless: z.boolean().default(false),
});
const ico = z.strictObject({
  sizes: z
    .array(z.number().int().min(1).max(256))
    .min(1)
    .max(256)
    .default([16, 32, 48, 256]),
  backgroundEnabled: z.boolean().default(false),
  backgroundColor: z
    .string()
    .regex(/^#[a-f\d]{6}(?![\s\S])/i)
    .default("#ffffff"),
});
const delivery = {
  delivery: z.enum(["inline", "artifact"]).default("artifact"),
};
export const imageFormatsSchemas = {
  "image-to-avif-converter": {
    inline: z.strictObject({
      ...delivery,
      inputs: z.array(source).min(1).max(MAX_FORMAT_FILES),
      options: avif.default(() => avif.parse({})),
    }),
    path: z.strictObject({
      ...delivery,
      inputs: z.array(mcpSource).min(1).max(MAX_FORMAT_FILES),
      options: avif.default(() => avif.parse({})),
    }),
  },
  "image-to-ico": {
    inline: z.strictObject({
      ...delivery,
      source,
      options: ico.default(() => ico.parse({})),
    }),
    path: z.strictObject({
      ...delivery,
      source: mcpSource,
      options: ico.default(() => ico.parse({})),
    }),
  },
};
export type ImageFormatsId = keyof typeof imageFormatsSchemas;
const summary = {
  files: z.array(
    z.strictObject({
      name: z.string(),
      bytes: z.number(),
      inputBytes: z.number(),
      width: z.number(),
      height: z.number(),
      sizes: z.array(z.number()).optional(),
    }),
  ),
  errors: z.array(z.strictObject({ name: z.string(), code: z.string() })),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
};
export const imageFormatsOutputSchema = z.union([
  z.strictObject({
    ...summary,
    delivery: z.literal("inline"),
    encoding: z.literal("base64"),
    output: z.string(),
  }),
  z.strictObject({
    ...summary,
    delivery: z.literal("artifact"),
    artifact: z.strictObject({
      id: z.string(),
      bytes: z.number(),
      filename: z.string(),
      mimeType: z.string(),
      expiresAt: z.number(),
      path: z.string().optional(),
      downloadUrl: z.string().optional(),
    }),
  }),
]);
let active = false;
export async function runImageFormatsTool(
  id: ImageFormatsId,
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (!Object.hasOwn(imageFormatsSchemas, id))
    throw new ImageFormatError("invalid_options");
  if (active) throw new ImageFormatError("busy");
  active = true;
  let saved: string | undefined;
  try {
    let total = 0;
    const read = async (s: z.infer<typeof mcpSource>) => {
      let bytes: Uint8Array;
      if ("input" in s) {
        const b = Buffer.from(s.input, "base64");
        if (b.toString("base64") !== s.input)
          throw new ImageFormatError("invalid_image");
        bytes = new Uint8Array(b);
      } else if ("inputPath" in s) {
        if (context?.transport === "http")
          throw new ImageFormatError("invalid_image");
        const chunks: Uint8Array[] = [];
        let len = 0;
        for await (const chunk of streamAuthorizedFile(
          s.inputPath,
          roots,
          signal,
          MAX_FORMAT_INPUT - total,
        )) {
          chunks.push(chunk);
          len += chunk.length;
        }
        bytes = new Uint8Array(len);
        let at = 0;
        for (const c of chunks) {
          bytes.set(c, at);
          at += c.length;
        }
      } else {
        if (!context) throw new ImageFormatError("invalid_image");
        const record = await context.artifacts.get(s.inputUploadId, "upload");
        if (total + record.bytes > MAX_FORMAT_INPUT)
          throw new ImageFormatError("input_limit");
        bytes = new Uint8Array(await readFile(record.path, { signal }));
      }
      total += bytes.length;
      if (total > MAX_FORMAT_INPUT) throw new ImageFormatError("input_limit");
      return { bytes, name: s.name };
    };
    let settings: FormatSettings, requested: "inline" | "artifact";
    const sources = [];
    if (id === "image-to-avif-converter") {
      const p = imageFormatsSchemas[id].path.parse(input);
      settings = { kind: "avif", options: p.options };
      requested = p.delivery;
      for (const s of p.inputs) sources.push(await read(s));
    } else {
      const p = imageFormatsSchemas[id].path.parse(input);
      settings = { kind: "ico", options: p.options };
      requested = p.delivery;
      sources.push(await read(p.source));
    }
    const result = await runImageFormatsWorker({ sources, settings }, signal);
    signal?.throwIfAborted();
    const { bytes, ...rest } = result;
    const meta = { ...rest, bytes: bytes.length };
    if (requested === "inline") {
      if (bytes.length > 16384) throw new ImageFormatError("artifact_required");
      const out = {
        ...meta,
        delivery: "inline" as const,
        encoding: "base64" as const,
        output: Buffer.from(bytes).toString("base64"),
      };
      if (Buffer.byteLength(JSON.stringify(out)) > 65536)
        throw new ImageFormatError("artifact_required");
      return out;
    }
    if (!context) throw new ImageFormatError("artifact_required");
    const record = await context.artifacts.write(
      (async function* () {
        for (let at = 0; at < bytes.length; at += 65536) {
          signal?.throwIfAborted();
          yield bytes.subarray(at, at + 65536);
        }
      })(),
      {
        filename: result.filename,
        mimeType: result.mimeType,
        limit: MAX_FORMAT_OUTPUT,
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
        filename: record.filename,
        mimeType: record.mimeType,
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
export const imageFormatsOperations: Operation[] = (
  Object.keys(imageFormatsSchemas) as ImageFormatsId[]
).map((id) => ({
  id,
  name: id.replaceAll("-", "_"),
  description:
    id === "image-to-ico"
      ? "Create a complete multi-size PNG ICO with transparent or solid background."
      : "Convert local images to AVIF with explicit lossless, quality, scale and encoder speed; return individual metadata and complete batch ZIP, with per-file failures.",
  inputSchema: imageFormatsSchemas[id].inline,
  outputSchema: imageFormatsOutputSchema,
  idempotent: false,
  bodyLimit: Math.ceil(MAX_FORMAT_INPUT / 3) * 4 + 2 * 1048576,
  run: (input, signal, context) =>
    runImageFormatsTool(id, input, signal, [], context),
}));
