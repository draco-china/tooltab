import { MAX_BYTES, StreamHashError } from "@workspace/tools/hash/input";
import { blobChunks } from "@workspace/tools/hash/browser";
import { runStreamHash } from "../legacy-hashes/worker-client";
export async function runCityBlob(
  blob: Blob,
  seed: bigint | null,
  signal: AbortSignal,
  progress?: (n: number) => void,
  createWorker?: () => Worker,
) {
  signal.throwIfAborted();
  if (blob.size > MAX_BYTES) throw new StreamHashError("too_large");
  let first: Uint8Array, last: Uint8Array;
  try {
    first = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    signal.throwIfAborted();
    last = new Uint8Array(
      await blob.slice(Math.max(0, blob.size - 64)).arrayBuffer(),
    );
  } catch {
    signal.throwIfAborted();
    throw new StreamHashError("read_failed");
  }
  signal.throwIfAborted();
  return runStreamHash(
    "CityHash64",
    blobChunks(blob, signal),
    signal,
    progress,
    0n,
    undefined,
    { length: blob.size, first, last, seed },
    createWorker,
  );
}
