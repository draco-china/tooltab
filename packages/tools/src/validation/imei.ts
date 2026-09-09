export type ImeiValidationReason =
  | "empty"
  | "invalid-length"
  | "invalid-format"
  | "invalid-checksum"
  | "valid";

export type ImeiResult = {
  raw: string;
  normalized: string;
  length: number;
  tac: string | null;
  serialNumber: string | null;
  expectedCheckDigit: string | null;
  actualCheckDigit: string | null;
  isLengthValid: boolean;
  isFormatValid: boolean;
  isChecksumValid: boolean;
  isValid: boolean;
  reason: ImeiValidationReason;
};

export function normalizeImei(input: string) {
  if (input.length > 256) throw new Error("input-too-large");
  return input.replace(/[\s-]/g, "");
}

function luhnSum(value: string) {
  let sum = 0;
  let shouldDouble = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum;
}

export function getImeiCheckDigit(core: string) {
  if (!/^\d{14}$/.test(core)) return null;
  const sum = luhnSum(`${core}0`);
  return String((10 - (sum % 10)) % 10);
}

export function validateImei(input: string): ImeiResult {
  const normalized = normalizeImei(input);
  const length = normalized.length;
  const isLengthValid = length === 15;
  const isFormatValid = /^\d+$/.test(normalized);
  const tac = isFormatValid && length >= 8 ? normalized.slice(0, 8) : null;
  const serialNumber =
    isFormatValid && length >= 14 ? normalized.slice(8, 14) : null;
  const expectedCheckDigit =
    isFormatValid && length >= 14
      ? getImeiCheckDigit(normalized.slice(0, 14))
      : null;
  const actualCheckDigit =
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    isFormatValid && length >= 15 ? normalized[14]! : null;
  const isChecksumValid =
    isLengthValid &&
    isFormatValid &&
    actualCheckDigit !== null &&
    actualCheckDigit === expectedCheckDigit;
  const isValid = isLengthValid && isFormatValid && isChecksumValid;

  let reason: ImeiValidationReason = "valid";
  if (length === 0) reason = "empty";
  else if (!isFormatValid) reason = "invalid-format";
  else if (!isLengthValid) reason = "invalid-length";
  else if (!isChecksumValid) reason = "invalid-checksum";

  return {
    raw: input,
    normalized,
    length,
    tac,
    serialNumber,
    expectedCheckDigit,
    actualCheckDigit,
    isLengthValid,
    isFormatValid,
    isChecksumValid,
    isValid,
    reason,
  };
}
