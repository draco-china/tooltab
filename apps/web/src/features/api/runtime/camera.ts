import { readFile } from "node:fs/promises";
import sharp, { type Sharp } from "sharp";
import * as z from "zod/v4";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_PIXELS,
} from "@workspace/tools/image/options";
import { type Artifact, ArtifactError } from "./artifacts";
import { FileAccessError, streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";

const MAX_INLINE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const formats = ["jpeg", "png", "webp"] as const;
const inputFormats = new Set<string>(formats);

export class CameraServiceError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "input_too_large"
      | "invalid_image"
      | "output_too_large"
      | "artifact_required"
      | "busy",
  ) {
    super(code);
  }
}

const options = {
  format: z.enum(formats).default("jpeg"),
  quality: z.number().int().min(1).max(100).default(92),
  delivery: z.enum(["inline", "artifact"]).default("artifact"),
};
const inlineInput = z.strictObject({
  ...options,
  input: z
    .string()
    .min(4)
    .max(Math.ceil(MAX_FILE_BYTES / 3) * 4),
});
const uploadInput = z.strictObject({
  ...options,
  inputUploadId: z.uuid(),
});
const pathInput = z.strictObject({
  ...options,
  inputPath: z.string().min(1).max(4096),
});
export const cameraHttpInputSchema = z.union([inlineInput, uploadInput]);
export const cameraMcpInputSchema = z.union([inlineInput, pathInput]);
export const cameraInputSchema = z.union([inlineInput, uploadInput, pathInput]);

const artifactSchema = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  path: z.string().optional(),
  downloadUrl: z.string().optional(),
});
const facts = {
  capability: z.literal("uploaded-snapshot-processing"),
  cameraAccess: z.literal(false),
  sourceFormat: z.enum(formats),
  sourceWidth: z.number().int().positive(),
  sourceHeight: z.number().int().positive(),
  format: z.enum(formats),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  metadataRemoved: z.literal(true),
};
export const cameraOutputSchema = z.union([
  z.strictObject({
    ...facts,
    delivery: z.literal("inline"),
    encoding: z.literal("base64"),
    output: z.string(),
  }),
  z.strictObject({
    ...facts,
    delivery: z.literal("artifact"),
    artifact: artifactSchema,
  }),
]);

function decodeBase64(value: string) {
  if (value.length % 4 !== 0) throw new CameraServiceError("invalid_input");
  const decoded = Buffer.from(value, "base64");
  if (!decoded.length || decoded.toString("base64") !== value)
    throw new CameraServiceError("invalid_input");
  if (decoded.length > MAX_FILE_BYTES)
    throw new CameraServiceError("input_too_large");
  return decoded;
}

async function sourceBytes(
  input: z.infer<typeof cameraInputSchema>,
  context: WebpContext | undefined,
  signal?: AbortSignal,
) {
  if ("input" in input) return decodeBase64(input.input);
  if ("inputPath" in input) {
    if (context?.transport === "http")
      throw new CameraServiceError("invalid_input");
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of streamAuthorizedFile(
      input.inputPath,
      context?.inputRoots ?? [],
      signal,
      MAX_FILE_BYTES,
    )) {
      chunks.push(chunk);
      length += chunk.length;
    }
    return Buffer.concat(chunks, length);
  }
  if (!context) throw new CameraServiceError("invalid_input");
  const upload = await context.artifacts.get(input.inputUploadId, "upload");
  if (upload.bytes > MAX_FILE_BYTES)
    throw new CameraServiceError("input_too_large");
  return readFile(upload.path, { signal });
}

function publicArtifact(record: Artifact, transport: "http" | "mcp") {
  const { id, bytes, mimeType, filename, expiresAt } = record;
  return {
    id,
    bytes,
    mimeType,
    filename,
    expiresAt,
    ...(transport === "mcp"
      ? { path: record.path }
      : { downloadUrl: `/api/v1/artifacts/${record.id}` }),
  };
}

