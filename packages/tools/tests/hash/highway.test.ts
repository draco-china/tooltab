import { expect, it } from "vitest";
import { createHighway, parseHighwayKey } from "../../src/hash/highway";
import vectors from "./highway-vectors.json";

// Retained from tooltab/tests/tools/city-highway: native Google portable HighwayHash reference vectors.

it("matches native Google portable oracle for every tail, three keys and all output widths", async () => {
  for (const v of vectors) {
    const b = new Uint8Array(v.length).map((_, i) => i % 251);
    for (const [size, expected] of [
      [64, v.h64],
      [128, v.h128],
      [256, v.h256],
    ] as const) {
      const h = await createHighway(size, parseHighwayKey(v.key));
      for (let i = 0; i < b.length; i += 17) h.update(b.subarray(i, i + 17));
      expect(h.digest()).toBe(expected);
    }
  }
});
it("blank key means the documented all-zero default, while malformed keys are rejected", async () => {
  expect(parseHighwayKey(" ")).toBeUndefined();
  const h = await createHighway(64);
  expect(h.digest()).toBe(
    vectors.find((v) => v.length === 0 && v.key === "0".repeat(64))?.h64,
  );
  expect(
    parseHighwayKey(`0x${Array.from({ length: 32 }, () => "ff").join(":")}`),
  ).toEqual(new Uint8Array(32).fill(255));
  for (const k of ["f".repeat(63), "f".repeat(66), "gg".repeat(32)])
    expect(() => parseHighwayKey(k)).toThrow();
});

it("supports separated key encodings and rejects oversized key text", () => {
  const plain = "0123456789abcdef".repeat(4);
  expect(parseHighwayKey(`0x${plain}`)).toEqual(parseHighwayKey(plain));
  // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
  expect(parseHighwayKey(plain.match(/../g)!.join(":"))).toEqual(
    parseHighwayKey(plain),
  );
  expect(() => parseHighwayKey("0".repeat(4097))).toThrow("invalid_key");
});

it("validates output size and caller key length before loading the hasher", async () => {
  await expect(createHighway(32 as never)).rejects.toThrow("invalid_key");
  await expect(createHighway(64, new Uint8Array(31))).rejects.toThrow(
    "invalid_key",
  );
  await expect(createHighway(128, new Uint8Array(33))).rejects.toThrow(
    "invalid_key",
  );
});

it("snapshots the key before asynchronous loading", async () => {
  const key = new Uint8Array(32);
  const pending = createHighway(64, key);
  key.fill(255);
  const h = await pending;
  h.update(new Uint8Array());
  expect(h.digest()).toBe(
    vectors.find((v) => v.length === 0 && v.key === "0".repeat(64))?.h64,
  );
});

it("returns independent binary snapshots and keeps digest finalized", async () => {
  const h = await createHighway(64);
  h.update(Uint8Array.from([1, 2, 3]));
  const first = h.digest("binary");
  const expected = h.digest();
  first.fill(255);
  expect(h.digest("binary")).not.toEqual(first);
  expect(h.digest()).toBe(expected);
  expect(() => h.update(new Uint8Array([4]))).toThrow("invalid_input");
});
