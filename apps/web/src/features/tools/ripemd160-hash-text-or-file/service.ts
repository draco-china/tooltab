import { createReadStream } from "node:fs";
import {
  hashRipemd160Source,
  Ripemd160HashError,
} from "@workspace/tools/hash/ripemd160";
import { MAX_BYTES } from "@workspace/tools/hash/input";
import { streamAuthorizedFile } from "../../api/runtime/files";
import type { OperationContext } from "../../api/runtime/operation-contract";
import { textBytes } from "./logic";

export const MAX_INLINE_TEXT_BYTES = 4 * 1024 * 1024;
export const MAX_INLINE_RAW_BYTES = 32 * 1024 * 1024;
export const MAX_INLINE_BASE64 = 4 * Math.ceil(MAX_INLINE_RAW_BYTES / 3);
export type Ripemd160Format = "hex" | "base64" | "decimal" | "binary";
export type Ripemd160Source =
  | { input: string; encoding: "utf8" | "base64" }
  | { uploadId: string }
  | { inputPath: string };

function inlineBytes(source: Extract<Ripemd160Source, { input: string }>) {
  if (source.encoding === "utf8") {
    const bytes = textBytes(source.input);
    if (bytes.length > MAX_INLINE_TEXT_BYTES) {
      bytes.fill(0);
      throw new Ripemd160HashError("too_large");
    }
    return bytes;
  }
  if (source.input.length % 4 !== 0 || /[^A-Za-z0-9+/=]/u.test(source.input)) {
    throw new Ripemd160HashError("invalid_input");
  }
  const decoded = Buffer.from(source.input, "base64");
  if (
    decoded.toString("base64") !== source.input ||
    decoded.length > MAX_INLINE_RAW_BYTES
  ) {
    decoded.fill(0);
    throw new Ripemd160HashError("invalid_input");
  }
  return new Uint8Array(decoded);
}

async function* resolveSource(
  source: Ripemd160Source,
  signal: AbortSignal,
  context?: OperationContext,
) {
  if ("input" in source) {
    const bytes = inlineBytes(source);
    try {
      yield bytes;
    } finally {
      bytes.fill(0);
    }
    return;
  }
  if (!context) throw new Ripemd160HashError("invalid_input");
  if ("inputPath" in source) {
    if (context.transport !== "mcp")
      throw new Ripemd160HashError("invalid_input");
    yield* streamAuthorizedFile(
      source.inputPath,
      context.inputRoots ?? [],
      signal,
      MAX_BYTES,
    );
    return;
  }
  const record = await context.artifacts.get(source.uploadId, "upload");
  if (record.bytes > MAX_BYTES) throw new Ripemd160HashError("too_large");
  yield* createReadStream(record.path, { highWaterMark: 262144, signal });
}

export async function runRipemd160Request(
  source: Ripemd160Source,
  format: Ripemd160Format,
  signal?: AbortSignal,
  context?: OperationContext,
) {
  const abort = signal ?? new AbortController().signal;
  const result = await hashRipemd160Source(
    resolveSource(source, abort, context),
    abort,
  );
  return {
    algorithm: result.algorithm,
    format,
    bytes: result.bytes,
    outputBits: result.outputBits,
    output: result[format],
  };
}
