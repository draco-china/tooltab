import { describe, expect, it } from "vitest";
import {
  Base64Error,
  decodeBase64,
  decodeBase64Text,
  encodeBase64,
  encodeBase64Text,
  isValidBase64,
  MAX_BASE64_CHARACTERS,
  MAX_BASE64_INPUT_CHARACTERS,
  MAX_BASE64_TEXT_BYTES,
  normalizeBase64Input,
} from "../../src/encoding/base64";

describe("UTF-8 Base64", () => {
  it.each([
    ["", ""],
    ["f", "Zg=="],
    ["fo", "Zm8="],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg=="],
    ["fooba", "Zm9vYmE="],
    ["foobar", "Zm9vYmFy"],
  ])("uses the RFC 4648 vector %s", (plain, encoded) => {
    expect(encodeBase64Text(plain)).toBe(encoded);
    expect(decodeBase64Text(encoded)).toBe(plain);
  });

  it.each(["中文 👋 مرحبا", "\uFEFFkeep BOM", "line\n\t\u0000end", "𠮷"])(
    "preserves Unicode and control characters",
    (plain) => {
      expect(decodeBase64Text(encodeBase64Text(plain))).toBe(plain);
    },
  );

  it.each([
    "a",
    "Zg=",
    "Zg===",
    "=Zg=",
    "Zg==x",
    "____",
    "----",
    "Zh==",
    "Zm9=",
    "====",
  ])("rejects malformed or noncanonical Base64 %s", (encoded) => {
    expect(() => decodeBase64Text(encoded)).toThrow(
      new Base64Error("invalid-base64"),
    );
  });

  it.each(["Zm9v\n", "Zm 9v", "\tZm\r\n9v\u00a0", "\uFEFFZm9v"])(
    "accepts pasted whitespace %s",
    (encoded) => expect(decodeBase64Text(encoded)).toBe("foo"),
  );

  it.each([
    ["Zg", "f"],
    ["Zm8", "fo"],
    [" \t\n", ""],
  ])("accepts omitted padding and empty wrapped input %s", (encoded, plain) =>
    expect(decodeBase64Text(encoded)).toBe(plain),
  );

  it.each(["/w==", "wK8=", "7aCA"])("rejects non-UTF-8 bytes %s", (encoded) => {
    expect(() => decodeBase64Text(encoded)).toThrow(
      new Base64Error("invalid-utf8"),
    );
  });

  it("does not replace unpaired surrogates and exposes aliases", () => {
    expect(() => encodeBase64Text("\uD800")).toThrow(
      new Base64Error("invalid-utf8"),
    );
    expect(encodeBase64("hello")).toBe(encodeBase64Text("hello"));
    expect(decodeBase64("aGVsbG8=")).toBe("hello");
    expect(normalizeBase64Input("a b\n c\t")).toBe("abc");
  });

  it("bounds UTF-8 bytes rather than only character count", () => {
    expect(() =>
      encodeBase64Text("中".repeat(Math.floor(MAX_BASE64_TEXT_BYTES / 3) + 1)),
    ).toThrow(new Base64Error("too-large"));
    expect(() =>
      encodeBase64Text("x".repeat(MAX_BASE64_TEXT_BYTES + 1)),
    ).toThrow(new Base64Error("too-large"));
    const limit = "x".repeat(MAX_BASE64_TEXT_BYTES);
    expect(decodeBase64Text(encodeBase64Text(limit))).toBe(limit);
    const overLimit = Buffer.alloc(MAX_BASE64_TEXT_BYTES + 1, 65).toString(
      "base64",
    );
    expect(() => decodeBase64Text(overLimit)).toThrow(
      new Base64Error("too-large"),
    );
    expect(() =>
      decodeBase64Text("A".repeat(MAX_BASE64_CHARACTERS + 1)),
    ).toThrow(new Base64Error("too-large"));
    expect(() =>
      decodeBase64Text("A".repeat(MAX_BASE64_INPUT_CHARACTERS + 1)),
    ).toThrow(new Base64Error("too-large"));
  });

  it("reports valid, blank, and invalid values", () => {
    expect(isValidBase64("SGVsbG8=")).toBe(true);
    expect(isValidBase64("   ")).toBe(true);
    expect(isValidBase64("!!!invalid!!!")).toBe(false);
  });
});
