import { expect, it } from "vitest";
import {
  escapeUnicode,
  MAX_CODEC_TEXT,
  UNICODE_FORMATS,
  unescapeUnicode,
} from "../../src/encoding/unicode";

it("roundtrips every supported Unicode representation", () => {
  const input = "ABC 世界 😀 \\u1234 100% &#32; U+0041 0x1234";
  for (const format of UNICODE_FORMATS) {
    expect(unescapeUnicode(escapeUnicode(input, format)), format).toBe(input);
  }
});

it("decodes mixed escapes and rejects malformed scalars", () => {
  expect(unescapeUnicode("\\u0041\\u{42}&#67;&#x44;\\U00000045%46\\x47")).toBe(
    "ABCDEFG",
  );
  for (const value of ["\\uD800", "\\u{110000}", "%FF", "\\u12"]) {
    expect(() => unescapeUnicode(value)).toThrow("invalid_escape");
  }
});

it("enforces Unicode and capacity boundaries", () => {
  expect(() => escapeUnicode("\uD800")).toThrow("invalid_unicode");
  expect(() => escapeUnicode("a".repeat(MAX_CODEC_TEXT + 1))).toThrow(
    "too_large",
  );
});

it("matches scalar representations and rejects incomplete or invalid sequences", () => {
  const vectors = {
    utf16: "\\uD83D\\uDE00",
    braced: "\\u{1F600}",
    "html-hex": "&#x1F600;",
    "html-decimal": "&#128512;",
    uplus: "U+1F600",
    hex: "0x1F600",
    python: "\\U0001F600",
    bytes: "\\xF0\\x9F\\x98\\x80",
    percent: "%F0%9F%98%80",
  };
  for (const format of UNICODE_FORMATS)
    expect(escapeUnicode("😀", format)).toBe(vectors[format]);
  expect(() => escapeUnicode("a", "bad" as "utf16")).toThrow("invalid_option");
  for (const input of [
    "\\uDC00",
    "\\uD800\\u0041",
    "\\u{DFFF}",
    "U+110000",
    "&#1114112;",
    "%C0%AF",
    "\\xED\\xA0\\x80",
    "&#x;",
    "0x12",
    "U+12",
    "\\U123",
    "%A",
  ])
    expect(() => unescapeUnicode(input), input).toThrow("invalid_escape");
  expect(() => unescapeUnicode("x".repeat(3_200_001))).toThrow("too_large");
  expect(escapeUnicode("", "uplus")).toBe("");
  expect(unescapeUnicode("%EF%BB%BF")).toBe("\ufeff");
});

it("preserves trailing whitespace outside complete code-point lists", () => {
  for (const suffix of ["\n", "\r", "\r\n", "\u2028", "\u2029", " "])
    expect(unescapeUnicode(`U+0041${suffix}`)).toBe(`A${suffix}`);
  expect(unescapeUnicode("U+0041 U+0042")).toBe("AB");
});
