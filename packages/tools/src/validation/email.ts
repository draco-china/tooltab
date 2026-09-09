export class IdentityError extends Error {
  constructor(public readonly code: "too_large") {
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
export function email(input: string): Validation {
  bounded(input);
  const text = input.trim(),
    parts = text.split("@"),
    singleAt = parts.length === 2 && !!parts[0] && !!parts[1],
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    local = singleAt ? parts[0]! : "",
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    domain = singleAt ? parts[1]! : "",
    labels = domain.split(".");
  const dots = (v: string) =>
    !!v && !v.startsWith(".") && !v.endsWith(".") && !v.includes("..");
  const checks = {
    singleAt,
    length: text.length <= 254,
    localLength: local.length > 0 && local.length <= 64,
    domainLength: domain.length > 0 && domain.length <= 253,
    localCharacters: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local),
    localDots: dots(local),
    domainCharacters: /^[a-zA-Z0-9.-]+$/.test(domain),
    domainDots: dots(domain),
    labelLength: labels.every((l) => l.length > 0 && l.length <= 63),
    labelCharacters: labels.every((l) =>
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(l),
    ),
    tld:
      labels.length > 1 &&
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      labels.at(-1)!.length >= 2 &&
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      /[a-zA-Z]/.test(labels.at(-1)!),
  };
  return {
    normalized: singleAt ? `${local}@${domain.toLowerCase()}` : "",
    valid: Object.values(checks).every(Boolean),
    checks,
    details: {
      localPart: local,
      domain,
      labels: labels.join(" · "),
      length: text.length,
      localLength: local.length,
      domainLength: domain.length,
    },
  };
}
