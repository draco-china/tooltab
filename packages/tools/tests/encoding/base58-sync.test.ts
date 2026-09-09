import { describe, expect, it } from "vitest";
import { BASE58_ALPHABETS } from "../../src/encoding/base";
import {
  decodeBase58,
  resolveBase58AlphabetKey,
} from "../../src/encoding/base58";

function encodeReference(bytes: Uint8Array, alphabet: string): string {
  if (bytes.length === 0) return "";
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);

  let encoded = "";
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = alphabet[remainder] + encoded;
    value /= 58n;
  }

  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) {
    leadingZeroes += 1;
  }
  return alphabet[0].repeat(leadingZeroes) + encoded;
}

describe("synchronous Base58 decoder", () => {
  it.each([
    ["", ""],
    ["f", "2m"],
    ["fo", "8o8"],
    ["foo", "bQbp"],
    ["Hello World", "JxF12TrwUP45BMd"],
  ])("decodes the Bitcoin vector %s", (plain, encoded) => {
    expect(decodeBase58(encoded)).toEqual(new TextEncoder().encode(plain));
  });

  it("handles leading zero bytes and ignores Unicode whitespace", () => {
    expect(decodeBase58("1 1\n\t\u00a0\u2003\ufeff1")).toEqual(
      Uint8Array.from([0, 0, 0]),
    );
    expect(decodeBase58("  JxF12\nTrwUP45BMd ")).toEqual(
      new TextEncoder().encode("Hello World"),
    );
  });

  it.each([
    ["bitcoin", BASE58_ALPHABETS.bitcoin],
    ["flickr", BASE58_ALPHABETS.flickr],
    ["ripple", BASE58_ALPHABETS.ripple],
  ] as const)("decodes all built-in alphabets: %s", (_name, alphabet) => {
    const bytes = Uint8Array.from([0, 0, 1, 2, 42, 127, 255]);
    const encoded = encodeReference(bytes, alphabet);
    expect(decodeBase58(encoded, { alphabet })).toEqual(bytes);
  });

  it("accepts a custom 58-code-unit alphabet and default options", () => {
    const alphabet = [...BASE58_ALPHABETS.bitcoin].reverse().join("");
    const bytes = Uint8Array.from([0, 3, 14, 255]);
    const encoded = encodeReference(bytes, alphabet);
    expect(decodeBase58(encoded, { alphabet })).toEqual(bytes);
    expect(decodeBase58("2m")).toEqual(new TextEncoder().encode("f"));
  });

  it("decodes a substring without interpreting surrounding text", () => {
    const encoded = `prefix:${encodeReference(new Uint8Array([1, 2, 3]), BASE58_ALPHABETS.bitcoin)}:suffix`;
    expect(decodeBase58(encoded.slice(7, -7))).toEqual(
      Uint8Array.from([1, 2, 3]),
    );
  });

  it("resolves known alphabet keys and falls back for unknown values", () => {
    expect(resolveBase58AlphabetKey("bitcoin")).toBe("bitcoin");
    expect(resolveBase58AlphabetKey("flickr")).toBe("flickr");
    expect(resolveBase58AlphabetKey("ripple")).toBe("ripple");
    expect(resolveBase58AlphabetKey("unknown")).toBe("bitcoin");
  });

  it("rejects invalid alphabets and characters with stable errors", () => {
    expect(() => decodeBase58("2m", { alphabet: "short" })).toThrow(
      "Invalid Base58 alphabet",
    );
    expect(() =>
      decodeBase58("2m", {
        alphabet: `${BASE58_ALPHABETS.bitcoin.slice(0, 57)}1`,
      }),
    ).toThrow("Invalid Base58 alphabet");
    expect(() => decodeBase58("0")).toThrow("Invalid Base58 character");
    expect(() =>
      decodeBase58("!", { alphabet: BASE58_ALPHABETS.flickr }),
    ).toThrow("Invalid Base58 character");
  });
});
