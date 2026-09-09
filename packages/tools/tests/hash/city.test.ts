import { expect, it } from "vitest";
import { createCityHash, parseCitySeed } from "../../src/hash/city";
import vectors from "./city-vectors.json";

// Retained from tooltab/tests/tools/city-highway; generated with the official C++ CityHash reference.

it("matches official CityHash C++ across short branches, suffix boundaries and optional seeds", () => {
  for (const v of vectors) {
    const bytes = new Uint8Array(v.length).map((_, i) => i % 251);
    for (const [seed, expected] of [
      [null, v.plain],
      [0n, v.zero],
      [0xffffffffffffffffn, v.max],
    ] as const) {
      const h = createCityHash(
        {
          length: bytes.length,
          first: bytes.slice(0, 8),
          last: bytes.slice(Math.max(0, bytes.length - 64)),
        },
        seed,
      );
      for (let i = 0; i < bytes.length; i += 13)
        h.update(bytes.subarray(i, i + 13));
      expect(h.digest()).toBe(expected);
      expect(h.digest()).toBe(expected);
    }
  }
});
it("preserves optional seed distinction and uint64 wrapping", () => {
  expect(parseCitySeed(" ")).toBe(null);
  expect(parseCitySeed("0")).toBe(0n);
  expect(parseCitySeed(" 0XfF ")).toBe(255n);
  expect(parseCitySeed("0x10000000000000000")).toBe(0n);
  expect(parseCitySeed("18446744073709551616")).toBe(0n);
  for (const s of ["-1", "1.2", "1e4", "0b1"])
    expect(() => parseCitySeed(s)).toThrow();
});

it("validates the stable random-access prelude boundaries", () => {
  const valid = {
    length: 8,
    first: new Uint8Array(8),
    last: new Uint8Array(8),
  };
  expect(() => createCityHash({ ...valid, length: -1 })).toThrow(
    "invalid_input",
  );
  expect(() => createCityHash({ ...valid, length: 2 ** 40 + 1 })).toThrow(
    "invalid_input",
  );
  expect(() =>
    createCityHash({ ...valid, length: Number.MAX_SAFE_INTEGER + 1 }),
  ).toThrow("invalid_input");
  expect(() => createCityHash({ ...valid, first: new Uint8Array(7) })).toThrow(
    "invalid_input",
  );
  expect(() => createCityHash({ ...valid, last: new Uint8Array(7) })).toThrow(
    "invalid_input",
  );
  expect(() =>
    createCityHash({
      length: 9,
      first: new Uint8Array(8),
      last: new Uint8Array(8),
    }),
  ).toThrow("invalid_input");
});

it("requires exactly the declared update length before digesting", () => {
  const prelude = {
    length: 5,
    first: Uint8Array.from([1, 2, 3, 4, 5]),
    last: Uint8Array.from([1, 2, 3, 4, 5]),
  };
  const incomplete = createCityHash(prelude);
  incomplete.update(Uint8Array.from([1, 2, 3, 4]));
  expect(() => incomplete.digest()).toThrow("invalid_input");

  const overflow = createCityHash(prelude);
  expect(() => overflow.update(Uint8Array.from([1, 2, 3, 4, 5, 6]))).toThrow(
    "invalid_input",
  );
});

it("supports binary digests, the default seed, and a nonzero byte offset", () => {
  const storage = Uint8Array.from({ length: 90 }, (_, i) => (i * 17) % 251);
  const source = storage.subarray(5, 75);
  const hasher = createCityHash({
    length: source.length,
    first: source.subarray(0, 8),
    last: source.subarray(source.length - 64),
  });
  hasher.update(storage.subarray(5, 20));
  hasher.update(storage.subarray(20, 75));
  const hex = hasher.digest();
  const binary = createCityHash({
    length: source.length,
    first: source.subarray(0, 8),
    last: source.subarray(source.length - 64),
  });
  binary.update(source);
  expect(binary.digest("binary")).toEqual(
    // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
    Uint8Array.from(hex.match(/../g)!, (value) => Number.parseInt(value, 16)),
  );
});

it("rejects oversized seed text before parsing", () => {
  expect(() => parseCitySeed("9".repeat(4097))).toThrow("invalid_seed");
});
