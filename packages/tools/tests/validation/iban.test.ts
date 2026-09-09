import { expect, it } from "vitest";
import {
  IdentifierError,
  ibanCountries,
  normalizeIdentifierInput,
  validateIban,
} from "../../src/validation/iban";

it("normalizes IBAN input and exposes supported country specifications", () => {
  expect(normalizeIdentifierInput("gb82 west-1234 5698 7654 32")).toBe(
    "GB82WEST12345698765432",
  );
  expect(
    ibanCountries.some(({ code, length }) => code === "GB" && length === 22),
  ).toBe(true);
  expect(() => normalizeIdentifierInput("x".repeat(257))).toThrow(
    IdentifierError,
  );
});

it("validates a real IBAN and computes its expected check digits", () => {
  expect(validateIban("GB82 WEST 1234 5698 7654 32")).toMatchObject({
    kind: "iban",
    normalized: "GB82WEST12345698765432",
    valid: true,
    checks: {
      country: true,
      length: true,
      format: true,
      structure: true,
      checksum: true,
      domestic: true,
    },
    details: {
      country: "GB",
      registry: true,
      expectedLength: 22,
      actualLength: 22,
      checkDigits: "82",
      expectedCheckDigits: "82",
      bban: "WEST12345698765432",
      formatted: "GB82 WEST 1234 5698 7654 32",
      sourceVersion: "ibantools 4.5.4",
    },
  });
});

it("rejects checksum and structure failures while retaining diagnostics", () => {
  expect(validateIban("GB82 WEST 1234 5698 7654 33")).toMatchObject({
    valid: false,
    checks: {
      country: true,
      length: true,
      format: true,
      structure: true,
      checksum: false,
      domestic: false,
    },
    details: { expectedCheckDigits: "55", checkDigits: "82", actualLength: 22 },
  });
  const malformed = validateIban(`GB82${"0".repeat(18)}`);
  expect(malformed).toMatchObject({
    valid: false,
    checks: {
      country: true,
      length: true,
      format: true,
      structure: false,
      checksum: false,
    },
    details: { expectedCheckDigits: "18", bban: "0".repeat(18) },
  });
});

it("handles unsupported, empty, and malformed identifiers", () => {
  expect(validateIban("")).toMatchObject({
    valid: false,
    checks: {
      country: false,
      length: false,
      format: false,
      structure: false,
      checksum: false,
      domestic: false,
    },
    details: {
      country: "",
      registry: false,
      expectedLength: null,
      checkDigits: null,
      bban: null,
      expectedCheckDigits: null,
      formatted: "",
    },
  });
  expect(validateIban("ZZ00ABC123")).toMatchObject({
    valid: false,
    checks: { country: false, length: false, format: true, structure: false },
    details: { country: "ZZ", expectedLength: null, expectedCheckDigits: "12" },
  });
  expect(validateIban("GBxx WEST 1234")).toMatchObject({
    valid: false,
    checks: { country: true, format: false, checksum: false },
    details: { checkDigits: "XX", expectedCheckDigits: "50" },
  });
});
