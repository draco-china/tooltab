import { describe, expect, it } from "vitest";
import { createMurmur, parseMurmurSeed } from "../../src/hash/murmur";

const vectors = [
  [
    0,
    0,
    "00000000",
    "00000000000000000000000000000000",
    "00000000000000000000000000000000",
  ],
  [
    1,
    0,
    "514e28b7",
    "88c4adec54d201b954d201b954d201b9",
    "4610abe56eff5cb551622daa78f83583",
  ],
  [
    5,
    0,
    "cca4dccb",
    "90f84e5e4e7ccbd19275e7659275e765",
    "41ee8cd4a6f94036f8d0155e630c23f6",
  ],
  [
    9,
    0,
    "e7e27a50",
    "68213fd95c93cee4d165defe3737caf6",
    "fbb4cb0f6e812d3278de751d0200ffb9",
  ],
  [
    13,
    0,
    "60f00008",
    "3fcb34d0c1565a55313cb9b2d05851bd",
    "4b52d9f2c55f41c284ff869eafa6d8fc",
  ],
  [
    16,
    0,
    "191573dd",
    "6c25c825559180eeea53807489a55bef",
    "444924b591903f30ab906456762fe845",
  ],
  [
    17,
    0,
    "cbe58dc6",
    "6ac99cdb359c940bae1673ada275ab51",
    "5c76f40f9fe7c20ec15f026b9edaa824",
  ],
  [
    33,
    0xffffffff,
    "5585b2a2",
    "291dfead4427b9aac473389432c7b48e",
    "81ad0194e6fb8de457b4e3c32ad0f6f9",
  ],
  [
    1_048_579,
    0,
    "45d2af9f",
    "23a3764083de565d867fff814e535976",
    "f8dd27d0be8668387dc89a8bafe791be",
  ],
] as const;

const algorithms = [
  ["Murmur3-x86-32", 2],
  ["Murmur3-x86-128", 3],
  ["Murmur3-x64-128", 4],
] as const;

describe("incremental Murmur3", () => {
  it("matches independent SMHasher vectors through blocks, tails, and high seeds", () => {
    for (const [length, seed, ...digests] of vectors) {
      const bytes = Uint8Array.from({ length }, (_, index) => index % 251);
      for (const [algorithm, digestIndex] of algorithms) {
        const hasher = createMurmur(algorithm, seed);
        for (let offset = 0; offset < bytes.length; offset += 65_537)
          hasher.update(bytes.subarray(offset, offset + 65_537));
        expect(hasher.digest()).toBe(digests[digestIndex - 2]);
        expect(hasher.digest()).toBe(digests[digestIndex - 2]);
      }
    }
  });

  it("has the same result when every byte arrives separately", () => {
    const bytes = Uint8Array.from({ length: 33 }, (_, index) => index);
    for (const [algorithm, digestIndex] of algorithms) {
      const hasher = createMurmur(algorithm, 0xffffffff);
      for (const byte of bytes) {
        hasher.update(Uint8Array.of(byte));
        hasher.digest();
      }
      expect(hasher.digest()).toBe(vectors[7][digestIndex]);
    }
  });

  it("formats binary output and validates the programmatic inputs", () => {
    const hasher = createMurmur("Murmur3-x86-32");
    hasher.update(new TextEncoder().encode("foo"));
    expect(hasher.digest("binary")).toEqual(
      new Uint8Array([0xf6, 0xa5, 0xc4, 0x20]),
    );

    for (const seed of [
      -1,
      0x1_0000_0000,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ])
      expect(() => createMurmur("Murmur3-x86-32", seed)).toThrow(
        "invalid_seed",
      );
    expect(() => createMurmur("invalid" as never)).toThrow("invalid_seed");
  });

  it("normalizes string seeds", () => {
    expect(parseMurmurSeed("18446744073709551617")).toBe(1);
    expect(parseMurmurSeed("0XFFFFFFFF")).toBe(0xffffffff);
    expect(parseMurmurSeed(" ")).toBe(0);
    for (const input of ["-1", "+1", "1e2", "0b1", "1".repeat(4097)])
      expect(() => parseMurmurSeed(input)).toThrow("invalid_seed");
  });
});
