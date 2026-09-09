import { expect, it } from "vitest";
import {
  createSipHash,
  parseSipHashKey,
  randomSipHashKey,
  SipHashKeyError,
  type SipHashAlgorithm,
} from "../../src/hash/siphash";
const EXAMPLE_KEY = "000102030405060708090a0b0c0d0e0f";
import vectors from "./siphash-vectors.json";

it("matches authors native C across every tail, three high-bit keys and streamed boundaries", () => {
  for (const v of vectors) {
    const data = new Uint8Array(v.length).map((_, i) => i % 251);
    for (const [algorithm, expected] of [
      ["SipHash-2-4", v.sip64],
      ["SipHash-128-2-4", v.sip128],
    ] as const) {
      const h = createSipHash(algorithm, parseSipHashKey(v.key));
      for (let i = 0; i < data.length; i += 13)
        h.update(data.subarray(i, i + 13));
      expect(h.digest()).toBe(expected);
      expect(h.digest()).toBe(expected);
    }
  }
});
it("accepts documented key separators, rejects wrong length and never truncates", () => {
  expect(
    parseSipHashKey("  0X00:01-02_03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f "),
  ).toEqual(parseSipHashKey(EXAMPLE_KEY));
  for (const s of [
    "",
    `${EXAMPLE_KEY}00`,
    EXAMPLE_KEY.slice(2),
    "z".repeat(32),
    " ".repeat(4097),
  ])
    expect(() => parseSipHashKey(s)).toThrow("invalid_key");
});
it("keeps state across digest snapshots and implements standard128 initialization", () => {
  const h = createSipHash("SipHash-128-2-4", parseSipHashKey(EXAMPLE_KEY));
  expect(h.digest()).toBe(vectors[0]?.sip128);
  for (let i = 0; i < 63; i++) {
    h.update(new Uint8Array([i]));
    h.digest();
  }
  expect(h.digest()).toBe(
    vectors.find((v) => v.key === EXAMPLE_KEY && v.length === 63)?.sip128,
  );
  expect(
    createSipHash("SipHash-2-4", parseSipHashKey(EXAMPLE_KEY)).digest(),
  ).toBe("726fdb47dd0e0e31");
});

it("validates algorithms and keys before creating a session", () => {
  expect(() =>
    createSipHash("invalid" as SipHashAlgorithm, new Uint8Array(16)),
  ).toThrow(SipHashKeyError);
  for (const length of [0, 15, 17])
    expect(() => createSipHash("SipHash-2-4", new Uint8Array(length))).toThrow(
      SipHashKeyError,
    );
});
it("produces binary snapshots without consuming state and respects input views", () => {
  const key = parseSipHashKey(EXAMPLE_KEY);
  const backing = new Uint8Array(18);
  backing.set(key, 1);
  for (const algorithm of ["SipHash-2-4", "SipHash-128-2-4"] as const) {
    const hash = createSipHash(algorithm, backing.subarray(1, 17));
    hash.update(new Uint8Array([0]));
    hash.update(new Uint8Array());
    const data = new Uint8Array([255, 1, 2, 3, 255]);
    hash.update(data.subarray(1, 4));
    // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
    const expected = vectors.find(
      (v) => v.key === EXAMPLE_KEY && v.length === 4,
    )!;
    const hex = algorithm === "SipHash-2-4" ? expected.sip64 : expected.sip128;
    const bytes = hash.digest("binary");
    expect(Buffer.from(bytes).toString("hex")).toBe(hex);
    bytes.fill(0);
    expect(hash.digest()).toBe(hex);
  }
});
it("generates a key accepted by both algorithm variants using native randomness", () => {
  const key = randomSipHashKey();
  expect(key).toMatch(/^[0-9a-f]{32}$/);
  expect(parseSipHashKey(key)).toHaveLength(16);
  expect(
    createSipHash("SipHash-2-4", parseSipHashKey(key)).digest(),
  ).toHaveLength(16);
  expect(
    createSipHash("SipHash-128-2-4", parseSipHashKey(key)).digest(),
  ).toHaveLength(32);
});
