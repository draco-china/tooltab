import { describe, expect, it } from "vitest";
import {
  BaseEncodingError,
  baseBytesText,
  basePreview,
  baseSourceText,
  baseTextBytes,
  decodeBase32,
  decodeBase16,
  decodeBase,
  decodeBase85,
  MAX_BASE_SOURCE_CHARACTERS,
  encodeBase,
  encodeBase32,
  encodeBase85,
  MAX_BASE_BYTES,
} from "../../src/encoding/base";

// RFC 4648 section 10.
const vectors = [
  ["", ""],
  ["f", "MY======"],
  ["fo", "MZXQ===="],
  ["foo", "MZXW6==="],
  ["foob", "MZXW6YQ="],
  ["fooba", "MZXW6YTB"],
  ["foobar", "MZXW6YTBOI======"],
];
describe("Base16 and Base32", () => {
  it.each(vectors)("matches RFC4648 Base32 %s", (plain, encoded) => {
    expect(encodeBase(baseTextBytes(plain), "base32")).toBe(encoded);
    expect(baseBytesText(decodeBase(encoded, "base32"))).toBe(plain);
    expect(
      baseBytesText(
        decodeBase(encoded.replace(/=/g, "").toLowerCase(), "base32"),
      ),
    ).toBe(plain);
  });
  it("encodes hex in uppercase and accepts one prefix, case and ASCII whitespace", () => {
    expect(encodeBase(baseTextBytes("foobar"), "base16")).toBe("666F6F626172");
    expect(
      baseBytesText(decodeBase(" 0x66 6f\n6F\t62\r61 72 ", "base16")),
    ).toBe("foobar");
  });
  it.each([
    "A",
    "M",
    "MY=",
    "MY=======",
    "M=Y=====",
    "MZ======",
    "MZXW7===",
    "MY!",
    "M0======",
    "========",
  ])("rejects malformed Base32 %s", (value) => {
    expect(() => decodeBase(value, "base32")).toThrow(
      new BaseEncodingError("invalid-encoding"),
    );
  });
  it.each(["a", "GG", "0x0x00", "12-34", "1\u00a02"])(
    "rejects malformed hex %s",
    (value) => {
      expect(() => decodeBase(value, "base16")).toThrow(
        new BaseEncodingError("invalid-encoding"),
      );
    },
  );
  it("roundtrips every byte value and Unicode without precision loss", () => {
    for (const kind of ["base16", "base32"] as const) {
      const bytes = Uint8Array.from({ length: 256 }, (_, n) => n);
      expect(decodeBase(encodeBase(bytes, kind), kind)).toEqual(bytes);
      const text = "\uFEFF中文 👨‍👩‍👧‍👦\r\n";
      expect(
        baseBytesText(decodeBase(encodeBase(baseTextBytes(text), kind), kind)),
      ).toBe(text);
    }
  });
  it("detects invalid UTF8 without damaging downloadable bytes", () => {
    const bytes = decodeBase("FF00", "base16");
    expect(basePreview(bytes)).toEqual({
      text: null,
      preview: "",
      truncated: false,
    });
    expect([...bytes]).toEqual([255, 0]);
    expect(() => baseTextBytes("\uD800")).toThrow(
      new BaseEncodingError("invalid-utf8"),
    );
  });
  it("truncates only the visible preview without splitting surrogate pairs", () => {
    const text = "👋".repeat(2001);
    const result = basePreview(baseTextBytes(text));
    expect(result.text).toBe(text);
    expect(result.preview).toBe("👋".repeat(2000));
    expect(result.truncated).toBe(true);
  });
  it("bounds UTF8 and binary bytes", () => {
    expect(() => baseTextBytes("a".repeat(MAX_BASE_BYTES + 1))).toThrow(
      new BaseEncodingError("too-large"),
    );
    expect(() => baseTextBytes("中".repeat(MAX_BASE_BYTES / 3 + 1))).toThrow(
      new BaseEncodingError("too-large"),
    );
    expect(() =>
      encodeBase(new Uint8Array(MAX_BASE_BYTES + 1), "base32"),
    ).toThrow(new BaseEncodingError("too-large"));
    expect(() => decodeBase("00".repeat(MAX_BASE_BYTES + 1), "base16")).toThrow(
      new BaseEncodingError("too-large"),
    );
    expect(() =>
      decodeBase(
        "A".repeat(Math.floor((MAX_BASE_BYTES * 8) / 5) + 3),
        "base32",
      ),
    ).toThrow(new BaseEncodingError("too-large"));
  });

  it("covers source, preview, and option boundaries", () => {
    expect(baseSourceText(new Uint8Array([102, 111, 111]))).toBe("foo");
    expect(() =>
      baseSourceText(new Uint8Array(4 * MAX_BASE_BYTES + 1)),
    ).toThrow(new BaseEncodingError("too-large"));
    expect(() =>
      decodeBase("x".repeat(4 * MAX_BASE_BYTES + 1), "base16"),
    ).toThrow(new BaseEncodingError("too-large"));
    expect(() => basePreview(new Uint8Array(MAX_BASE_BYTES + 1))).toThrow(
      new BaseEncodingError("too-large"),
    );
    expect(() =>
      encodeBase(new Uint8Array([1]), "base85", true, {
        variant: "invalid" as never,
      }),
    ).toThrow(new BaseEncodingError("invalid-encoding"));
    expect(() =>
      decodeBase("!!", "base85", { variant: "invalid" as never }),
    ).toThrow(new BaseEncodingError("invalid-encoding"));
    expect(() =>
      decodeBase("z".repeat(MAX_BASE_BYTES / 4 + 1), "base85"),
    ).toThrow(new BaseEncodingError("too-large"));
    expect(() =>
      decodeBase("!".repeat((Math.ceil(MAX_BASE_BYTES / 4) + 1) * 5), "base85"),
    ).toThrow(new BaseEncodingError("too-large"));
  });

  it("exposes the unbounded Base32 primitive for app adapters", () => {
    const bytes = new Uint8Array(MAX_BASE_BYTES + 1);
    const encoded = encodeBase32(bytes);
    expect(decodeBase32(encoded)).toEqual(bytes);
    expect(encodeBase32(bytes, false)).not.toContain("=");
    expect(() =>
      decodeBase(
        `!${"A".repeat(Math.floor((MAX_BASE_BYTES * 8) / 5) + 3)}`,
        "base32",
      ),
    ).toThrow(new BaseEncodingError("invalid-encoding"));
    expect(() =>
      decodeBase(
        `A=${"A".repeat(Math.floor((MAX_BASE_BYTES * 8) / 5) + 3)}`,
        "base32",
      ),
    ).toThrow(new BaseEncodingError("invalid-encoding"));
  });
});

