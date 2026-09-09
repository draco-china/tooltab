import { expect, it } from "vitest";
import { email, IdentityError } from "../../src/validation/email";

it("returns every check and normalizes the domain", () => {
  const result = email(" User.Name+tag@Example.COM ");
  expect(result).toEqual({
    normalized: "User.Name+tag@example.com",
    valid: true,
    checks: {
      singleAt: true,
      length: true,
      localLength: true,
      domainLength: true,
      localCharacters: true,
      localDots: true,
      domainCharacters: true,
      domainDots: true,
      labelLength: true,
      labelCharacters: true,
      tld: true,
    },
    details: {
      localPart: "User.Name+tag",
      domain: "Example.COM",
      labels: "Example · COM",
      length: 25,
      localLength: 13,
      domainLength: 11,
    },
  });
});

it("rejects structural, local, and domain punctuation failures", () => {
  expect(email("invalid").valid).toBe(false);
  expect(email("a@@example.com").checks.singleAt).toBe(false);
  expect(email("@example.com").checks.localLength).toBe(false);
  expect(email("a@").checks.domainLength).toBe(false);
  expect(email("bad space@example.com").checks.localCharacters).toBe(false);
  expect(email(".bad@example.com").checks.localDots).toBe(false);
  expect(email("bad..dots@example.com").checks.localDots).toBe(false);
  expect(email("user@bad_domain.com").checks.domainCharacters).toBe(false);
  expect(email("user@.example.com").checks.domainDots).toBe(false);
  expect(email("user@example..com").checks.domainDots).toBe(false);
});

it("checks local, domain, label, and TLD limits independently", () => {
  expect(email(`${"a".repeat(65)}@example.com`).checks.localLength).toBe(false);
  expect(email(`a@${"a".repeat(254)}`).checks.domainLength).toBe(false);
  expect(email(`a@${"a".repeat(63)}.com`).checks.labelLength).toBe(true);
  expect(email(`a@${"a".repeat(64)}a.com`).checks.labelLength).toBe(false);
  expect(email("a@-example.com").checks.labelCharacters).toBe(false);
  expect(email("a@example-.com").checks.labelCharacters).toBe(false);
  expect(email("a@example.1").checks.tld).toBe(false);
  expect(email("a@example.c").checks.tld).toBe(false);
  expect(email("a@localhost").checks.tld).toBe(false);
  expect(email("a@example.com").details.labels).toBe("example · com");
});

it("preserves Unicode length details while validating ASCII email syntax", () => {
  const result = email("é@example.com");
  expect(result.checks.localCharacters).toBe(false);
  expect(result.details.localPart).toBe("é");
  expect(result.details.length).toBe(13);
  expect(result.normalized).toBe("é@example.com");
});

it("handles empty input and enforces the 4096 character limit", () => {
  const empty = email("");
  expect(empty.normalized).toBe("");
  expect(empty.valid).toBe(false);
  expect(empty.details.labels).toBe("");
  expect(() => email("x".repeat(4097))).toThrow(IdentityError);
  expect(() => email("x".repeat(4097))).toThrow("too_large");
});

it("accepts exact boundaries before rejecting the next character", () => {
  const local = "a".repeat(64);
  const domain = ["b".repeat(63), "c".repeat(63), "d".repeat(61)].join(".");
  const maximum = `${local}@${domain}`;
  expect(maximum).toHaveLength(254);
  expect(email(maximum).valid).toBe(true);
  expect(email(`${maximum}d`).checks.length).toBe(false);
  expect(email("x".repeat(4096)).valid).toBe(false);
  expect(email("a@example.12").checks.tld).toBe(false);
  expect(email("a@example.a1").checks.tld).toBe(true);
});
