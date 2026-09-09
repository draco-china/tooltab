import {
  getCountrySpecifications,
  validateIBAN as libraryIban,
} from "ibantools";

export type IdentifierKind = "iban";
export type IdentifierFieldKey =
  | "country"
  | "length"
  | "format"
  | "structure"
  | "checksum"
  | "domestic"
  | "registry"
  | "expectedLength"
  | "actualLength"
  | "checkDigits"
  | "expectedCheckDigits"
  | "bban"
  | "formatted"
  | "sourceVersion";
export interface IdentifierResult {
  kind: IdentifierKind;
  normalized: string;
  valid: boolean;
  checks: Partial<Record<IdentifierFieldKey, boolean>>;
  details: Partial<
    Record<IdentifierFieldKey, string | number | boolean | null>
  >;
}
export class IdentifierError extends Error {
  constructor() {
    super("input-too-large");
  }
}

const countries = getCountrySpecifications();
export const ibanCountries = Object.entries(countries)
  .filter(([, spec]) => spec.chars && spec.bban_regexp)
  .map(([code, spec]) => ({ code, length: spec.chars as number }));

export function normalizeIdentifierInput(input: string) {
  if (input.length > 256) throw new IdentifierError();
  return input
    .replace(/[\s-]/g, "")
    .replace(/[a-z]/g, (char) => char.toUpperCase());
}

function remainder97(value: string) {
  let remainder = 0;
  for (const char of value) {
    const digits =
      char >= "A" && char <= "Z" ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

export function validateIban(input: string): IdentifierResult {
  const value = normalizeIdentifierInput(input),
    country = value.slice(0, 2),
    bban = value.slice(4),
    checkDigits = value.slice(2, 4);
  const spec = Object.hasOwn(countries, country)
    ? countries[country]
    : undefined;
  const supported = !!(spec?.chars && spec.bban_regexp),
    format = /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(value);
  const length = supported && value.length === spec?.chars;
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const structure = supported && new RegExp(spec!.bban_regexp!).test(bban);
  const checksum =
    format &&
    length &&
    structure &&
    remainder97(bban + country + checkDigits) === 1;
  const domestic = checksum && libraryIban(value).valid;
  const checks = {
    country: supported,
    length,
    format,
    structure,
    checksum,
    domestic,
  };
  return {
    kind: "iban",
    normalized: value,
    valid: Object.values(checks).every(Boolean),
    checks,
    details: {
      country,
      registry: spec?.IBANRegistry ?? false,
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      expectedLength: supported ? spec!.chars! : null,
      actualLength: value.length,
      checkDigits: checkDigits || null,
      expectedCheckDigits:
        /^[A-Z]{2}$/.test(country) && /^[A-Z0-9]+$/.test(bban)
          ? String(98 - remainder97(`${bban}${country}00`)).padStart(2, "0")
          : null,
      bban: bban || null,
      formatted: value.match(/.{1,4}/g)?.join(" ") ?? "",
      sourceVersion: "ibantools 4.5.4",
    },
  };
}
