import {
  createXXHash3,
  createXXHash32,
  createXXHash64,
  createXXHash128,
} from "hash-wasm";
import { StreamHashError } from "./input";
export const XXHASH_ALGORITHMS = [
  "XXH32",
  "XXH64",
  "XXH3-64",
  "XXH3-128",
] as const;
export type XxAlgorithm = (typeof XXHASH_ALGORITHMS)[number];
export class XxHashSeedError extends Error {
  constructor() {
    super("invalid_seed");
    this.name = "XxHashSeedError";
  }
}
/** Snapshot accepts unbounded unsigned decimal/hex and wraps at64bits; bound syntax size first. */
export function parseSeed(input: string): bigint {
  if (input.length > 4096) throw new XxHashSeedError();
  const value = input.trim();
  if (!value) return 0n;
  if (!/^(?:[0-9]+|0[xX][0-9a-fA-F]+)$/.test(value))
    throw new XxHashSeedError();
  return BigInt(value) & 0xffffffffffffffffn;
}
export function usesSeed(algorithm: XxAlgorithm) {
  return algorithm === "XXH3-64" || algorithm === "XXH3-128";
}

export async function createXxHasher(algorithm: XxAlgorithm, seed = 0n) {
  if (
    !XXHASH_ALGORITHMS.includes(algorithm) ||
    seed < 0n ||
    seed > 0xffffffffffffffffn ||
    (!usesSeed(algorithm) && seed !== 0n)
  )
    throw new StreamHashError("invalid_input");
  const low = Number(seed & 0xffffffffn);
  const high = Number(seed >> 32n);
  switch (algorithm) {
    case "XXH32":
      return createXXHash32();
    case "XXH64":
      return createXXHash64();
    case "XXH3-64":
      return createXXHash3(low, high);
    case "XXH3-128":
      return createXXHash128(low, high);
  }
}
