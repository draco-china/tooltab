import { StreamHashError } from "@workspace/tools/hash/input";
import type { DigestResult } from "@workspace/tools/hash/format";
import { createMurmur } from "@workspace/tools/hash/murmur";

export const MURMUR_128_ALGORITHMS = [
  "Murmur3-x86-128",
  "Murmur3-x64-128",
] as const;
export type Algorithm = (typeof MURMUR_128_ALGORITHMS)[number];
export function createHasher(algorithm: Algorithm, seed = 0n) {
  if (
    !MURMUR_128_ALGORITHMS.includes(algorithm) ||
    seed < 0n ||
    seed > 0xffffffffn
  ) {
    throw new StreamHashError("invalid_input");
  }
  return createMurmur(algorithm, Number(seed));
}

export type HashResult = DigestResult<Algorithm>;
