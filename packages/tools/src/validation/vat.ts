class VatValidationError extends Error {
  constructor(public readonly code: "too_large") {
    super(code);
  }
}

type Validation = {
  normalized: string;
  valid: boolean;
  checks: Record<string, boolean | null>;
  details: Record<string, string | number | null>;
};
export const VAT_PATTERNS: Record<string, RegExp> = {
  AT: /^U\d{8}$/,
  BE: /^\d{10}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[0-9A-Z]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^\d{7}[A-Z]{1,2}$/,
  IT: /^\d{11}$/,
  LT: /^\d{9}(?:\d{3})?$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^[0-9A-Z+*]{10}\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
};
function weighted(text: string, weights: number[]) {
  return weights.reduce((s, w, i) => s + Number(text[i]) * w, 0);
}
function decimalSum(n: number) {
  return (n % 10) + Math.floor(n / 10);
}
function luhn(text: string) {
  return (
    [...text]
      .reverse()
      .reduce((s, n, i) => s + decimalSum(Number(n) * (i % 2 ? 2 : 1)), 0) %
      10 ===
    0
  );
}
export function vatChecksum(country: string, value: string): boolean | null {
  switch (country) {
    case "AT":
      return (
        (10 -
          ((4 +
            // Convert the sliced string or typed array into an Array; slice does not return an Array here.
            [...value.slice(1, 8)].reduce(
              (s, n, i) => s + decimalSum(Number(n) * (i % 2 ? 2 : 1)),
              0,
            )) %
            10)) %
          10 ===
        Number(value[8])
      );
    case "BE":
      return 97 - (Number(value.slice(0, 8)) % 97) === Number(value.slice(8));
    case "DE": {
      let p = 10;
      for (const n of value.slice(0, 8))
        p = (2 * ((p + Number(n)) % 10 || 10)) % 11;
      return (11 - p) % 10 === Number(value[8]);
    }
    case "DK":
      return weighted(value, [2, 7, 6, 5, 4, 3, 2, 1]) % 11 === 0;
    case "FI":
      return (
        (11 - (weighted(value, [7, 9, 10, 5, 8, 4, 2]) % 11)) % 11 ===
        Number(value[7])
      );
    case "FR":
      return /^\d{2}/.test(value)
        ? Number(value.slice(0, 2)) ===
            (12 + 3 * (Number(value.slice(2)) % 97)) % 97
        : null;
    case "IT":
      return luhn(value);
    case "NL":
      if (
        /^\d{9}B\d{2}$/.test(value) &&
        Number(value.slice(10)) > 0 &&
        weighted(value, [9, 8, 7, 6, 5, 4, 3, 2]) % 11 === Number(value[8])
      )
        return true;
      if (Number(value.slice(-2)) < 2 || Number(value.slice(-2)) > 98)
        return false;
      return (
        BigInt(
          [...`NL${value}`]
            .map((c) =>
              /\d/.test(c)
                ? c
                : c === "+"
                  ? "36"
                  : c === "*"
                    ? "37"
                    : String(c.charCodeAt(0) - 55),
            )
            .join(""),
        ) %
          97n ===
        1n
      );
    case "PL":
      return (
        weighted(value, [6, 5, 7, 2, 3, 4, 5, 6, 7]) % 11 === Number(value[9])
      );
    case "PT": {
      const n = 11 - (weighted(value, [9, 8, 7, 6, 5, 4, 3, 2]) % 11);
      return (n >= 10 ? 0 : n) === Number(value[8]);
    }
    case "SE":
      return (
        Number(value.slice(10)) >= 1 &&
        Number(value.slice(10)) <= 94 &&
        luhn(value.slice(0, 10))
      );
    case "ES": {
      const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
      if (/^\d{8}[A-Z]$/.test(value))
        return letters[Number(value.slice(0, 8)) % 23] === value[8];
      if (/^[XYZ]\d{7}[A-Z]$/.test(value))
        return (
          letters[
            // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
            Number(`${"XYZ".indexOf(value[0]!)}${value.slice(1, 8)}`) % 23
          ] === value[8]
        );
      if (!/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[A-Z0-9]$/.test(value)) return false;
      const n =
          (10 -
            // Convert the sliced string or typed array into an Array; slice does not return an Array here.
            ([...value.slice(1, 8)].reduce(
              (s, v, i) => s + decimalSum(Number(v) * (i % 2 ? 1 : 2)),
              0,
            ) %
              10)) %
          10,
        letter = "JABCDEFGHI"[n];
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      return "KPQRSNW".includes(value[0]!)
        ? value[8] === letter
        : // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
          "ABEH".includes(value[0]!)
          ? value[8] === String(n)
          : value[8] === letter || value[8] === String(n);
    }
    default:
      return null;
  }
}
export function vat(input: string): Validation {
  if (input.length > 4096) throw new VatValidationError("too_large");
  const normalized = input.replace(/[\s.-]/g, "").toUpperCase(),
    country = normalized.slice(0, 2),
    number = normalized.slice(2),
    supported = Object.hasOwn(VAT_PATTERNS, country),
    format = supported && !!VAT_PATTERNS[country]?.test(number),
    checksum = format ? vatChecksum(country, number) : null;
  return {
    normalized,
    valid: supported && format && checksum !== false,
    checks: {
      countryCode: /^[A-Z]{2}$/.test(country),
      supported,
      format,
      checksum,
    },
    details: {
      country,
      number,
      pattern: VAT_PATTERNS[country]?.source ?? null,
      scope:
        country === "NL"
          ? "netherlands"
          : country === "FR" && checksum === null
            ? "france"
            : "local",
    },
  };
}
