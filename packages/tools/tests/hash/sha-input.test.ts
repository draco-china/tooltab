import { expect, it } from "vitest";
import {
  SHA_ALGORITHMS,
  MAX_HASH_TEXT_BYTES,
  ShaHashError,
  hashTextBytes,
  decodeHashTextFile,
  isShakeAlgorithm,
  validateShakeOutputBits,
} from "../../src/hash/sha-input";

it("encodes exact UTF-8 bytes and preserves BOM and valid surrogate pairs", () => {
  for (const text of ["", "abc", "中文😀", "\ufeffabc", "e\u0301"])
    expect(decodeHashTextFile(hashTextBytes(text))).toBe(text);
  for (const text of ["\ud800", "\udfff", "a\ud800b"])
    expect(() => hashTextBytes(text)).toThrow(
      expect.objectContaining({ code: "invalid-text" }),
    );
  expect(() => decodeHashTextFile(Uint8Array.of(0xff))).toThrow(
    expect.objectContaining({ code: "invalid-text" }),
  );
});
it("enforces text capacity in UTF-8 bytes at the exact boundary", () => {
  const text = "a".repeat(MAX_HASH_TEXT_BYTES);
  expect(hashTextBytes(text)).toHaveLength(MAX_HASH_TEXT_BYTES);
  expect(decodeHashTextFile(new Uint8Array(MAX_HASH_TEXT_BYTES))).toHaveLength(
    MAX_HASH_TEXT_BYTES,
  );
  for (const value of [`${text}a`, "é".repeat(MAX_HASH_TEXT_BYTES / 2 + 1)])
    expect(() => hashTextBytes(value)).toThrow(
      expect.objectContaining({ code: "too-large" }),
    );
  expect(() =>
    decodeHashTextFile(new Uint8Array(MAX_HASH_TEXT_BYTES + 1)),
  ).toThrow(expect.objectContaining({ code: "too-large" }));
});
it("identifies SHAKE and validates output bit length", () => {
  for (const algorithm of SHA_ALGORITHMS)
    expect(isShakeAlgorithm(algorithm)).toBe(algorithm.startsWith("SHAKE"));
  for (const bits of [8, 256, 512, 65536])
    expect(validateShakeOutputBits(bits)).toBe(bits);
  for (const bits of [NaN, Infinity, 7, 9, 65544, 8.5])
    expect(() => validateShakeOutputBits(bits)).toThrow(
      expect.objectContaining({ code: "invalid-length" }),
    );
  expect(new ShaHashError("unsupported")).toMatchObject({
    name: "ShaHashError",
    message: "unsupported",
    code: "unsupported",
  });
});
