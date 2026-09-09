import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  createHasher,
  STREAM_ALGORITHMS,
  type Algorithm,
} from "../../src/hash/streaming";
import cityVectors from "./city-vectors.json";
import highwayVectors from "./highway-vectors.json";
import ripemdVectors from "./ripemd-vectors.json";
import sipVectors from "./siphash-vectors.json";

// Published MD4/SM3/Whirlpool and official xxHash C v0.8.3 vectors retained
// from tooltab tests; other fixtures retain their per-family provenance.
const encoder = new TextEncoder();
const abc = encoder.encode("abc");
const bytes = Uint8Array.from({ length: 33 }, (_, index) => index);

async function hash(
  algorithm: Algorithm,
  input: Uint8Array,
  seed = 0n,
  key?: Uint8Array,
  city?: {
    length: number;
    first: Uint8Array;
    last: Uint8Array;
    seed: bigint | null;
  },
) {
  const hasher = await createHasher(algorithm, seed, key, city);
  hasher.update(input);
  return hasher.digest();
}

it("exposes the complete 22-algorithm streaming catalog", () => {
  expect(STREAM_ALGORITHMS).toHaveLength(22);
  expect(new Set(STREAM_ALGORITHMS).size).toBe(22);
});

it("matches independent published vectors for the hash-wasm algorithms", async () => {
  const md4 = await createHasher("MD4");
  md4.update(abc);
  expect(md4.digest()).toBe("a448017aaf21d8525fc10ae87aa6729d");
  expect(await hash("SM3", abc)).toBe(
    "66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0",
  );
  expect(await hash("Whirlpool", new Uint8Array())).toBe(
    "19fa61d75522a4669b44e39c1d2e1726c530232130d407f89afee0964997f7a73e83be698b288febcf88e3e03c4f0757ea8964e59b63d93708b138cc42a66eb3",
  );
});

it("matches the independent City, Highway and SipHash fixtures", async () => {
  // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
  const city = cityVectors.find((vector) => vector.length === 33)!;
  const cityInput = Uint8Array.from(
    { length: city.length },
    (_, index) => index % 251,
  );
  expect(
    await hash("CityHash64", cityInput, 0n, undefined, {
      length: city.length,
      first: cityInput.slice(0, 8),
      last: cityInput.slice(-64),
      seed: null,
    }),
  ).toBe(city.plain);

  // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
  const highway = highwayVectors.find((vector) => vector.length === 33)!;
  const highwayInput = Uint8Array.from(
    { length: 33 },
    (_, index) => index % 251,
  );
  const highwayKey = new Uint8Array(Buffer.from(highway.key, "hex"));
  for (const [algorithm, expected] of [
    ["HighwayHash-64", highway.h64],
    ["HighwayHash-128", highway.h128],
    ["HighwayHash-256", highway.h256],
  ] as const)
    expect(await hash(algorithm, highwayInput, 0n, highwayKey)).toBe(expected);

  // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
  const sip = sipVectors.find((vector) => vector.length === 33)!;
  const sipKey = new Uint8Array(Buffer.from(sip.key, "hex"));
  for (const [algorithm, expected] of [
    ["SipHash-2-4", sip.sip64],
    ["SipHash-128-2-4", sip.sip128],
  ] as const)
    expect(await hash(algorithm, bytes, 0n, sipKey)).toBe(expected);
});

it("matches independent native and core vectors for Adler, MD5, RIPEMD, XXHash and Murmur", async () => {
  expect(await hash("Adler-32", abc)).toBe("024d0127");
  expect(await hash("MD5", abc)).toBe(
    createHash("md5").update(abc).digest("hex"),
  );
  expect(await hash("RIPEMD-160", abc)).toBe(
    createHash("ripemd160").update(abc).digest("hex"),
  );

  const xxhData = Uint8Array.from(
    { length: 1_048_579 },
    (_, index) => index % 251,
  );
  expect(await hash("XXH32", xxhData)).toBe("673a3670");
  expect(await hash("XXH64", xxhData)).toBe("1cf8a64b020d99a6");
  expect(await hash("XXH3-64", xxhData, 0n)).toBe("c48a17a9447ba2e7");
  expect(await hash("XXH3-128", xxhData, 0n)).toBe(
    "ba6dfdc5a82c5c89c48a17a9447ba2e7",
  );
  expect(await hash("XXH3-64", xxhData, 0xffffffffffffffffn)).toBe(
    "05a94126841c829f",
  );
  expect(await hash("XXH3-128", xxhData, 0xffffffffffffffffn)).toBe(
    "a362ee70947fa33505a94126841c829f",
  );

  expect(await hash("Murmur3-x86-32", bytes, 0xffffffffn)).toBe("5585b2a2");
  expect(await hash("Murmur3-x86-128", bytes, 0xffffffffn)).toBe(
    "291dfead4427b9aac473389432c7b48e",
  );
  expect(await hash("Murmur3-x64-128", bytes, 0xffffffffn)).toBe(
    "81ad0194e6fb8de457b4e3c32ad0f6f9",
  );

  // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
  const ripemd = ripemdVectors.find((vector) => vector.length === 33)!;
  for (const [algorithm, key] of [
    ["RIPEMD-128", "ripemd128"],
    ["RIPEMD-256", "ripemd256"],
    ["RIPEMD-320", "ripemd320"],
  ] as const)
    expect(await hash(algorithm, bytes)).toBe(ripemd[key]);
});

it("rejects invalid seeds, keys, algorithms, and required prelude data", async () => {
  await expect(hash("MD5", abc, -1n)).rejects.toThrow("invalid_input");
  await expect(hash("MD5", abc, 0x1_0000_0000_0000_0000n)).rejects.toThrow(
    "invalid_input",
  );
  await expect(hash("MD5", abc, 1n)).rejects.toThrow("invalid_input");
  await expect(hash("Murmur3-x86-32", abc, 0x1_0000_0000n)).rejects.toThrow(
    "invalid_input",
  );
  await expect(hash("MD5", abc, 0n, new Uint8Array([1]))).rejects.toThrow(
    "invalid_input",
  );
  await expect(hash("CityHash64", abc)).rejects.toThrow("invalid_input");
  await expect(hash("SipHash-2-4", abc)).rejects.toThrow("invalid_input");
  await expect(
    hash("SipHash-2-4", abc, 0n, new Uint8Array(15)),
  ).rejects.toThrow("invalid_input");
  await expect(hash("unknown" as Algorithm, abc)).rejects.toThrow(
    "invalid_input",
  );
});
