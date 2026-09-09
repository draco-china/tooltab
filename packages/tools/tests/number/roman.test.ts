import { expect, it } from "vitest";
import {
  fromRoman,
  RomanNumeralConversionError,
  toRoman,
} from "../../src/number/roman";

it("round trips every representable Roman integer", () => {
  for (let n = 1; n <= 3999; n += 1)
    expect(fromRoman(toRoman(String(n)))).toBe(String(n));
});

it("handles canonical examples and lowercase input", () => {
  expect(toRoman("2024")).toBe("MMXXIV");
  expect(fromRoman("MCMXCIX")).toBe("1999");
  expect(fromRoman("mmxxiv")).toBe("2024");
});

it("rejects invalid integer formats and ranges", () => {
  for (const input of ["", " ", "+1", "-1", "1.0", "1\n", "x", "1".repeat(33)])
    expect(() => toRoman(input)).toThrow("invalid_integer");
  for (const input of ["0", "4000", "9".repeat(32)])
    expect(() => toRoman(input)).toThrow("roman_range");
});

it("rejects malformed Roman forms, including trailing newlines", () => {
  for (const input of [
    "",
    "IIII",
    "VV",
    "IL",
    "IC",
    "MMMM",
    "X\n",
    "X\u2028",
    "X\u2029",
    "ABC",
    "I".repeat(16),
  ])
    expect(() => fromRoman(input)).toThrow(RomanNumeralConversionError);
});
