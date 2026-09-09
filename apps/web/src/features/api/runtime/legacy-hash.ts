import { hashTextBytes } from "@workspace/tools/hash/sha-input";
import { formatHash } from "@workspace/tools/hash/format";
import { createReadStream } from "node:fs";
import * as z from "zod/v4";
import { MAX_BYTES, StreamHashError } from "@workspace/tools/hash/input";

import {
  rawHashBytes,
  shaInputSchema,
  shaPathSchema,
} from "@/features/tools/hash-text-or-file/operation";
import { hashLegacyBytes } from "@workspace/tools/hash/legacy";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import { runServiceStreamHash } from "./legacy-hashes";
export const legacyHashDefinitions = [
  ["adler32-hash-text-or-file", "Adler-32"],
  ["md5-hash-text-or-file", "MD5"],
  ["ripemd160-hash-text-or-file", "RIPEMD-160"],
] as const;
export const legacyHashOutputSchema = z.strictObject({
  algorithm: z.enum(["Adler-32", "MD5", "RIPEMD-160"]),
  format: z.enum(["hex", "base64", "decimal", "binary"]),
  bytes: z.number().int().nonnegative(),
  outputBits: z.number().int().positive(),
  output: z.string(),
});
export function legacyHashSchemas(id: string) {
  const definition = legacyHashDefinitions.find(([key]) => key === id);
  if (!definition) throw Error("Unknown legacy hash tool");
  const inline = shaInputSchema;
  const options = inline.omit({ input: true, encoding: true });
  const path = shaPathSchema;
  const upload = options.extend({ uploadId: z.uuid() });
  return {
    algorithm: definition[1],
    inline,
    options,
    path,
    upload,
    http: z.union([inline, upload]),
    mcp: z.union([inline, path, upload]),
  };
}
export async function runLegacyHashFromBytes(
  id: string,
  bytes: Uint8Array<ArrayBuffer>,
  input: unknown,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const { algorithm, options } = legacyHashSchemas(id);
  const args = options.parse(input);
  const digest = await hashLegacyBytes(algorithm, bytes, signal);
  return {
    algorithm,
    format: args.format,
    bytes: bytes.length,
    outputBits: digest.length * 8,
    output: formatHash(digest, args.format),
  };
}
export async function runLegacyHash(
  id: string,
  input: unknown,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const {
    input: content,
    encoding,
    ...options
  } = legacyHashSchemas(id).inline.parse(input);
  const bytes =
    encoding === "utf8" ? hashTextBytes(content) : rawHashBytes(content);
  try {
    return await runLegacyHashFromBytes(id, bytes, options, signal);
  } finally {
    bytes.fill(0);
  }
}
let activeStreams = 0;
export async function runLegacyHashStream(
  id: string,
  source: AsyncIterable<Uint8Array>,
  input: unknown,
  signal?: AbortSignal,
) {
  const { algorithm, options } = legacyHashSchemas(id);
  const args = options.parse(input);
  if (activeStreams >= 2) throw new StreamHashError("busy");
  const abort = signal ?? new AbortController().signal;
  abort.throwIfAborted();
  activeStreams++;
  try {
    const result = await runServiceStreamHash(algorithm, source, abort);
    return {
      algorithm,
      format: args.format,
      bytes: result.bytes,
      outputBits: result.outputBits,
      output: result[args.format],
    };
  } finally {
    activeStreams--;
  }
}
export async function runLegacyHashPath(
  id: string,
  input: unknown,
  roots: readonly string[],
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const { inputPath, ...options } = legacyHashSchemas(id).path.parse(input);
  return runLegacyHashStream(
    id,
    streamAuthorizedFile(inputPath, roots, signal, MAX_BYTES),
    options,
    signal,
  );
}
export async function runLegacyHashUpload(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const { uploadId, ...options } = legacyHashSchemas(id).upload.parse(input);
  if (!context) throw new StreamHashError("invalid_input");
  const record = await context.artifacts.get(uploadId, "upload");
  if (record.bytes > MAX_BYTES) throw new StreamHashError("too_large");
  // Lazy opening means a busy-worker rejection cannot leave an unread open stream.
  async function* source() {
    yield* createReadStream(record.path, { highWaterMark: 262144, signal });
  }
  return runLegacyHashStream(id, source(), options, signal);
}
export async function runLegacyHashRequest(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  const p = legacyHashSchemas(id).http.parse(input);
  return "uploadId" in p
    ? runLegacyHashUpload(id, p, signal, context)
    : runLegacyHash(id, p, signal);
}
