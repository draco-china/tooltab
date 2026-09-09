import creditCardType from "credit-card-type";

export interface CreditCardAnalysis {
  normalized: string;
  valid: boolean;
  checks: Record<"format" | "length" | "brand" | "checksum", boolean>;
  details: {
    length: number;
    brand: string | null;
    candidates: string | null;
    expectedLengths: string | null;
    cvcLength: number | null;
    formatted: string;
  };
}

export function validateCard(input: string): CreditCardAnalysis {
  if (input.length > 256) throw new Error("input-too-large");
  const value = input.replace(/[\s-]/g, "");
  const format = /^[0-9]+$/.test(value);
  const candidates = format ? creditCardType(value) : [];
  const card = candidates.length === 1 ? candidates[0] : null;
  let sum = 0;
  if (format) {
    for (
      let index = value.length - 1, position = 0;
      index >= 0;
      index--, position++
    ) {
      const digit = Number(value[index]) * (position % 2 ? 2 : 1);
      sum += digit > 9 ? digit - 9 : digit;
    }
  }
  const checksum = format && sum % 10 === 0;
  const length = Boolean(card?.lengths.includes(value.length));
  const brand = Boolean(card);
  const gaps = card?.gaps ?? [4, 8, 12, 16];
  const formatted = [...value]
    .map((character, index) => (gaps.includes(index) ? " " : "") + character)
    .join("");

  return {
    normalized: value,
    valid: format && length && brand && checksum,
    checks: { format, length, brand, checksum },
    details: {
      length: value.length,
      brand: card?.niceType ?? null,
      candidates:
        candidates.map((candidate) => candidate.niceType).join(", ") || null,
      expectedLengths: card?.lengths.join(", ") ?? null,
      cvcLength: card?.code.size ?? null,
      formatted,
    },
  };
}
