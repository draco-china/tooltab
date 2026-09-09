import { describe, expect, it } from "vitest";
import {
  bytesToUuid,
  DEFAULT_UUID_V3_NAME,
  DEFAULT_UUID_V3_NAMESPACE,
  generateUuidV3,
  isValidNamespaceUuid,
  normalizeNamespaceUuid,
  resolveNamespacePresetId,
  UUID_V3_NAMESPACE_PRESETS,
  UuidV3Error,
  validateUuidV3Name,
} from "../../src/uuid/name";

describe("UUID v3 namespace helpers", () => {
  it("normalizes canonical, compact, brace, and URN namespaces", () => {
    expect(normalizeNamespaceUuid(DEFAULT_UUID_V3_NAMESPACE)).toBe(
      DEFAULT_UUID_V3_NAMESPACE,
    );
    expect(normalizeNamespaceUuid("6BA7B8109DAD11D180B400C04FD430C8")).toBe(
      DEFAULT_UUID_V3_NAMESPACE,
    );
    expect(normalizeNamespaceUuid(`{${DEFAULT_UUID_V3_NAMESPACE}}`)).toBe(
      DEFAULT_UUID_V3_NAMESPACE,
    );
    expect(
      normalizeNamespaceUuid(` URN:UUID:{${DEFAULT_UUID_V3_NAMESPACE}} `),
    ).toBe(DEFAULT_UUID_V3_NAMESPACE);
    expect(isValidNamespaceUuid(DEFAULT_UUID_V3_NAMESPACE)).toBe(true);
    expect(isValidNamespaceUuid("{bad")).toBe(false);
    expect(normalizeNamespaceUuid("{bad")).toBeNull();
    expect(normalizeNamespaceUuid("bad}")).toBeNull();
    expect(normalizeNamespaceUuid("urn:uuid:")).toBeNull();
  });

  it("resolves only the four UI namespace presets", () => {
    expect(UUID_V3_NAMESPACE_PRESETS).toHaveLength(4);
    expect(resolveNamespacePresetId(DEFAULT_UUID_V3_NAMESPACE)).toBe("dns");
    expect(resolveNamespacePresetId(UUID_V3_NAMESPACE_PRESETS[1].value)).toBe(
      "url",
    );
    expect(
      resolveNamespacePresetId("00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });

  it("validates names and preserves exact Unicode input", () => {
    expect(validateUuidV3Name(DEFAULT_UUID_V3_NAME)).toBeNull();
    expect(validateUuidV3Name("x".repeat(100_001))).toBe("too-large");
    expect(validateUuidV3Name("\ud800")).toBe("invalid-unicode");
    expect(generateUuidV3(DEFAULT_UUID_V3_NAMESPACE, "é")).not.toBe(
      generateUuidV3(DEFAULT_UUID_V3_NAMESPACE, "e\u0301"),
    );
  });

  it("matches the RFC v3 vector and supports arbitrary 128-bit namespaces", () => {
    expect(generateUuidV3(DEFAULT_UUID_V3_NAMESPACE, "www.example.com")).toBe(
      "5df41881-3aed-3515-88a7-2f4a814cf09e",
    );
    expect(generateUuidV3("00000000000000000000000000000000", "x")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(
      generateUuidV3(
        `urn:uuid:{${DEFAULT_UUID_V3_NAMESPACE}}`,
        "www.example.com",
      ),
    ).toBe(generateUuidV3(DEFAULT_UUID_V3_NAMESPACE, "www.example.com"));
  });

  it("preserves validation order and typed errors", () => {
    expect(() => generateUuidV3("bad", "x")).toThrow(
      new UuidV3Error("invalid-namespace"),
    );
    expect(() => generateUuidV3(DEFAULT_UUID_V3_NAMESPACE, "\ud800")).toThrow(
      new UuidV3Error("invalid-unicode"),
    );
    expect(() =>
      generateUuidV3(DEFAULT_UUID_V3_NAMESPACE, "x".repeat(100_001)),
    ).toThrow(new UuidV3Error("too-large"));
    expect(() => generateUuidV3("bad", "x".repeat(100_001))).toThrow(
      new UuidV3Error("invalid-namespace"),
    );
  });

  it("formats UUID bytes and rejects the wrong size", () => {
    expect(bytesToUuid(new Uint8Array(16))).toBe(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(() => bytesToUuid(new Uint8Array(15))).toThrow("exactly 16 bytes");
  });
});
