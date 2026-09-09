import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BASE58_ALPHABETS,
  BaseEncodingError,
  decodeBase,
  encodeBase,
  MAX_BASE_BYTES,
} from "../../src/encoding/base";

const bitcoinVectors = [
  ["", ""],
  ["61", "2g"],
  ["626262", "a3gV"],
  ["636363", "aPEr"],
  ["73696d706c792061206c6f6e6720737472696e67", "2cFupjhnEsSn59qHXstmK2ffpLv2"],
  [
    "00eb15231dfceb60925886b67d065299925915aeb172c06647",
    "1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L",
  ],
  ["516b6fcd0f", "ABnLTmg"],
  ["bf4f89001e670274dd", "3SEo3LWLoPntC"],
  ["572e4794", "3EFU7m"],
  ["ecac89cad93923c02321", "EJDM8drfXA6uyA"],
  ["10c8511e", "Rt5zm"],
  ["00000000000000000000", "1111111111"],
  [
    "00000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "1111111111111111111111111111111111111111",
  ],
  [
    "00000000000000000000000000000000000000000000000000000000000000000000000000000001",
    "1111111111111111111111111111111111111112",
  ],
  [
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ec39d04c37e71e5d591881f6",
    "111111111111111111111111111111111111111111111111111111111111111111111111111111111111115TYzLYH1udmLdzCLM",
  ],
  [
    "000111d38e5fc9071ffcd20b4a763cc9ae4f252bb4e48fd66a835e252ada93ff480d6dd43dc62a641155a5",
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  ],
  [
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9fa0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff",
    "1cWB5HCBdLjAuqGGReWE3R3CguuwSjw6RHn39s2yuDRTS5NsBgNiFpWgAnEx6VQi8csexkgYw3mdYrMHr8x9i7aEwP8kZ7vccXWqKDvGv3u1GxFKPuAkn8JCPPGDMf3vMMnbzm6Nh9zh1gcNsMvH3ZNLmP5fSG6DGbbi2tuwMWPthr4boWwCxf7ewSgNQeacyozhKDDQQ1qL5fQFUW52QKUZDZ5fw3KXNQJMcNTcaB723LchjeKun7MuGW5qyCBZYzA1KjofN1gYBV3NqyhQJ3Ns746GNuf9N2pQPmHz4xpnSrrfCvy6TVVz5d4PdrjeshsWQwpZsZGzvbdAdN8MKV5QsBDY",
  ],
  ["271F359E", "zzzzy"],
  ["271F359F", "zzzzz"],
  ["271F35A0", "211111"],
  ["271F35A1", "211112"],
];
const asciiVectors = [
  { input: "", encoded: "" },
  { input: "", encoded: "" },
  { input: "00", encoded: "!!" },
  { input: "11", encoded: "&H" },
  { input: "0000", encoded: "!!!" },
  { input: "1146", encoded: "&Ol" },
  { input: "000000", encoded: "!!!!" },
  { input: "11467b", encoded: "&Oq*" },
  { input: "00000000", encoded: "z" },
  { input: "11467bb0", encoded: "&Oq,O" },
  { input: "0000000000", encoded: "z!!" },
  { input: "11467bb0e5", encoded: "&Oq,OjT" },
  { input: "000000000000", encoded: "z!!!" },
  { input: "11467bb0e51a", encoded: "&Oq,OjVe" },
  { input: "00000000000000", encoded: "z!!!!" },
  { input: "11467bb0e51a4f", encoded: "&Oq,OjVgn" },
  { input: "0000000000000000", encoded: "zz" },
  { input: "11467bb0e51a4f84", encoded: "&Oq,OjVgpJ" },
];
const fromHex = (value: string) => new Uint8Array(Buffer.from(value, "hex"));
describe("extended base encodings", () => {
  it("snapshots async bytes and alphabet before callers can mutate them", async () => {
    const bytes = fromHex("61");
    const options: { alphabet: "bitcoin" | "flickr" } = { alphabet: "bitcoin" };
    const encoded = encodeBase(bytes, "base58", true, options);
    const decoded = decodeBase("2g", "base58", options);
    bytes.fill(0);
    options.alphabet = "flickr";
    expect(await encoded).toBe("2g");
    expect(await decoded).toEqual(fromHex("61"));
  });
  it.each(bitcoinVectors)(
    "matches Bitcoin official vector %s",
    async (hex, encoded) => {
      for (const alphabet of ["bitcoin", "flickr", "ripple"] as const) {
        const expected = Array.from(
          encoded,
          (char) =>
            BASE58_ALPHABETS[alphabet][BASE58_ALPHABETS.bitcoin.indexOf(char)],
        ).join("");
        expect(
          await encodeBase(fromHex(hex), "base58", true, { alphabet }),
        ).toBe(expected);
        expect(await decodeBase(expected, "base58", { alphabet })).toEqual(
          fromHex(hex),
        );
      }
    },
  );
  it.each(asciiVectors)(
    "matches independent ASCII85 bytes=$input",
    ({ input, encoded }) => {
      expect(encodeBase(fromHex(input), "base85")).toBe(encoded);
      expect(decodeBase(encoded, "base85")).toEqual(fromHex(input));
      expect(decodeBase(`<~${encoded}~>`, "base85")).toEqual(fromHex(input));
    },
  );
  it("matches the ZeroMQ Z85 official HelloWorld vector", () => {
    const bytes = fromHex("864fd26fb559f75b");
    expect(encodeBase(bytes, "base85", true, { variant: "z85" })).toBe(
      "HelloWorld",
    );
    expect(decodeBase("HelloWorld", "base85", { variant: "z85" })).toEqual(
      bytes,
    );
  });
  it.each(["0", "O", "I", "l", "😀"])(
    "rejects forbidden Base58 characters %s",
    async (value) => {
      await expect(decodeBase(value, "base58")).rejects.toThrow(
        new BaseEncodingError("invalid-encoding"),
      );
    },
  );
  it.each(["!", "!z", "<~!!!!", "!!!!~>", "<~uuuuu~>", "uuuuu", 's8W-"', "y"])(
    "rejects malformed ASCII85 and overflows %s",
    (value) => {
      expect(() => decodeBase(value, "base85")).toThrow(
        new BaseEncodingError("invalid-encoding"),
      );
    },
  );
  it("checks Z85 group size, alphabet and unsigned 32-bit overflow", () => {
    for (const value of ["1234", "#####", "~~~~~"])
      expect(() => decodeBase(value, "base85", { variant: "z85" })).toThrow();
    expect(() =>
      encodeBase(new Uint8Array(3), "base85", true, { variant: "z85" }),
    ).toThrow();
    const max = new Uint8Array(4).fill(255);
    expect(
      decodeBase(
        encodeBase(max, "base85", true, { variant: "z85" }),
        "base85",
        { variant: "z85" },
      ),
    ).toEqual(max);
  });
  it("preserves leading zeroes, whitespace and each case-sensitive alphabet", async () => {
    for (const alphabet of ["bitcoin", "flickr", "ripple"] as const) {
      const bytes = new Uint8Array([0, 0, 0, 255]);
      const text = await encodeBase(bytes, "base58", true, { alphabet });
      expect(text.startsWith(BASE58_ALPHABETS[alphabet][0].repeat(3))).toBe(
        true,
      );
      expect(await decodeBase(` \n${text}\t`, "base58", { alphabet })).toEqual(
        bytes,
      );
    }
  });
  it.each([
    ["all-zero", "bitcoin"],
    ["all-FF", "bitcoin"],
    ["random", "bitcoin"],
    ["random", "flickr"],
    ["random", "ripple"],
  ] as const)(
    "round-trips 1 MiB %s input with the %s alphabet",
    async (pattern, alphabet) => {
      const bytes =
        pattern === "random"
          ? new Uint8Array(randomBytes(MAX_BASE_BYTES))
          : new Uint8Array(MAX_BASE_BYTES).fill(pattern === "all-FF" ? 255 : 0);
      const encoded = await encodeBase(bytes, "base58", true, { alphabet });
      expect(await decodeBase(encoded, "base58", { alphabet })).toEqual(bytes);
    },
    15000,
  );
  it("enforces decoded capacity including shorthand expansion and leading zeroes", async () => {
    await expect(
      decodeBase("1".repeat(MAX_BASE_BYTES + 1), "base58"),
    ).rejects.toThrow(new BaseEncodingError("too-large"));
    expect(() =>
      decodeBase("z".repeat(MAX_BASE_BYTES / 4 + 1), "base85"),
    ).toThrow(new BaseEncodingError("too-large"));
  });
});
