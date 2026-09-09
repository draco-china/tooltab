import {
  SHA_ALGORITHMS,
  type ShaAlgorithm,
  MAX_HASH_FILE_BYTES,
  ShaHashError,
  isShakeAlgorithm,
  validateShakeOutputBits,
} from "./sha-input";
/** Existing three-argument calls remain valid; outputBits is SHAKE-only. */
export async function hashBytes(
  algorithm: ShaAlgorithm,
  bytes: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
  outputBits?: number,
): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  if (bytes.byteLength > MAX_HASH_FILE_BYTES)
    throw new ShaHashError("too-large");
  if (!SHA_ALGORITHMS.includes(algorithm))
    throw new ShaHashError("unsupported");
  if (isShakeAlgorithm(algorithm)) {
    outputBits = validateShakeOutputBits(
      outputBits ?? (algorithm === "SHAKE128" ? 256 : 512),
    );
  } else if (outputBits !== undefined) {
    throw new ShaHashError("invalid-length");
  }
  if (["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(algorithm)) {
    if (!globalThis.crypto?.subtle) throw new ShaHashError("unsupported");
    let result: ArrayBuffer;
    try {
      result = await globalThis.crypto.subtle.digest(algorithm, bytes);
    } catch {
      signal?.throwIfAborted();
      throw new ShaHashError("digest-failed");
    }
    // Native digest cannot be interrupted; cancellation suppresses its result.
    signal?.throwIfAborted();
    return new Uint8Array(result);
  }
  // Snapshot before the first await, so callers cannot mutate a later chunk.
  let input: Uint8Array<ArrayBuffer> | undefined;
  let hasher:
    | {
        update: (data: Uint8Array) => unknown;
        digest: () => Uint8Array;
        destroy: () => void;
      }
    | undefined;
  try {
    input = bytes.slice();
    if (["SHA-224", "SHA-512/224", "SHA-512/256"].includes(algorithm)) {
      const { sha224, sha512_224, sha512_256 } = await import(
        "@noble/hashes/sha2.js"
      );
      hasher = (
        algorithm === "SHA-224"
          ? sha224
          : algorithm === "SHA-512/224"
            ? sha512_224
            : sha512_256
      ).create();
    } else {
      const { sha3_224, sha3_256, sha3_384, sha3_512, shake128, shake256 } =
        await import("@noble/hashes/sha3.js");
      if (isShakeAlgorithm(algorithm)) {
        hasher = (algorithm === "SHAKE128" ? shake128 : shake256).create({
          dkLen: (outputBits as number) / 8,
        });
      } else {
        hasher = (
          algorithm === "SHA3-224"
            ? sha3_224
            : algorithm === "SHA3-256"
              ? sha3_256
              : algorithm === "SHA3-384"
                ? sha3_384
                : sha3_512
        ).create();
      }
    }
    signal?.throwIfAborted();
    for (let offset = 0; offset < input.length; offset += 65536) {
      signal?.throwIfAborted();
      hasher.update(input.subarray(offset, offset + 65536));
      // Allow browser input/cancel events between bounded chunks.
      if (offset + 65536 < input.length)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    return new Uint8Array(hasher.digest());
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ShaHashError) throw error;
    throw new ShaHashError("digest-failed");
  } finally {
    hasher?.destroy();
    input?.fill(0);
  }
}
