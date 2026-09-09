export class NumberBaseConversionError extends Error {
  constructor(
    public readonly code: "invalid_base" | "invalid_integer" | "too_large",
  ) {
    super(code);
    this.name = "NumberBaseConversionError";
  }
}

export const MAX_BASE_BITS = 12_288;
export const MAX_BASE_INPUT = MAX_BASE_BITS + 1;
export const NUMERIC_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/";
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function convertBase(
  input: string,
  from: number,
  to: number,
  numeric64 = false,
  outputNumeric64 = false,
): string {
  for (const base of [from, to]) {
    if (!Number.isInteger(base) || base < 2 || base > 64) {
      throw new NumberBaseConversionError("invalid_base");
    }
  }
  if (input.length > MAX_BASE_INPUT) {
    throw new NumberBaseConversionError("too_large");
  }
  const negative = input.startsWith("-");
  const digits = negative ? input.slice(1) : input;
  if (!digits) throw new NumberBaseConversionError("invalid_integer");
  if ((numeric64 && from !== 64) || (outputNumeric64 && to !== 64)) {
    throw new NumberBaseConversionError("invalid_base");
  }
  const sourceAlphabet = numeric64 ? BASE64_ALPHABET : NUMERIC_ALPHABET;
  const targetAlphabet = outputNumeric64 ? BASE64_ALPHABET : NUMERIC_ALPHABET;
  let value = 0n;
  for (const raw of digits) {
    const digit = sourceAlphabet.indexOf(from <= 36 ? raw.toLowerCase() : raw);
    if (digit < 0 || digit >= from) {
      throw new NumberBaseConversionError("invalid_integer");
    }
    value = value * BigInt(from) + BigInt(digit);
    if (value >> BigInt(MAX_BASE_BITS)) {
      throw new NumberBaseConversionError("too_large");
    }
  }
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  if (value === 0n) return targetAlphabet[0]!;
  const result: string[] = [];
  while (value) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    result.push(targetAlphabet[Number(value % BigInt(to))]!);
    value /= BigInt(to);
  }
  return (negative ? "-" : "") + result.reverse().join("");
}
