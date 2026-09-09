import { createReadStream } from "node:fs";
import * as z from "zod/v4";
import {
  DataUriError,
  decodeChunks,
  encodeChunk,
  MAX_DATA_FILE,
  MAX_DATA_URI,
  mediaType,
  parseDataUri,
  safeFilename,
  uriMediaType,
} from "@workspace/tools/encoding/data-uri";
import { startDataUriWorker } from "./data-uri-worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";

const source = z.union([
  z.strictObject({ uploadId: z.uuid() }),
  z.strictObject({ inputPath: z.string().min(1).max(4096) }),
  z.strictObject({ inputBase64: z.string().max(2 * 1024 * 1024) }),
]);
export const fileDataUriSchema = z.strictObject({
  source,
  mimeType: z.string().max(4096).optional(),
});
export const decodeDataUriSchema = z.strictObject({
  source: z.union([
    z.strictObject({ input: z.string().max(MAX_DATA_URI) }),
    z.strictObject({ uploadId: z.uuid() }),
    z.strictObject({ inputPath: z.string().min(1).max(4096) }),
  ]),
  filename: z.string().max(255).optional(),
});
export const fileDataUriHttpSchema = fileDataUriSchema.extend({
  source: z.union([
    z.strictObject({ uploadId: z.uuid() }),
    z.strictObject({ inputBase64: z.string().max(2 * 1024 * 1024) }),
  ]),
});
export const decodeDataUriHttpSchema = decodeDataUriSchema.extend({
  source: z.union([
    z.strictObject({ input: z.string().max(MAX_DATA_URI) }),
    z.strictObject({ uploadId: z.uuid() }),
  ]),
});
async function* bytes(
  input: z.infer<typeof source>,
  context: WebpContext,
  limit: number,
  signal?: AbortSignal,
): AsyncGenerator<Uint8Array> {
  signal?.throwIfAborted();
  if ("inputBase64" in input) {
    yield* decodeChunks(
      parseDataUri(`data:application/octet-stream;base64,${input.inputBase64}`),
    );
    return;
  }
  if ("inputPath" in input) {
    if (context.transport !== "mcp") throw new DataUriError("unsupported");
    yield* streamAuthorizedFile(
      input.inputPath,
      context.inputRoots ?? [],
      signal,
      limit,
    );
    return;
  }
  const record = await context.artifacts.get(input.uploadId, "upload");
  if (record.bytes > limit) throw new DataUriError("too_large");
  let count = 0;
  for await (const chunk of createReadStream(record.path, {
    highWaterMark: 49152,
    signal,
  })) {
    count += chunk.length;
    if (count > limit) throw new DataUriError("too_large");
    yield chunk as Buffer;
  }
}
async function write(
  source: AsyncIterable<Uint8Array>,
  mimeType: string,
  filename: string,
  context: WebpContext,
  signal?: AbortSignal,
) {
  const record = await context.artifacts.write(
    source,
    { limit: MAX_DATA_URI, mimeType, filename },
    signal,
  );
  try {
    signal?.throwIfAborted();
    const { id, bytes, mimeType, filename, expiresAt } = record;
    return {
      id,
      bytes,
      mimeType,
      filename,
      expiresAt,
      ...(context.transport === "mcp"
        ? { path: record.path }
        : { downloadUrl: `/api/v1/artifacts/${id}` }),
    };
  } catch (e) {
    await context.artifacts.remove(record.id);
    throw e;
  }
}
export async function fileToDataUriOperation(
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  if (!context) throw new DataUriError("unsupported");
  const p = fileDataUriSchema.parse(input),
    mime = mediaType(
      p.mimeType ??
        ("uploadId" in p.source
          ? (await context.artifacts.get(p.source.uploadId, "upload")).mimeType
          : "application/octet-stream"),
    ).mimeType;
  let fileSize = 0,
    preview = "";
  async function* encode() {
    const prefix = `data:${uriMediaType(mime)};base64,`;
    preview = prefix;
    yield new TextEncoder().encode(prefix);
    let carry = new Uint8Array(0);
    for await (const chunk of bytes(
      p.source,
      context as WebpContext,
      MAX_DATA_FILE,
      signal,
    )) {
      fileSize += chunk.length;
      if (fileSize > MAX_DATA_FILE) throw new DataUriError("too_large");
      const joined = new Uint8Array(carry.length + chunk.length);
      joined.set(carry);
      joined.set(chunk, carry.length);
      const length = joined.length - (joined.length % 3);
      const encoded = encodeChunk(joined.subarray(0, length));
      if (preview.length < 65536)
        preview += encoded.slice(0, 65536 - preview.length);
      yield new TextEncoder().encode(encoded);
      carry = joined.slice(length);
      signal?.throwIfAborted();
    }
    if (carry.length) {
      const tail = encodeChunk(carry);
      if (preview.length < 65536) preview += tail;
      yield new TextEncoder().encode(tail);
    }
  }
  const artifact = await write(
    encode(),
    "text/plain;charset=utf-8",
    "data-uri.txt",
    context,
    signal,
  );
  return {
    mimeType: mime,
    fileSize,
    artifact,
    ...(artifact.bytes <= 65536 ? { dataUri: preview } : {}),
  };
}
export async function dataUriToFileOperation(
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  if (!context) throw new DataUriError("unsupported");
  const p = decodeDataUriSchema.parse(input);
  let value: string;
  if ("input" in p.source) value = p.source.input;
  else {
    const decoder = new TextDecoder("utf-8", { fatal: true }),
      parts: string[] = [];
    try {
      for await (const chunk of bytes(p.source, context, MAX_DATA_URI, signal))
        parts.push(decoder.decode(chunk, { stream: true }));
      parts.push(decoder.decode());
      value = parts.join("");
    } catch (e) {
      signal?.throwIfAborted();
      if (e instanceof TypeError) throw new DataUriError("invalid_unicode");
      throw e;
    }
  }
  const worker = startDataUriWorker(signal);
  try {
    const ready = await worker.request<{
      mimeType: string;
      encoding: string;
      filename: string;
    }>({ input: value });
    async function* chunks() {
      while (true) {
        signal?.throwIfAborted();
        const chunk = await worker.request<{ data: Uint8Array; done: boolean }>(
          { pull: true },
        );
        if (chunk.data.length) yield chunk.data;
        if (chunk.done) return;
      }
    }
    const artifact = await write(
      chunks(),
      ready.mimeType,
      safeFilename(p.filename ?? "", ready.filename),
      context,
      signal,
    );
    return {
      mimeType: ready.mimeType,
      encoding: ready.encoding,
      fileSize: artifact.bytes,
      artifact,
    };
  } finally {
    worker.close();
  }
}
const artifact = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  path: z.string().optional(),
  downloadUrl: z.string().optional(),
});
export const dataUriOperations: Operation[] = [
  {
    id: "file-to-data-uri-converter",
    name: "tooltab_file_to_data_uri_converter",
    description:
      "Convert any binary upload or authorized MCP file to a complete Base64 data URI TXT artifact. Up to 64 MiB file bytes. Optional tiny inline base64 source. MIME supplied explicitly; no content guessing. Small URI also returned inline.",
    inputSchema: fileDataUriHttpSchema,
    outputSchema: z.strictObject({
      mimeType: z.string(),
      fileSize: z.number(),
      artifact,
      dataUri: z.string().optional(),
    }),
    bodyLimit: 2200000,
    idempotent: false,
    run: (input, signal, context) =>
      fileToDataUriOperation(
        (context?.transport === "mcp"
          ? fileDataUriSchema
          : fileDataUriHttpSchema
        ).parse(input),
        signal,
        context,
      ),
  },
  {
    id: "data-uri-to-file-converter",
    name: "tooltab_data_uri_to_file_converter",
    description:
      "Decode Base64 or percent-encoded Data URI into a complete binary artifact, preserving raw bytes. Source string, uploaded URI text or authorized MCP URI file. MIME and encoding metadata preserved; no rendering or execution.",
    inputSchema: decodeDataUriHttpSchema,
    outputSchema: z.strictObject({
      mimeType: z.string(),
      encoding: z.string(),
      fileSize: z.number(),
      artifact,
    }),
    bodyLimit: 32 * 1024 * 1024,
    idempotent: false,
    run: (input, signal, context) =>
      dataUriToFileOperation(
        (context?.transport === "mcp"
          ? decodeDataUriSchema
          : decodeDataUriHttpSchema
        ).parse(input),
        signal,
        context,
      ),
  },
];
