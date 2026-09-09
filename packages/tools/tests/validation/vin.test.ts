import { describe, expect, it } from "vitest";
import {
  normalizeVin,
  inspectVin,
  validateVin,
} from "../../src/validation/vin";

describe("VIN validation", () => {
  it("normalizes spaces, hyphens, and case", () => {
    expect(normalizeVin("1m8g-dm9a xkp042788")).toBe("1M8GDM9AXKP042788");
  });

  it("handles empty and malformed values", () => {
    expect(validateVin("")).toMatchObject({
      isValid: false,
      isLengthValid: false,
      isCharacterValid: true,
      expectedCheckDigit: null,
      actualCheckDigit: null,
    });
    expect(validateVin("1IOGDM9AXKP042788")).toMatchObject({
      isValid: false,
      isCharacterValid: false,
      expectedCheckDigit: null,
    });
  });

  it("validates known alphabetic and numeric check digits", () => {
    expect(validateVin("1M8GDM9AXKP042788")).toMatchObject({
      isValid: true,
      expectedCheckDigit: "X",
      actualCheckDigit: "X",
    });
    expect(validateVin("11111111111111111")).toMatchObject({
      isValid: true,
      expectedCheckDigit: "1",
      actualCheckDigit: "1",
    });
  });

  it("detects a check digit mismatch", () => {
    expect(validateVin("1M8GDM9A1KP042788")).toMatchObject({
      isValid: false,
      isCheckDigitValid: false,
      expectedCheckDigit: "X",
      actualCheckDigit: "1",
    });
  });
});

it("inspects already-normalized protocol values without Unicode expansion", () => {
  expect(inspectVin("ß1111111111111111")).toMatchObject({
    raw: "ß1111111111111111",
    normalized: "ß1111111111111111",
    isCharacterValid: false,
    isValid: false,
  });
  expect(validateVin(" 11111111111111111 ").raw).toBe(" 11111111111111111 ");
});
