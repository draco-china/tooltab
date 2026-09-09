import { createXxHasher } from "./xxhash";
import {
  createAdler32,
  createMD4,
  createMD5,
  createRIPEMD160,
  createSM3,
  createWhirlpool,
} from "hash-wasm";
import { StreamHashError } from "./input";
import { createMurmur } from "./murmur";
import { type CityPrelude, createCityHash } from "./city";
import { createHighway } from "./highway";

import { createRipemd } from "./ripemd";
import { createSipHash } from "./siphash";
export const STREAM_ALGORITHMS = [
  "MD4",
  "SM3",
  "Whirlpool",
  "CityHash64",
  "HighwayHash-64",
  "HighwayHash-128",
  "HighwayHash-256",
  "SipHash-2-4",
  "SipHash-128-2-4",
  "Adler-32",
  "MD5",
  "RIPEMD-160",
  "XXH32",
  "XXH64",
  "XXH3-64",
  "XXH3-128",
  "Murmur3-x86-32",
  "Murmur3-x86-128",
  "Murmur3-x64-128",
  "RIPEMD-128",
  "RIPEMD-256",
  "RIPEMD-320",
] as const;
export type Algorithm = (typeof STREAM_ALGORITHMS)[number];
export async function createHasher(
  algorithm: Algorithm,
  seed = 0n,
  key?: Uint8Array,
  city?: CityPrelude & { seed: bigint | null },
) {
  if (
    seed < 0n ||
    seed > 0xffffffffffffffffn ||
    (seed !== 0n &&
      algorithm !== "XXH3-64" &&
      algorithm !== "XXH3-128" &&
      !algorithm.startsWith("Murmur3-"))
  )
    throw new StreamHashError("invalid_input");
  if (algorithm.startsWith("Murmur3-") && seed > 0xffffffffn)
    throw new StreamHashError("invalid_input");
  const low = Number(seed & 0xffffffffn);
  if (
    key !== undefined &&
    !algorithm.startsWith("SipHash-") &&
    !algorithm.startsWith("HighwayHash-")
  )
    throw new StreamHashError("invalid_input");
  switch (algorithm) {
    case "CityHash64":
      if (!city) throw new StreamHashError("invalid_input");
      return createCityHash(city, city.seed);
    case "HighwayHash-64":
      return createHighway(64, key);
    case "HighwayHash-128":
      return createHighway(128, key);
    case "HighwayHash-256":
      return createHighway(256, key);
    case "SipHash-2-4":
    case "SipHash-128-2-4":
      if (key?.length !== 16) throw new StreamHashError("invalid_input");
      return createSipHash(algorithm, key);
    case "MD4":
      return createMD4();
    case "SM3":
      return createSM3();
    case "Whirlpool":
      return createWhirlpool();
    case "Adler-32":
      return createAdler32();
    case "MD5":
      return createMD5();
    case "RIPEMD-160":
      return createRIPEMD160();
    case "XXH32":
    case "XXH64":
    case "XXH3-64":
    case "XXH3-128":
      return createXxHasher(algorithm, seed);
    case "Murmur3-x86-32":
    case "Murmur3-x86-128":
    case "Murmur3-x64-128":
      return createMurmur(algorithm, low);
    case "RIPEMD-128":
    case "RIPEMD-256":
    case "RIPEMD-320":
      return createRipemd(algorithm);
    default:
      throw new StreamHashError("invalid_input");
  }
}

// Narrow factory export lets fixed-algorithm Workers avoid the multi-algorithm dispatcher.
export { createWhirlpool };
