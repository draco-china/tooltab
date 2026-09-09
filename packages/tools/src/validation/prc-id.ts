import regions from "./prc-regions.json";
export class IdentityError extends Error {
  constructor(public readonly code: "too_large" | "invalid_date") {
    super(code);
  }
}
export type Validation = {
  normalized: string;
  valid: boolean;
  checks: Record<string, boolean | null>;
  details: Record<string, string | number | null>;
};
function bounded(input: string) {
  if (input.length > 4096) throw new IdentityError("too_large");
}
export function checkDigit(core: string) {
  if (!/^\d{17}$/.test(core)) return null;
  let value = 0;
  for (let i = 0; i < 17; i++) value += Number(core[i]) * (2 ** (17 - i) % 11);
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  return "10X98765432"[value % 11]!;
}
export function prcId(input: string, today: string): Validation {
  bounded(input);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
    Number.isNaN(Date.parse(`${today}T00:00:00Z`)) ||
    new Date(`${today}T00:00:00Z`).toISOString().slice(0, 10) !== today
  )
    throw new IdentityError("invalid_date");
  const normalized = input.replace(/[\s-]/g, "").toUpperCase(),
    digits = normalized.match(/^\d+/)?.[0] ?? "",
    format = /^\d{17}[0-9X]$/.test(normalized),
    hasFormatIssue =
      /[^0-9X]/.test(normalized) ||
      (normalized.includes("X") && normalized.indexOf("X") !== 17);
  const names: Record<string, string> = regions;
  const province = digits.length >= 2 ? `${digits.slice(0, 2)}0000` : null,
    city = digits.length >= 4 ? `${digits.slice(0, 4)}00` : null,
    area = digits.length >= 6 ? digits.slice(0, 6) : null;
  const birth = digits.slice(6, 14),
    birthText =
      birth.length === 8
        ? `${birth.slice(0, 4)}-${birth.slice(4, 6)}-${birth.slice(6)}`
        : null,
    date = birthText ? new Date(`${birthText}T00:00:00Z`) : null;
  const calendar =
      !!date &&
      !Number.isNaN(date.getTime()) &&
      Number(birth.slice(0, 4)) > 0 &&
      date.toISOString().slice(0, 10) === birthText,
    birthValid = calendar && !!birthText && birthText <= today;
  const sequence = digits.length >= 17 ? digits.slice(14, 17) : null,
    expected = checkDigit(digits.slice(0, 17)),
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    actual = normalized.length >= 18 ? normalized[17]! : null;
  const checks = {
    length: normalized.length === 18,
    format,
    region: format && !!area && !!names[area],
    birthdate: format && birthValid,
    checksum: format && expected === actual,
  };
  return {
    normalized,
    valid: Object.values(checks).every(Boolean),
    checks,
    details: {
      length: normalized.length,
      partial: normalized.length < 18 && !hasFormatIssue ? "yes" : "no",
      provinceCode: province,
      province: province ? (names[province] ?? null) : null,
      cityCode: city,
      city: city ? (names[city] ?? null) : null,
      regionCode: area,
      district: area ? (names[area] ?? null) : null,
      birthDate: calendar ? birthText : null,
      birthYear: birth.slice(0, 4) || null,
      birthMonth: birth.slice(4, 6) || null,
      birthDay: birth.slice(6, 8) || null,
      age: birthValid
        ? Number(today.slice(0, 4)) -
          Number(birth.slice(0, 4)) -
          // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
          (today.slice(5) < birthText!.slice(5) ? 1 : 0)
        : null,
      gender: sequence
        ? Number(sequence[2]) % 2
          ? "male"
          : "female"
        : "unknown",
      sequence,
      expected,
      actual,
      today,
    },
  };
}
