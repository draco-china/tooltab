import { expect, it } from "vitest";
import {
  convertBase,
  MAX_BASE_BITS,
  MAX_BASE_INPUT,
  NumberBaseConversionError,
} from "../../src/number/base";

it("converts across common bases and preserves signs/zero", () => {
  expect(convertBase("ff", 16, 10)).toBe("255");
  expect(convertBase("-101", 2, 16)).toBe("-5");
  expect(convertBase("0", 10, 64)).toBe("0");
  expect(convertBase("000", 10, 2)).toBe("0");
});

it("supports numeric and standard base64 alphabets", () => {
  expect(convertBase("+/", 64, 10, false)).toBe("4031");
  expect(convertBase("+z", 64, 10, true)).toBe("4019");
  expect(convertBase("+/", 64, 10, true)).toBe("4031");
  expect(convertBase("4019", 10, 64, false, true)).toBe("+z");
  expect(convertBase("+/", 64, 64, true, true)).toBe("+/");
  expect(() => convertBase("10", 10, 10, true)).toThrow("invalid_base");
  expect(() => convertBase("10", 64, 10, false, true)).toThrow("invalid_base");
});

it("validates bases, digits, empty input, and capacity in order", () => {
  for (const base of [0, 1, 65, 2.5, NaN]) {
    expect(() => convertBase("1", base, 10)).toThrow(NumberBaseConversionError);
  }
  expect(() => convertBase("", 10, 2)).toThrow("invalid_integer");
  expect(() => convertBase("-", 10, 2)).toThrow("invalid_integer");
  expect(() => convertBase("2", 2, 10)).toThrow("invalid_integer");
  expect(() => convertBase("1\n", 10, 2)).toThrow("invalid_integer");
  expect(() => convertBase("x".repeat(MAX_BASE_INPUT + 1), 10, 2)).toThrow(
    "too_large",
  );
  expect(() => convertBase(`1${"0".repeat(MAX_BASE_BITS)}`, 2, 10)).toThrow(
    "too_large",
  );
  expect(convertBase(`1${"0".repeat(MAX_BASE_BITS - 1)}`, 2, 10)).toMatch(
    /^\d+$/,
  );
});

it("accepts case-insensitive digits only below base 36", () => {
  expect(convertBase("Ab", 16, 10)).toBe("171");
  expect(convertBase("Z", 36, 10)).toBe("35");
  expect(() => convertBase("{", 64, 10)).toThrow("invalid_integer");
});
