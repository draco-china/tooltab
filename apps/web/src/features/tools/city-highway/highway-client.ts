import { MAX_BYTES, StreamHashError } from "@workspace/tools/hash/input";
import { blobChunks } from "@workspace/tools/hash/browser";
import { runStreamHash } from "../legacy-hashes/worker-client";
import type { HighwaySize } from "@workspace/tools/hash/highway";

export async function runHighwayBlob(
  blob: Blob,
  size: HighwaySize,
  key: Uint8Array<ArrayBuffer> | undefined,
  signal: AbortSignal,
  createWorker?: () => Worker,
) {
  signal.throwIfAborted();
  if (blob.size > MAX_BYTES) throw new StreamHashError("too_large");
  return runStreamHash(
    `HighwayHash-${size}`,
    blobChunks(blob, signal),
    signal,
    undefined,
    0n,
    key,
    undefined,
    createWorker,
  );
}
