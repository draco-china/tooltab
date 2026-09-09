export interface ChecksumResult {
  kind: "isbn";
  normalized: string;
  valid: boolean;
  checks: Record<string, boolean>;
  details: Record<string, string | number | null>;
}
export class ChecksumInputError extends Error {
  constructor() {
    super("input-too-large");
  }
}
function normalize(input: string) {
  if (input.length > 256) throw new ChecksumInputError();
  return input
    .replace(/[\s-]/g, "")
    .replace(/[a-z]/g, (char) => char.toUpperCase());
}
function isbnDigit(core: string) {
  const ten = core.length === 9;
  let total = 0;
  for (let i = 0; i < core.length; i++)
    total += Number(core[i]) * (ten ? 10 - i : i % 2 ? 3 : 1);
  const digit = ten ? (11 - (total % 11)) % 11 : (10 - (total % 10)) % 10;
  return digit === 10 ? "X" : String(digit);
}
export function validateIsbn(input: string): ChecksumResult {
  const value = normalize(input),
    ten = value.length === 10,
    thirteen = value.length === 13,
    length = ten || thirteen;
  const format = ten
    ? /^[0-9]{9}[0-9X]$/.test(value)
    : thirteen && /^[0-9]{13}$/.test(value);
  const prefix = ten || (thirteen && /^(978|979[1-9])/.test(value));
  const expected = format ? isbnDigit(value.slice(0, -1)) : null,
    actual = length ? value.slice(-1) : null,
    checksum = format && expected === actual;
  const valid = length && format && prefix && checksum;
  let isbn10: string | null = null,
    isbn13: string | null = null;
  if (valid) {
    if (ten) {
      isbn10 = value;
      const core = `978${value.slice(0, 9)}`;
      isbn13 = core + isbnDigit(core);
    } else {
      isbn13 = value;
      if (value.startsWith("978")) {
        const core = value.slice(3, 12);
        isbn10 = core + isbnDigit(core);
      }
    }
  }
  return {
    kind: "isbn",
    normalized: value,
    valid,
    checks: { length, format, prefix, checksum },
    details: {
      length: value.length,
      type: ten ? "ISBN-10" : thirteen ? "ISBN-13" : null,
      prefix: thirteen ? value.slice(0, 3) : null,
      expected,
      actual,
      isbn10,
      isbn13,
    },
  };
}
