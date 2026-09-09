import { expect, it } from "vitest";
import {
  createRipemd,
  littleEndianBitLength,
  RIPEMD_ALGORITHMS,
  type RipemdAlgorithm,
} from "../../src/hash/ripemd";
import official from "./ripemd-official-vectors.json";
import binary from "./ripemd-vectors.json";

// Fixtures are retained from tooltab/tests/tools/ripemd-extended and cover the
// designers' published vectors plus independent PHP 8.4/native C vectors.
const algorithms = [
  ["RIPEMD-128", "ripemd128"],
  ["RIPEMD-256", "ripemd256"],
  ["RIPEMD-320", "ripemd320"],
] as const satisfies readonly [RipemdAlgorithm, keyof typeof official][];

it("matches the published RIPEMD vectors", () => {
  const inputs = [
    "",
    "a",
    "abc",
    "message digest",
    "abcdefghijklmnopqrstuvwxyz",
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    "1234567890".repeat(8),
    "a".repeat(1_000_000),
  ];

  for (const [algorithm, key] of algorithms) {
    for (const [index, text] of inputs.entries()) {
      const engine = createRipemd(algorithm);
      engine.update(new TextEncoder().encode(text));
      expect(engine.digest()).toBe(official[key][index]);
    }
  }
});

it("matches independent binary vectors across padding boundaries", () => {
  for (const vector of binary) {
    const bytes = new Uint8Array(vector.length).map((_, index) => index % 251);
    for (const [algorithm, key] of algorithms) {
      const engine = createRipemd(algorithm);
      for (let offset = 0; offset < bytes.length; offset += 65_537) {
        engine.update(bytes.subarray(offset, offset + 65_537));
      }
      expect(engine.digest()).toBe(vector[key]);
      expect(engine.digest()).toBe(vector[key]);
    }
  }
});

it("supports binary digests, empty updates, and incremental state", () => {
  const engine = createRipemd("RIPEMD-128");
  engine.update(new Uint8Array());
  expect(Array.from(engine.digest("binary"))).toEqual([
    0xcd, 0xf2, 0x62, 0x13, 0xa1, 0x50, 0xdc, 0x3e, 0xcb, 0x61, 0x0f, 0x18,
    0xf6, 0xb3, 0x8b, 0x46,
  ]);

  const vector = binary.find((entry) => entry.length === 129);
  if (!vector) throw new Error("missing 129-byte vector");
  for (const [algorithm, key] of algorithms) {
    const incremental = createRipemd(algorithm);
    for (let index = 0; index < 129; index++) {
      incremental.update(new Uint8Array([index]));
      incremental.digest();
    }
    expect(incremental.digest()).toBe(vector[key]);
  }
});

it("validates algorithms and message lengths", () => {
  expect(RIPEMD_ALGORITHMS).toEqual(["RIPEMD-128", "RIPEMD-256", "RIPEMD-320"]);
  expect(() => createRipemd("RIPEMD-160" as RipemdAlgorithm)).toThrowError(
    "invalid_input",
  );
  expect(() => littleEndianBitLength(-1)).toThrowError("too_large");
  expect(() => littleEndianBitLength(Number.POSITIVE_INFINITY)).toThrowError(
    "too_large",
  );
  for (const length of [0, 1, 2 ** 29, 2 ** 32, 2 ** 40]) {
    expect(
      new DataView(littleEndianBitLength(length).buffer).getBigUint64(0, true),
    ).toBe(BigInt(length) * 8n);
  }
  expect(() => littleEndianBitLength(2 ** 40 + 1)).toThrowError("too_large");
  expect(
    new DataView(littleEndianBitLength(2 ** 40).buffer).getBigUint64(0, true),
  ).toBe(2n ** 43n);
});
