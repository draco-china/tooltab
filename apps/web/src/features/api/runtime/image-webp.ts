import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Zip, ZipPassThrough } from "fflate";
import * as z from "zod/v4";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_PIXELS,
  resizeDimensions,
  scaleDimensions,
  validateDimensions,
} from "@workspace/tools/image/options";
import type { Artifact } from "./artifacts";
import { readAuthorizedFile } from "./files";
import {
  decodeImageCarrier,
  ImageServiceError,
  imageFormat,
  MAX_IMAGE_BASE64,
  MAX_IMAGE_OUTPUT_BYTES,
  resizeImageBytes,
} from "./image-resizer";
import type { OperationContext } from "./operation-contract";

export const webpOptionsSchema = z.strictObject({
  quality: z.number().min(1).max(100).default(85),
  percent: z.number().positive().max(10000).default(100),
  width: z.number().int().positive().max(8192).optional(),
  height: z.number().int().positive().max(8192).optional(),
});
const inline = z.strictObject({ input: z.string().max(MAX_IMAGE_BASE64) });
const upload = z.strictObject({ uploadId: z.uuid() });
const path = z.strictObject({ inputPath: z.string().min(1).max(4096) });
export const webpInputSchema = webpOptionsSchema.extend({
  inputs: z
    .array(z.union([inline, upload]))
    .min(1)
    .max(20),
  output: z.enum(["inline", "artifact"]).default("artifact"),
});
export const webpMcpInputSchema = webpOptionsSchema.extend({
  inputs: z
    .array(z.union([inline, path]))
    .min(1)
    .max(20),
  output: z.enum(["inline", "artifact"]).default("artifact"),
});
const artifactSchema = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  downloadUrl: z.string().optional(),
  path: z.string().optional(),
});
export const webpOutputSchema = z.strictObject({
  results: z.array(
    z.union([
      z.strictObject({
        index: z.number(),
        status: z.literal("success"),
        width: z.number(),
        height: z.number(),
        bytes: z.number(),
        output: z.string().optional(),
        encoding: z.literal("base64").optional(),
        artifact: artifactSchema.optional(),
      }),
      z.strictObject({
        index: z.number(),
        status: z.literal("error"),
        code: z.string(),
      }),
    ]),
  ),
  archive: artifactSchema.optional(),
});
export type WebpContext = OperationContext;
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
      : { downloadUrl: `/api/v1/artifacts/${id}` }),
  };
}
async function originalSize(source: Uint8Array, signal?: AbortSignal) {
  if (!source.length || source.length > MAX_FILE_BYTES)
    throw new ImageServiceError("INPUT_TOO_LARGE");
  const expected = imageFormat(
    Buffer.from(source.buffer, source.byteOffset, source.byteLength),
  );
  const { default: sharp } = await import("sharp");
  signal?.throwIfAborted();
  const image = sharp(source, {
    limitInputPixels: MAX_IMAGE_PIXELS,
    limitInputChannels: 4,
    pages: 1,
    failOn: "warning",
  }).timeout({ seconds: 10 });
  try {
    const metadata = await image.metadata();
    signal?.throwIfAborted();
    if (metadata.format !== expected)
      throw new ImageServiceError("INVALID_IMAGE");
    const dimensions = validateDimensions({
      width: metadata.width,
      height: metadata.pageHeight ?? metadata.height,
    });
    return metadata.orientation && metadata.orientation >= 5
      ? { width: dimensions.height, height: dimensions.width }
      : dimensions;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ImageServiceError) throw error;
    throw new ImageServiceError("INVALID_IMAGE");
  } finally {
    image.destroy();
  }
}
async function* archiveChunks(records: Artifact[], signal?: AbortSignal) {
  let chunks: Uint8Array[] = [];
  let failure: Error | undefined;
  const zip = new Zip((error, data) => {
    if (error) failure = error;
    else chunks.push(data);
  });
  try {
    for (const record of records) {
      const entry = new ZipPassThrough(record.filename);
      zip.add(entry);
      for await (const chunk of createReadStream(record.path, {
        highWaterMark: 65536,
      })) {
        signal?.throwIfAborted();
        entry.push(chunk as Buffer, false);
        if (failure) throw failure;
        yield* chunks;
        chunks = [];
      }
      entry.push(new Uint8Array(), true);
      if (failure) throw failure;
      yield* chunks;
      chunks = [];
    }
    zip.end();
    if (failure) throw failure;
    yield* chunks;
  } finally {
    zip.terminate();
  }
}
export async function runImageWebp(
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  const parsed = (
    context?.transport === "mcp" ? webpMcpInputSchema : webpInputSchema
  ).parse(input);
  if (parsed.output === "inline" && parsed.inputs.length !== 1)
    throw new ImageServiceError("INVALID_OPTIONS");
  if (parsed.output === "artifact" && !context)
    throw new ImageServiceError("INVALID_OPTIONS");
  const records: Artifact[] = [];
  const results: z.infer<typeof webpOutputSchema>["results"] = [];
  try {
    for (const [index, item] of parsed.inputs.entries()) {
      signal?.throwIfAborted();
      try {
        let source: Uint8Array;
        if ("input" in item) source = decodeImageCarrier(item.input);
        else if ("inputPath" in item)
          source = await readAuthorizedFile(
            item.inputPath,
            context?.inputRoots ?? [],
            signal,
          );
        else {
          if (!context) throw new ImageServiceError("INVALID_OPTIONS");
          source = await readFile(
            (await context.artifacts.get(item.uploadId, "upload")).path,
          );
        }
        const original = await originalSize(source, signal);
        let dimensions: { width: number; height: number };
        try {
          dimensions =
            parsed.width && parsed.height
              ? validateDimensions({
                  width: parsed.width,
                  height: parsed.height,
                })
              : parsed.width
                ? resizeDimensions(original, "width", parsed.width, true)
                : parsed.height
                  ? resizeDimensions(original, "height", parsed.height, true)
                  : scaleDimensions(original, parsed.percent);
        } catch {
          throw new ImageServiceError("INVALID_DIMENSIONS");
        }
        const converted = await resizeImageBytes(
          source,
          { ...dimensions, format: "webp", quality: parsed.quality },
          signal,
          parsed.output === "inline"
            ? MAX_IMAGE_OUTPUT_BYTES
            : 64 * 1024 * 1024,
        );
        const result = {
          index,
          status: "success" as const,
          ...dimensions,
          bytes: converted.data.length,
        };
        if (parsed.output === "inline")
          results.push({
            ...result,
            output: converted.data.toString("base64"),
            encoding: "base64",
          });
        else {
          if (!context) throw new ImageServiceError("INVALID_OPTIONS");
          const record = await context.artifacts.write(
            [converted.data],
            {
              limit: 64 * 1024 * 1024,
              mimeType: "image/webp",
              filename: `image-${index + 1}.webp`,
            },
            signal,
          );
          records.push(record);
          results.push({
            ...result,
            artifact: publicArtifact(record, context.transport),
          });
        }
      } catch (error) {
        signal?.throwIfAborted();
        results.push({
          index,
          status: "error",
          code:
            error instanceof Error && "code" in error
              ? String(error.code)
              : "CONVERSION_FAILED",
        });
      }
    }
    if (records.length && context) {
      const archive = await context.artifacts.write(
        archiveChunks(records, signal),
        {
          limit: 512 * 1024 * 1024,
          mimeType: "application/zip",
          filename: "images.zip",
        },
        signal,
      );
      records.push(archive);
      return { results, archive: publicArtifact(archive, context.transport) };
    }
    return { results };
  } catch (error) {
    if (context)
      await Promise.allSettled(
        records.map((record) => context.artifacts.remove(record.id)),
      );
    throw error;
  }
}
