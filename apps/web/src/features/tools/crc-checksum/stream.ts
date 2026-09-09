export const MAX_BYTES = 1024 ** 4;
export const MAX_TEXT = 16 * 1024 * 1024;
export const CHUNK_BYTES = 256 * 1024;
export class StreamHashError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "too_large"
      | "worker_failed"
      | "read_failed"
      | "timeout",
  ) {
    super(code);
    this.name = "StreamHashError";
  }
}
export function textBytes(text: string) {
  if (text.length > MAX_TEXT || /[\uD800-\uDFFF]/u.test(text))
    throw new StreamHashError("too_large");
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_TEXT) throw new StreamHashError("too_large");
  return bytes;
}
export async function* blobChunks(blob: Blob, signal: AbortSignal) {
  if (blob.size > MAX_BYTES) throw new StreamHashError("too_large");
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    signal.throwIfAborted();
    let buffer: ArrayBuffer;
    try {
      buffer = await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer();
    } catch {
      signal.throwIfAborted();
      throw new StreamHashError("read_failed");
    }
    signal.throwIfAborted();
    yield new Uint8Array(buffer);
  }
}
