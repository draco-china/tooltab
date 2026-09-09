import { expect, it } from "vitest";
import { validateCard } from "../../src/validation/card";

it("validates formatted Visa and exposes all details", () => {
  const result = validateCard("4111 1111-1111 1111");
  expect(result).toMatchObject({
    normalized: "4111111111111111",
    valid: true,
    checks: { format: true, length: true, brand: true, checksum: true },
    details: {
      length: 16,
      brand: "Visa",
      candidates: "Visa",
      expectedLengths: "16, 18, 19",
      cvcLength: 3,
      formatted: "4111 1111 1111 1111",
    },
  });
});

it("reports checksum, format, and length failures", () => {
  expect(validateCard("4111111111111112").checks.checksum).toBe(false);
  expect(validateCard("4111111111111112").valid).toBe(false);
  expect(validateCard("4111x111")).toMatchObject({
    valid: false,
    checks: { format: false, length: false, brand: false, checksum: false },
    details: {
      candidates: null,
      brand: null,
      expectedLengths: null,
      cvcLength: null,
    },
  });
  expect(validateCard("411111111111111").checks.length).toBe(false);
});

it("preserves American Express gaps and code length", () => {
  expect(validateCard("378282246310005").details).toMatchObject({
    brand: "American Express",
    formatted: "3782 822463 10005",
    cvcLength: 4,
    expectedLengths: "15",
  });
});

it("handles unknown prefixes and input limits", () => {
  const unknown = validateCard("9111111111111111");
  expect(unknown).toMatchObject({
    valid: false,
    checks: { format: true, length: false, brand: false, checksum: false },
    details: {
      brand: null,
      candidates: null,
      expectedLengths: null,
      cvcLength: null,
    },
  });
  expect(() => validateCard("1".repeat(257))).toThrow("input-too-large");
});
