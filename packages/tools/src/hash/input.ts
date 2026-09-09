/** Limits shared by hash tools regardless of where their bytes originate. */
export const MAX_BYTES = 1024 ** 4;
export const MAX_TEXT = 16 * 1024 * 1024;
export const CHUNK_BYTES = 256 * 1024;

export type StreamHashErrorCode =
  | "invalid_input"
  | "too_large"
  | "worker_failed"
  | "read_failed"
  | "timeout"
  | "busy";

export class StreamHashError extends Error {
  constructor(public code: StreamHashErrorCode) {
    super(code);
    this.name = "StreamHashError";
  }
}

/**
 * Encodes user text without silently replacing malformed UTF-16 input.
 *
 * This module intentionally has no Blob, File, Window, or Document references
 * so it can be imported by browser, Worker, and server-side hash callers.
 */
export function textBytes(text: string): Uint8Array<ArrayBuffer> {
  if (text.length > MAX_TEXT) throw new StreamHashError("too_large");
  if (/[\uD800-\uDFFF]/u.test(text)) throw new StreamHashError("invalid_input");

  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_TEXT) throw new StreamHashError("too_large");
  return bytes;
}

/** Validate a cumulative byte count before mutating a streaming hash state. */
export function validateHashByteLength(
  length: number,
  ErrorType: new (code: "too_large") => Error = Error,
): number {
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_BYTES)
    throw new ErrorType("too_large");
  return length;
}
