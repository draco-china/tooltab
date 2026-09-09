import { expect, it } from "vitest";
import { vat, vatChecksum, VAT_PATTERNS } from "../../src/validation/vat";

it("normalizes all 27 country formats and preserves rule metadata", () => {
  const samples: Record<string, string> = {
    AT: "U12345678",
    BE: "0123456789",
    BG: "123456789",
    CY: "12345678A",
    CZ: "12345678",
    DE: "123456789",
    DK: "12345678",
    EE: "123456789",
    EL: "123456789",
    ES: "X1234567L",
    FI: "12345678",
    FR: "AB123456789",
    HR: "12345678901",
    HU: "12345678",
    IE: "1234567A",
    IT: "12345678901",
    LT: "123456789",
    LU: "12345678",
    LV: "12345678901",
    MT: "12345678",
    NL: "123456789B13",
    PL: "1234567890",
    PT: "123456789",
    RO: "1234567890",
    SE: "123456789012",
    SI: "12345678",
    SK: "1234567890",
  };
  expect(Object.keys(VAT_PATTERNS)).toHaveLength(27);
  for (const [country, number] of Object.entries(samples)) {
    const result = vat(`${country} ${number}`);
    expect(result.checks.countryCode, country).toBe(true);
    expect(result.checks.supported, country).toBe(true);
    expect(result.checks.format, country).toBe(true);
    expect(result.details.country).toBe(country);
    expect(result.details.number).toBe(number);
    expect(result.details.pattern).toBe(VAT_PATTERNS[country]?.source);
  }
});

it("matches national construction-rule examples and corrupted checksums", () => {
  for (const value of [
    "ATU10223006",
    "BE0776091951",
    "DE111111125",
    "DK88146328",
    "FI09853608",
    "IT00000010215",
    "NL010000446B01",
    "NL123456789B13",
    "PL5260001246",
    "PT502757191",
    "ES12345678Z",
    "ESJ99216582",
    "FR40303265045",
    "SE556188840401",
  ])
    expect(vat(value).valid, value).toBe(true);
  for (const value of [
    "ATU10223007",
    "BE0776091952",
    "DE111111126",
    "DK88146329",
    "FI09853609",
    "IT00000010216",
    "PL5260001247",
    "PT502757192",
    "ES12345678A",
  ])
    expect(vat(value).valid, value).toBe(false);
});

it("covers special FR, NL, and ES checksum paths", () => {
  expect(vat("FRAB303265045")).toMatchObject({
    valid: true,
    checks: { checksum: null },
    details: { scope: "france" },
  });
  expect(vat("EL123456789").checks.checksum).toBeNull();
  expect(vat("NL123456789B01").checks.checksum).toBe(false);
  expect(vat("NL123456789B99").checks.checksum).toBe(false);
  expect(vatChecksum("ES", "X1234567L")).toBe(true);
  expect(vatChecksum("ES", "Y1234567X")).toBe(true);
  expect(vatChecksum("ES", "A12345678")).toBe(false);
  expect(vatChecksum("ES", "K1000000H")).toBe(true);
  expect(vatChecksum("ES", "A10000008")).toBe(true);
  expect(vatChecksum("ES", "C1000000H")).toBe(true);
  expect(vatChecksum("ES", "Q1234567A")).toBe(false);
  expect(vatChecksum("ES", "I1234567A")).toBe(false);
  expect(vatChecksum("NL", "123456789+35")).toBe(true);
  expect(vatChecksum("NL", "123456789*32")).toBe(true);
  expect(vatChecksum("PT", "1000000100")).toBe(true);
  expect(vatChecksum("ES", "K1234567L")).toBe(false);
  expect(vatChecksum("FR", "AB123456789")).toBe(null);
  expect(vatChecksum("ZZ", "123")).toBeNull();
});

it("rejects unsupported, malformed, and oversized values while preserving scope", () => {
  expect(vat("GB123456789")).toMatchObject({
    valid: false,
    checks: {
      countryCode: true,
      supported: false,
      format: false,
      checksum: null,
    },
    details: { scope: "local", pattern: null },
  });
  expect(vat("BE 0776.091-951").normalized).toBe("BE0776091951");
  expect(vat("BE0776/091951").checks.format).toBe(false);
  expect(vat("").checks.countryCode).toBe(false);
  expect(() => vat("x".repeat(4097))).toThrow("too_large");
});

it("keeps format rejection separate from unchecked checksum outcomes", () => {
  for (const country of Object.keys(VAT_PATTERNS)) {
    const result = vat(`${country}!`);
    expect(result.valid, country).toBe(false);
    expect(result.checks.format, country).toBe(false);
    expect(result.checks.checksum, country).toBeNull();
  }
  expect(vat("x".repeat(4096)).valid).toBe(false);
  expect(vat("FR41303265045").checks.checksum).toBe(false);
  expect(vat("SE556188840400").checks.checksum).toBe(false);
  expect(vat("SE556188840495").checks.checksum).toBe(false);
  expect(vat("SE556188840501").checks.checksum).toBe(false);
  expect(vat("FRAB303265045").checks.format).toBe(true);
  expect(vat("FRAB303265045").checks.checksum).toBeNull();
});
