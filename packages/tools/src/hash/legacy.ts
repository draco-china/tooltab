import { MAX_HASH_FILE_BYTES, ShaHashError } from "./sha-input";
import { CHUNK_BYTES } from "./input";

import { createAdler32, createMD5, createRIPEMD160 } from "hash-wasm";
const factories = {
  "Adler-32": createAdler32,
  MD5: createMD5,
  "RIPEMD-160": createRIPEMD160,
};
export const LEGACY_ALGORITHMS = ["Adler-32", "MD5", "RIPEMD-160"] as const;
export type LegacyAlgorithm = (typeof LEGACY_ALGORITHMS)[number];
/** Compatibility API for bounded in-memory callers. Raw files use the shared Worker. */
export async function hashLegacyBytes(
  algorithm: LegacyAlgorithm,
  bytes: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  if (!LEGACY_ALGORITHMS.includes(algorithm))
    throw new ShaHashError("unsupported");
  if (bytes.length > MAX_HASH_FILE_BYTES) throw new ShaHashError("too-large");
  const input = bytes.slice();
  try {
    const hasher = await factories[algorithm]();
    for (let offset = 0; offset < input.length; offset += CHUNK_BYTES) {
      signal?.throwIfAborted();
      hasher.update(input.subarray(offset, offset + CHUNK_BYTES));
      if (offset + CHUNK_BYTES < input.length)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    return new Uint8Array(hasher.digest("binary"));
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ShaHashError) throw error;
    throw new ShaHashError("digest-failed");
  } finally {
    input.fill(0);
  }
}
