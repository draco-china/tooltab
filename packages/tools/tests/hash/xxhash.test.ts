import { expect, it } from "vitest";
import {
  createXxHasher,
  parseSeed,
  usesSeed,
  XXHASH_ALGORITHMS,
  type XxAlgorithm,
} from "../../src/hash/xxhash";

// Official xxHash C v0.8.3 vectors retained from tooltab/tests/tools/xxhash.
const oracle = [
  ["0", "c48a17a9447ba2e7", "ba6dfdc5a82c5c89c48a17a9447ba2e7"],
  ["1", "7b581fc812e2f5a6", "f04aba1f4d76e03a7b581fc812e2f5a6"],
  [
    "18446744069414584321",
    "d00534607c5bb493",
    "fd4a9942156558edd00534607c5bb493",
  ],
  [
    "18446744073709551615",
    "05a94126841c829f",
    "a362ee70947fa33505a94126841c829f",
  ],
] as const;

const data = new Uint8Array(1_048_579).map((_, index) => index % 251);

it("matches independent official C v0.8.3 XXH3 vectors including high words", async () => {
  for (const [seed, hex64, hex128] of oracle) {
    const h64 = await createXxHasher("XXH3-64", BigInt(seed));
    const h128 = await createXxHasher("XXH3-128", BigInt(seed));
    for (let index = 0; index < data.length; index += 65_537) {
      h64.update(data.subarray(index, index + 65_537));
      h128.update(data.subarray(index, index + 65_537));
    }
    expect(h64.digest()).toBe(hex64);
    expect(h128.digest()).toBe(hex128);
  }
  const xxh32 = await createXxHasher("XXH32");
  const xxh64 = await createXxHasher("XXH64");
  xxh32.update(data);
  xxh64.update(data);
  expect(xxh32.digest()).toBe("673a3670");
  expect(xxh64.digest()).toBe("1cf8a64b020d99a6");
});

it("parses unsigned decimal and hexadecimal seeds without number rounding", () => {
  expect(parseSeed("  ")).toBe(0n);
  expect(parseSeed("0XFFFFFFFFFFFFFFFF")).toBe(0xffffffffffffffffn);
  expect(parseSeed("18446744073709551617")).toBe(1n);
  expect(parseSeed("9007199254740993")).toBe(9007199254740993n);
  expect(() => parseSeed("1".repeat(4096))).not.toThrow();
  for (const input of [
    "-1",
    "+1",
    "1e3",
    "0b1",
    "1.1",
    "0x",
    "f",
    "1".repeat(4097),
  ])
    expect(() => parseSeed(input)).toThrow("invalid_seed");
});

it("declares only XXH3 variants as seed-aware", () => {
  expect(XXHASH_ALGORITHMS).toEqual(["XXH32", "XXH64", "XXH3-64", "XXH3-128"]);
  expect(usesSeed("XXH32")).toBe(false);
  expect(usesSeed("XXH64")).toBe(false);
  expect(usesSeed("XXH3-64")).toBe(true);
  expect(usesSeed("XXH3-128")).toBe(true);
});

it("rejects invalid algorithm and seed combinations", async () => {
  await expect(createXxHasher("invalid" as XxAlgorithm)).rejects.toThrow(
    "invalid_input",
  );
  await expect(createXxHasher("XXH32", -1n)).rejects.toThrow("invalid_input");
  await expect(
    createXxHasher("XXH3-64", 0x1_0000_0000_0000_0000n),
  ).rejects.toThrow("invalid_input");
  await expect(createXxHasher("XXH32", 1n)).rejects.toThrow("invalid_input");
  await expect(createXxHasher("XXH64", 1n)).rejects.toThrow("invalid_input");
});

it("matches known vectors with each default seed", async () => {
  for (const [algorithm, expected] of [
    ["XXH32", "673a3670"],
    ["XXH64", "1cf8a64b020d99a6"],
    ["XXH3-64", oracle[0][1]],
    ["XXH3-128", oracle[0][2]],
  ] as const) {
    const hasher = await createXxHasher(algorithm);
    hasher.update(data);
    expect(hasher.digest()).toBe(expected);
  }
});
