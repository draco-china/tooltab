import { expect, it } from "vitest";
import {
  getImeiCheckDigit,
  normalizeImei,
  validateImei,
} from "../../src/validation/imei";

it("normalizes spaces and hyphens while preserving other characters", () => {
  expect(normalizeImei("49 015420-3237518")).toBe("490154203237518");
  expect(normalizeImei(" 123\t456 ")).toBe("123456");
  expect(() => normalizeImei("x".repeat(257))).toThrow("input-too-large");
});

it("calculates a check digit only for a numeric 14-digit core", () => {
  expect(getImeiCheckDigit("49015420323751")).toBe("8");
  expect(getImeiCheckDigit("00000000000000")).toBe("0");
  expect(getImeiCheckDigit("4901542032375A")).toBeNull();
  expect(getImeiCheckDigit("4901542032375")).toBeNull();
});

it("returns the complete result for a valid IMEI", () => {
  expect(validateImei("49 015420-3237518")).toMatchObject({
    raw: "49 015420-3237518",
    normalized: "490154203237518",
    length: 15,
    tac: "49015420",
    serialNumber: "323751",
    expectedCheckDigit: "8",
    actualCheckDigit: "8",
    isLengthValid: true,
    isFormatValid: true,
    isChecksumValid: true,
    isValid: true,
    reason: "valid",
  });
});

it("distinguishes empty, format, length, and checksum failures", () => {
  expect(validateImei("")).toMatchObject({
    tac: null,
    serialNumber: null,
    expectedCheckDigit: null,
    actualCheckDigit: null,
    reason: "empty",
  });
  expect(validateImei("4901542032375A8")).toMatchObject({
    isLengthValid: true,
    isFormatValid: false,
    tac: null,
    serialNumber: null,
    expectedCheckDigit: null,
    actualCheckDigit: null,
    reason: "invalid-format",
  });
  expect(validateImei("49015420323751")).toMatchObject({
    isLengthValid: false,
    isFormatValid: true,
    tac: "49015420",
    serialNumber: "323751",
    expectedCheckDigit: "8",
    actualCheckDigit: null,
    reason: "invalid-length",
  });
  expect(validateImei("490154203237519")).toMatchObject({
    isLengthValid: true,
    isChecksumValid: false,
    actualCheckDigit: "9",
    reason: "invalid-checksum",
  });
});

it("keeps partial numeric fields available at their boundaries", () => {
  expect(validateImei("1234567")).toMatchObject({
    tac: null,
    serialNumber: null,
    expectedCheckDigit: null,
    actualCheckDigit: null,
    reason: "invalid-length",
  });
  expect(validateImei("12345678")).toMatchObject({
    tac: "12345678",
    serialNumber: null,
    expectedCheckDigit: null,
    actualCheckDigit: null,
    reason: "invalid-length",
  });
  expect(validateImei("12345678901234")).toMatchObject({
    tac: "12345678",
    serialNumber: "901234",
    expectedCheckDigit: "7",
    actualCheckDigit: null,
    reason: "invalid-length",
  });
});
