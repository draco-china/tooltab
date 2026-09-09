import { CHUNK_BYTES, MAX_BYTES, StreamHashError } from "./input";

/**
 * Reads browser Blob/File data in bounded chunks. Keep this browser-specific
 * entry separate from the pure input core so server and worker imports do not
 * acquire DOM types or Blob behaviour.
 */
export async function* blobChunks(
  blob: Blob,
  signal: AbortSignal,
): AsyncGenerator<Uint8Array> {
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
