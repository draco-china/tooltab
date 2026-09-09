const TRANSLITERATION: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]+$/;

export interface VinValidationResult {
  raw: string;
  normalized: string;
  isLengthValid: boolean;
  isCharacterValid: boolean;
  isCheckDigitValid: boolean;
  expectedCheckDigit: string | null;
  actualCheckDigit: string | null;
  isValid: boolean;
}

export function normalizeVin(input: string) {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

function computeCheckDigit(vin: string) {
  const sum = [...vin].reduce((total, char, index) => {
    const numeric = Number(char);
    const value = Number.isNaN(numeric) ? TRANSLITERATION[char] : numeric;
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    return total + value * WEIGHTS[index]!;
  }, 0);
  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

export function inspectVin(normalized: string): VinValidationResult {
  const isLengthValid = normalized.length === 17;
  const isCharacterValid =
    normalized.length === 0 || VIN_PATTERN.test(normalized);
  const expectedCheckDigit =
    isLengthValid && isCharacterValid ? computeCheckDigit(normalized) : null;
  const actualCheckDigit = isLengthValid ? normalized.charAt(8) : null;
  const isCheckDigitValid =
    expectedCheckDigit !== null && actualCheckDigit === expectedCheckDigit;
  return {
    raw: normalized,
    normalized,
    isLengthValid,
    isCharacterValid,
    isCheckDigitValid,
    expectedCheckDigit,
    actualCheckDigit,
    isValid: isLengthValid && isCharacterValid && isCheckDigitValid,
  };
}

export function validateVin(input: string): VinValidationResult {
  return { ...inspectVin(normalizeVin(input)), raw: input };
}