let active = 0;
export async function processCameraSnapshot(
  rawInput: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const parsed = cameraInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new CameraServiceError("invalid_input");
  if (active >= 2) throw new CameraServiceError("busy");
  active += 1;
  let outputArtifact: string | undefined;
  let pipeline: Sharp | undefined;
  try {
    const source = await sourceBytes(parsed.data, context, signal);
    signal?.throwIfAborted();
    if (!source.length || source.length > MAX_FILE_BYTES)
      throw new CameraServiceError("input_too_large");
    pipeline = sharp(source, {
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXELS,
      limitInputChannels: 4,
      pages: 1,
      sequentialRead: true,
    }).timeout({ seconds: 10 });
    pipeline.on("error", () => {});
    const abort = () => pipeline?.destroy(signal?.reason as Error | undefined);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const metadata = await pipeline.metadata();
      signal?.throwIfAborted();
      if (
        !metadata.format ||
        !inputFormats.has(metadata.format) ||
        !metadata.width ||
        !metadata.height
      )
        throw new CameraServiceError("invalid_image");
      pipeline.rotate().toColourspace("srgb");
      if (parsed.data.format === "jpeg")
        pipeline.jpeg({ quality: parsed.data.quality, mozjpeg: true });
      else if (parsed.data.format === "png") pipeline.png();
      else pipeline.webp({ quality: parsed.data.quality });
      const { data, info } = await pipeline.toBuffer({
        resolveWithObject: true,
      });
      signal?.throwIfAborted();
      if (!data.length || data.length > MAX_OUTPUT_BYTES)
        throw new CameraServiceError("output_too_large");
      const facts = {
        capability: "uploaded-snapshot-processing" as const,
        cameraAccess: false as const,
        sourceFormat: metadata.format as (typeof formats)[number],
        sourceWidth: metadata.autoOrient.width,
        sourceHeight: metadata.autoOrient.height,
        format: parsed.data.format,
        width: info.width,
        height: info.height,
        bytes: data.length,
        metadataRemoved: true as const,
      };
      if (parsed.data.delivery === "inline") {
        if (data.length > MAX_INLINE_BYTES)
          throw new CameraServiceError("artifact_required");
        return {
          ...facts,
          delivery: "inline" as const,
          encoding: "base64" as const,
          output: data.toString("base64"),
        };
      }
      if (!context) throw new CameraServiceError("artifact_required");
      const mimeType = `image/${parsed.data.format}`;
      const record = await context.artifacts.write(
        [data],
        {
          limit: MAX_OUTPUT_BYTES,
          mimeType,
          filename: `camera-snapshot.${parsed.data.format === "jpeg" ? "jpg" : parsed.data.format}`,
        },
        signal,
      );
      outputArtifact = record.id;
      signal?.throwIfAborted();
      return {
        ...facts,
        delivery: "artifact" as const,
        artifact: publicArtifact(record, context.transport),
      };
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  } catch (error) {
    if (outputArtifact && context)
      await context.artifacts.remove(outputArtifact).catch(() => {});
    signal?.throwIfAborted();
    if (
      error instanceof CameraServiceError ||
      error instanceof FileAccessError ||
      error instanceof ArtifactError
    )
      throw error;
    throw new CameraServiceError("invalid_image");
  } finally {
    pipeline?.destroy();
    active -= 1;
  }
}

export const cameraOperation: Operation = {
  id: "camera",
  name: "tooltab_process_camera_snapshot",
  description:
    "Process an image snapshot supplied by the caller, normalize orientation, remove metadata, and return JPEG, PNG, or WebP bytes. This server operation cannot access the caller's camera; live capture is available only in the browser tool.",
  inputSchema: cameraHttpInputSchema,
  outputSchema: cameraOutputSchema,
  idempotent: false,
  bodyLimit: Math.ceil(MAX_FILE_BYTES / 3) * 4 + 65_536,
  run(input, signal, context) {
    return processCameraSnapshot(input, signal, context);
  },
};
