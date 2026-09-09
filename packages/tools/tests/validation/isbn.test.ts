import { expect, it } from "vitest";
import { ChecksumInputError, validateIsbn } from "../../src/validation/isbn";

it("validates ISBN-13 and converts a 978 edition to ISBN-10", () => {
  expect(validateIsbn("978-0-306-40615-7")).toMatchObject({
    kind: "isbn",
    normalized: "9780306406157",
    valid: true,
    checks: { length: true, format: true, prefix: true, checksum: true },
    details: {
      length: 13,
      type: "ISBN-13",
      prefix: "978",
      expected: "7",
      actual: "7",
      isbn10: "0306406152",
      isbn13: "9780306406157",
    },
  });
});

it("validates ISBN-10 including a normalized lowercase X and converts it", () => {
  expect(validateIsbn("000-000-006-x")).toMatchObject({
    normalized: "000000006X",
    valid: true,
    checks: { length: true, format: true, prefix: true, checksum: true },
    details: {
      type: "ISBN-10",
      prefix: null,
      expected: "X",
      actual: "X",
      isbn10: "000000006X",
      isbn13: "9780000000064",
    },
  });
});

it("accepts a valid 979 ISBN-13 without manufacturing ISBN-10", () => {
  expect(validateIsbn("9791090636071")).toMatchObject({
    valid: true,
    checks: { prefix: true, checksum: true },
    details: {
      type: "ISBN-13",
      prefix: "979",
      isbn10: null,
      isbn13: "9791090636071",
    },
  });
});

it("rejects invalid length, format, prefix, and checksum", () => {
  expect(validateIsbn("")).toMatchObject({
    valid: false,
    checks: { length: false, format: false, prefix: false, checksum: false },
    details: { type: null, prefix: null, expected: null, actual: null },
  });
  expect(validateIsbn("123456789")).toMatchObject({
    valid: false,
    checks: { length: false, format: false, prefix: false, checksum: false },
    details: { type: null, prefix: null, actual: null },
  });
  expect(validateIsbn("1234567890")).toMatchObject({
    valid: false,
    checks: { length: true, format: true, prefix: true, checksum: false },
  });
  expect(validateIsbn("123456789X0")).toMatchObject({
    valid: false,
    checks: { length: false, format: false, prefix: false, checksum: false },
  });
  expect(validateIsbn("9780306406158")).toMatchObject({
    valid: false,
    checks: { length: true, format: true, prefix: true, checksum: false },
    details: { expected: "7", actual: "8" },
  });
  expect(validateIsbn("9790201810285")).toMatchObject({
    valid: false,
    checks: { length: true, format: true, prefix: false, checksum: false },
  });
});

it("rejects unsupported characters and oversized input", () => {
  expect(validateIsbn("030640615A")).toMatchObject({
    valid: false,
    checks: { length: true, format: false, prefix: true, checksum: false },
  });
  expect(() => validateIsbn("x".repeat(257))).toThrow(ChecksumInputError);
});
