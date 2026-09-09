import { expect, it } from "vitest";
import {
  assertSafeIntegers,
  base64,
  bounded,
  fromBase64,
  fromUrl64,
  JoseToolError,
  jsonObject,
  MAX_JOSE_INPUT,
  object,
  parseJson,
  url64,
  utf8,
} from "../../src/crypto/jose-common";

it("preserves canonical binary encodings including empty input and chunk boundaries", () => {
  for (const size of [0, 1, 2, 3, 256, 8192, 8193, 16385]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 256);
    const expected = Buffer.from(bytes).toString("base64");
    expect(base64(bytes)).toBe(expected);
    expect(fromBase64(expected)).toEqual(bytes);
    expect(fromBase64(` \n${expected}\t`)).toEqual(bytes);
    const encoded = Buffer.from(bytes).toString("base64url");
    expect(url64(bytes)).toBe(encoded);
    expect(fromUrl64(encoded)).toEqual(bytes);
  }
});

it("rejects malformed and noncanonical base64 spellings", () => {
  for (const value of ["*", "A", "Zg", "Zg=", "Zg===", "Zh==", "Zm9=", "AA-A"])
    expect(() => fromBase64(value)).toThrow("invalid_base64");
  for (const value of ["A", "+w", "/w", "Zg==", "Zh", "Zm9", " Zg"])
    expect(() => fromUrl64(value)).toThrow("invalid_base64");
});

it("validates UTF-8 and string byte limits without rejecting supplementary characters", () => {
  expect(utf8(new TextEncoder().encode("中文 😀"))).toBe("中文 😀");
  expect(() => utf8(Uint8Array.of(0xc0, 0xaf))).toThrow("invalid_unicode");
  expect(bounded("😀", 4)).toBe("😀");
  expect(bounded("abc", 3)).toBe("abc");
  expect(() => bounded("abcd", 3)).toThrow("too_large");
  expect(() => bounded("中文", 5)).toThrow("too_large");
  expect(() => bounded("\ud800")).toThrow("invalid_unicode");
  expect(bounded("a".repeat(MAX_JOSE_INPUT))).toHaveLength(MAX_JOSE_INPUT);
  expect(() => bounded("a".repeat(MAX_JOSE_INPUT + 1))).toThrow(JoseToolError);
});

it("parses bounded JSON objects and respects braces inside quoted strings", () => {
  expect(object({})).toBe(true);
  for (const value of [null, [], 1, "text", false, undefined])
    expect(object(value)).toBe(false);
  expect(parseJson("3")).toBe(3);
  expect(jsonObject('{"nested":{"text":"[{}]\\""},"items":[]}')).toEqual({
    nested: { text: '[{}]"' },
    items: [],
  });
  expect(parseJson(`${"[".repeat(64)}0${"]".repeat(64)}`)).toBeInstanceOf(
    Array,
  );
  expect(() => parseJson(`${"[".repeat(65)}0${"]".repeat(65)}`)).toThrow(
    "too_deep",
  );
  for (const value of ["", " ", "{", '{"a":}', "}"])
    expect(() => parseJson(value)).toThrow("invalid_json");
  for (const value of ["null", "[]", "1", '"hello"'])
    expect(() => jsonObject(value)).toThrow("object_required");
});

it("rejects unsafe numeric tokens while leaving quoted numbers and finite fractions intact", () => {
  for (const value of [
    "",
    "{}",
    '"999999999999999999999"',
    "9007199254740991",
    "-9007199254740991",
    "0.125",
    "1e-6",
  ])
    expect(() => assertSafeIntegers(value)).not.toThrow();
  for (const value of [
    "9007199254740992",
    "-9007199254740992",
    "1e999",
    "-1e999",
  ])
    expect(() => assertSafeIntegers(value)).toThrow("unsafe_number");
});

it("accepts only canonical padding bits across every two-character base64url token", () => {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let canonical = 0;
  for (const first of alphabet) {
    for (const second of alphabet) {
      const input = first + second;
      const expected = Buffer.from(input, "base64url");
      if (expected.toString("base64url") === input) {
        expect(fromUrl64(input)).toEqual(new Uint8Array(expected));
        canonical++;
      } else {
        expect(() => fromUrl64(input)).toThrow("invalid_base64");
      }
    }
  }
  expect(canonical).toBe(256);
});

it("maps an unavailable platform Base64 decoder to the public decode error", () => {
  // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "atob")!;
  try {
    Object.defineProperty(globalThis, "atob", {
      configurable: true,
      value: undefined,
    });
    expect(() => fromUrl64("YQ")).toThrow("invalid_base64");
  } finally {
    Object.defineProperty(globalThis, "atob", descriptor);
  }
  expect(fromUrl64("YQ")).toEqual(new Uint8Array([97]));
});
