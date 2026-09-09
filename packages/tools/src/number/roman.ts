export class RomanNumeralConversionError extends Error {
  constructor(
    public readonly code: "invalid_integer" | "invalid_roman" | "roman_range",
  ) {
    super(code);
    this.name = "RomanNumeralConversionError";
  }
}

const ROMAN_PAIRS = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
] as const;

export function toRoman(input: string): string {
  if (input.trim() !== input || !/^\d+$/.test(input) || input.length > 32) {
    throw new RomanNumeralConversionError("invalid_integer");
  }
  let value = BigInt(input);
  if (value < 1n || value > 3999n) {
    throw new RomanNumeralConversionError("roman_range");
  }
  let result = "";
  for (const [amount, symbol] of ROMAN_PAIRS) {
    while (value >= BigInt(amount)) {
      result += symbol;
      value -= BigInt(amount);
    }
  }
  return result;
}

export function fromRoman(input: string): string {
  const roman = input.toUpperCase();
  if (
    !roman ||
    /[\r\n\u2028\u2029]/.test(roman) ||
    roman.length > 15 ||
    !/^(?:M{0,3})(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/.test(
      roman,
    )
  ) {
    throw new RomanNumeralConversionError("invalid_roman");
  }
  let value = 0;
  let index = 0;
  for (const [amount, symbol] of ROMAN_PAIRS) {
    while (roman.slice(index, index + symbol.length) === symbol) {
      value += amount;
      index += symbol.length;
    }
  }
  // The strict section grammar above admits only canonical Roman forms.
  return String(value);
}
