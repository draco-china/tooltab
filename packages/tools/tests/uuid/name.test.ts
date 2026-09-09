import { expect, it } from "vitest";
import {
  generateNameUuid,
  MAX_UUID_NAME_LENGTH,
  UUID_NAMESPACES,
} from "../../src/uuid/name";

it("matches RFC9562 Appendix A.2 and A.4 vectors", () => {
  expect(generateNameUuid(UUID_NAMESPACES.DNS, "www.example.com", 3)).toBe(
    "5df41881-3aed-3515-88a7-2f4a814cf09e",
  );
  expect(generateNameUuid(UUID_NAMESPACES.DNS, "www.example.com", 5)).toBe(
    "2ed6657d-e927-568b-95e1-2665a8aea6a2",
  );
  expect(generateNameUuid(UUID_NAMESPACES.DNS, "example.com", 5)).toBe(
    "cfbff0d1-9375-5685-968c-48ce8b15ae17",
  );
});
it("preserves exact names including Unicode, empty and whitespace without normalization", () => {
  expect(generateNameUuid(UUID_NAMESPACES.DNS, "", 3)).toBe(
    "c87ee674-4ddc-3efe-a74e-dfe25da5d7b3",
  );
  expect(generateNameUuid(UUID_NAMESPACES.DNS, "é", 5)).not.toBe(
    generateNameUuid(UUID_NAMESPACES.DNS, "e\u0301", 5),
  );
  expect(generateNameUuid(UUID_NAMESPACES.DNS, "a", 5)).not.toBe(
    generateNameUuid(UUID_NAMESPACES.DNS, " a", 5),
  );
  expect(generateNameUuid(UUID_NAMESPACES.DNS.toUpperCase(), "世界😀", 5)).toBe(
    generateNameUuid(UUID_NAMESPACES.DNS, "世界😀", 5),
  );
});
it("supports all namespace presets and custom sentinels and strictly rejects malformed inputs", () => {
  const values = Object.values(UUID_NAMESPACES).map((namespace) =>
    generateNameUuid(namespace, "hello", 3),
  );
  expect(new Set(values).size).toBe(4);
  expect(
    generateNameUuid("00000000-0000-0000-0000-000000000000", "x", 5),
  ).toMatch(/-5[0-9a-f]{3}-[89ab]/);
  for (const namespace of [
    "bad",
    `${UUID_NAMESPACES.DNS} `,
    "00000000-0000-9000-8000-000000000000",
  ])
    expect(() => generateNameUuid(namespace, "x", 3)).toThrow(
      "invalid_namespace",
    );
  expect(() => generateNameUuid(UUID_NAMESPACES.DNS, "\ud800", 3)).toThrow(
    "invalid_unicode",
  );
  expect(() =>
    generateNameUuid(
      UUID_NAMESPACES.DNS,
      "x".repeat(MAX_UUID_NAME_LENGTH + 1),
      5,
    ),
  ).toThrow("too_large");
});
it("matches an independent Python uuid5 UTF-8 reference", () => {
  expect(generateNameUuid(UUID_NAMESPACES.DNS, "世界😀", 5)).toBe(
    "5663c105-f3d4-5f02-9c69-4d7334a62b7d",
  );
  expect(() => generateNameUuid(`${UUID_NAMESPACES.DNS}\n`, "x", 5)).toThrow(
    "invalid_namespace",
  );
});
it("rejects unsupported name UUID versions", () => {
  expect(() => generateNameUuid(UUID_NAMESPACES.DNS, "x", 4 as never)).toThrow(
    "Unsupported UUID name version",
  );
});
