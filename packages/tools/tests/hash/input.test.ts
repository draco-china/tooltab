import { Md5HashError } from "../../src/hash/md5";
import { Ripemd160HashError } from "../../src/hash/ripemd160";
import { describe, expect, it } from "vitest";
import {
  CHUNK_BYTES,
  MAX_BYTES,
  MAX_TEXT,
  StreamHashError,
  textBytes,
  validateHashByteLength,
} from "../../src/hash/input";

describe("bounded hash input core", () => {
  it("keeps the shared capacity constants stable", () => {
    expect(MAX_BYTES).toBe(1024 ** 4);
    expect(MAX_TEXT).toBe(16 * 1024 * 1024);
    expect(CHUNK_BYTES).toBe(256 * 1024);
  });

  it("encodes valid UTF-8 without normalization", () => {
    expect(textBytes("😀")).toEqual(new Uint8Array([240, 159, 152, 128]));
    expect(textBytes("e\u0301")).not.toEqual(textBytes("é"));
  });

  it("rejects malformed UTF-16 instead of replacing it", () => {
    for (const text of ["\ud800", "\udfff", "a\ud800b"])
      expect(() => textBytes(text)).toThrow(
        expect.objectContaining({ code: "invalid_input" }),
      );
  });

  it("checks both source and encoded-text capacity", () => {
    expect(textBytes("a".repeat(MAX_TEXT))).toHaveLength(MAX_TEXT);
    expect(() => textBytes("a".repeat(MAX_TEXT + 1))).toThrow(
      expect.objectContaining({ code: "too_large" }),
    );
    expect(() => textBytes("é".repeat(MAX_TEXT / 2 + 1))).toThrow(
      expect.objectContaining({ code: "too_large" }),
    );
  });

  it("keeps stream error code and name available to callers", () => {
    const error = new StreamHashError("timeout");
    expect(error).toMatchObject({ name: "StreamHashError", code: "timeout" });
    expect(error.message).toBe("timeout");
  });
});

it("validates cumulative byte counts without allocating the message", () => {
  for (const length of [0, 1, 2 ** 32, MAX_BYTES - 1, MAX_BYTES])
    expect(validateHashByteLength(length)).toBe(length);
  for (const length of [
    -1,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    MAX_BYTES + 1,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    expect(() => validateHashByteLength(length)).toThrow(
      new Error("too_large"),
    );
});

it.each([Md5HashError, Ripemd160HashError, StreamHashError])(
  "preserves the requested domain error for cumulative capacity validation",
  (ErrorType) => {
    expect(validateHashByteLength(MAX_BYTES, ErrorType)).toBe(MAX_BYTES);
    try {
      validateHashByteLength(MAX_BYTES + 1, ErrorType);
      expect.fail("oversized count must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorType);
      expect(error).toMatchObject({ code: "too_large", message: "too_large" });
    }
  },
);
