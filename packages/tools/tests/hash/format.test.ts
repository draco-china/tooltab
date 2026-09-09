import { expect, it } from "vitest";
import { formatHash, type HashFormat } from "../../src/hash/format";

it.each([
  ["hex", "000180ff", ""],
  ["base64", "AAGA/w==", ""],
  ["decimal", "98559", "0"],
  ["binary", "00000000000000011000000011111111", ""],
] as const)(
  "formats %s with leading zeros and empty input",
  (format, expected, empty) => {
    expect(formatHash(Uint8Array.of(0, 1, 128, 255), format)).toBe(expected);
    expect(formatHash(new Uint8Array(), format)).toBe(empty);
  },
);
it("matches native reference encodings for every byte and preserves sliced input", () => {
  const backing = Uint8Array.from({ length: 258 }, (_, i) => (i - 1) & 255);
  const bytes = backing.subarray(1, 257);
  const before = bytes.slice();
  const buffer = Buffer.from(bytes);
  const hex = buffer.toString("hex");
  const expected: Record<HashFormat, string> = {
    hex,
    base64: buffer.toString("base64"),
    decimal: BigInt(`0x${hex}`).toString(),
    binary: BigInt(`0x${hex}`)
      .toString(2)
      .padStart(bytes.length * 8, "0"),
  };
  for (const format of ["hex", "base64", "decimal", "binary"] as const)
    expect(formatHash(bytes, format)).toBe(expected[format]);
  expect(bytes).toEqual(before);
});

it.each([8191, 8192, 8193, 262145])(
  "encodes %i bytes without exceeding argument limits",
  (length) => {
    const bytes = Uint8Array.from({ length }, (_, i) => i % 251);
    expect(formatHash(bytes, "base64")).toBe(
      Buffer.from(bytes).toString("base64"),
    );
  },
);