it("encodes Base85 directly without the bounded generic adapter limit", () => {
  expect(encodeBase85(new Uint8Array())).toBe("");
  expect(
    encodeBase85(
      Uint8Array.of(0x86, 0x4f, 0xd2, 0x6f, 0xb5, 0x59, 0xf7, 0x5b),
      { variant: "z85" },
    ),
  ).toBe("HelloWorld");
  expect(encodeBase85(new Uint8Array(MAX_BASE_BYTES + 4))).toBe(
    "z".repeat((MAX_BASE_BYTES + 4) / 4),
  );
  expect(() =>
    encodeBase(new Uint8Array(MAX_BASE_BYTES + 4), "base85"),
  ).toThrow(new BaseEncodingError("too-large"));
  expect(() => encodeBase85(Uint8Array.of(1), { variant: "z85" })).toThrow(
    new BaseEncodingError("invalid-encoding"),
  );
});

it("retains detailed Base85 failures alongside the generic error contract", () => {
  expect(decodeBase85("z")).toEqual(new Uint8Array(4));
  for (const [input, message] of [
    ["<~", "Invalid Base85 delimiter"],
    ["!", "Invalid Base85 length"],
    ["v", "Invalid Base85 character"],
    ["uuuuu", "Invalid Base85 value"],
    [" ".repeat(MAX_BASE_SOURCE_CHARACTERS + 1), "Base85 input is too large"],
    ["z".repeat(MAX_BASE_BYTES / 4 + 1), "Decoded Base85 output is too large"],
  ]) {
    expect(() => decodeBase85(input)).toThrow(message);
    expect(() => decodeBase(input, "base85")).toThrow(
      new BaseEncodingError(
        message.includes("too large") ? "too-large" : "invalid-encoding",
      ),
    );
  }
  expect(() => decodeBase(123 as unknown as string, "base85")).toThrow(
    TypeError,
  );
});

it("direct Base16 decoding retains byte values and webpage capacity independently of protocol limits", () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
  expect(decodeBase16(encodeBase(bytes, "base16"))).toEqual(bytes);
  expect(decodeBase16(" 0x66 6f\n6F\t62\r61 72 ")).toEqual(
    new TextEncoder().encode("foobar"),
  );
  expect(decodeBase16("0x")).toEqual(new Uint8Array());
  expect(() => decodeBase16("0x0")).toThrow("invalid-encoding");
  expect(() => decodeBase16("gg")).toThrow("invalid-encoding");
  const large = "ab".repeat(MAX_BASE_BYTES + 1);
  const decoded = decodeBase16(large);
  expect(decoded.length).toBe(MAX_BASE_BYTES + 1);
  expect(decoded.every((byte) => byte === 0xab)).toBe(true);
  expect(() => decodeBase(large, "base16")).toThrow("too-large");
});
