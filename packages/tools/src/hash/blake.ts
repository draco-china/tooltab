import { MAX_HASH_FILE_BYTES } from "./sha-input";

export const BLAKE_ALGORITHMS = [
  "BLAKE2b",
  "BLAKE2s",
  "BLAKE3",
  "Keccak",
] as const;
export type BlakeAlgorithm = (typeof BLAKE_ALGORITHMS)[number];
export interface BlakeOptions {
  outputBits?: number;
  key?: Uint8Array;
}
export class BlakeHashError extends Error {
  constructor(
    public readonly code:
      | "invalid-length"
      | "invalid-key"
      | "invalid-base64"
      | "too-large"
      | "unsupported"
      | "digest-failed",
  ) {
    super(code);
    this.name = "BlakeHashError";
  }
}
export function defaultBlakeBits(algorithm: BlakeAlgorithm): number {
  return algorithm === "BLAKE2b" ? 512 : 256;
}
export function validateBlakeOptions(
  algorithm: BlakeAlgorithm,
  options: BlakeOptions,
): number {
  if (!BLAKE_ALGORITHMS.includes(algorithm))
    throw new BlakeHashError("unsupported");
  const bits = options.outputBits ?? defaultBlakeBits(algorithm);
  const valid =
    algorithm === "Keccak"
      ? [224, 256, 384, 512].includes(bits)
      : Number.isInteger(bits) &&
        bits >= 8 &&
        bits <= defaultBlakeBits(algorithm) &&
        bits % 8 === 0;
  if (!valid) throw new BlakeHashError("invalid-length");
  // A transferred buffer also reports length zero, but is not an empty key.
  if (options.key) {
    try {
      options.key.subarray(0, 0);
    } catch {
      throw new BlakeHashError("invalid-key");
    }
  }
  const keyLength = options.key?.length ?? 0;
  if (
    keyLength &&
    (algorithm === "Keccak" ||
      (algorithm === "BLAKE3"
        ? keyLength !== 32
        : keyLength > (algorithm === "BLAKE2b" ? 64 : 32)))
  )
    throw new BlakeHashError("invalid-key");
  return bits;
}
/** A missing key selects unkeyed mode; malformed input never silently does so. */
export function decodeBlakeKey(encoded: string): Uint8Array<ArrayBuffer> {
  if (!encoded) return new Uint8Array();
  if (encoded.length > 88) throw new BlakeHashError("invalid-key");
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new BlakeHashError("invalid-base64");
  }
  if (btoa(binary) !== encoded) throw new BlakeHashError("invalid-base64");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
export async function hashBlakeBytes(
  algorithm: BlakeAlgorithm,
  bytes: Uint8Array<ArrayBuffer>,
  options: BlakeOptions = {},
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  if (bytes.length > MAX_HASH_FILE_BYTES) throw new BlakeHashError("too-large");
  const bits = validateBlakeOptions(algorithm, options);
  let input: Uint8Array<ArrayBuffer> | undefined;
  let key: Uint8Array | undefined;
  let hasher:
    | {
        update: (bytes: Uint8Array) => unknown;
        digest: () => Uint8Array;
        destroy: () => void;
      }
    | undefined;
  try {
    input = bytes.slice();
    key = options.key?.length ? options.key.slice() : undefined;
    if (algorithm === "BLAKE2b" || algorithm === "BLAKE2s") {
      const { blake2b, blake2s } = await import("@noble/hashes/blake2.js");
      hasher = (algorithm === "BLAKE2b" ? blake2b : blake2s).create({
        dkLen: bits / 8,
        key,
      });
    } else if (algorithm === "BLAKE3") {
      const { blake3 } = await import("@noble/hashes/blake3.js");
      hasher = blake3.create({ dkLen: bits / 8, key });
    } else {
      const { keccak_224, keccak_256, keccak_384, keccak_512 } = await import(
        "@noble/hashes/sha3.js"
      );
      hasher = (
        bits === 224
          ? keccak_224
          : bits === 256
            ? keccak_256
            : bits === 384
              ? keccak_384
              : keccak_512
      ).create();
    }
    signal?.throwIfAborted();
    for (let offset = 0; offset < input.length; offset += 65536) {
      signal?.throwIfAborted();
      hasher.update(input.subarray(offset, offset + 65536));
      if (offset + 65536 < input.length)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    return new Uint8Array(hasher.digest());
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof BlakeHashError) throw error;
    throw new BlakeHashError("digest-failed");
  } finally {
    hasher?.destroy();
    input?.fill(0);
    key?.fill(0);
  }
}
