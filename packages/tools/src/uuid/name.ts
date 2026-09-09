import { md5, sha1 } from "@noble/hashes/legacy.js";
export const UUID_NAMESPACES = {
  DNS: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  URL: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
  OID: "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
  X500: "6ba7b814-9dad-11d1-80b4-00c04fd430c8",
} as const;
export const MAX_UUID_NAME_LENGTH = 100_000;
export const DEFAULT_UUID_V3_NAMESPACE = UUID_NAMESPACES.DNS;
export const DEFAULT_UUID_V3_NAME = "example.com";
export const MAX_UUID_V3_NAME_LENGTH = MAX_UUID_NAME_LENGTH;
export const UUID_V3_NAMESPACE_PRESETS = [
  { id: "dns", value: UUID_NAMESPACES.DNS },
  { id: "url", value: UUID_NAMESPACES.URL },
  { id: "oid", value: UUID_NAMESPACES.OID },
  { id: "x500", value: UUID_NAMESPACES.X500 },
] as const;
export type UuidV3NamespacePresetId =
  (typeof UUID_V3_NAMESPACE_PRESETS)[number]["id"];
export type UuidV3ErrorCode =
  | "invalid-namespace"
  | "invalid-unicode"
  | "too-large";
export class UuidV3Error extends Error {
  constructor(public readonly code: UuidV3ErrorCode) {
    super(code);
    this.name = "UuidV3Error";
  }
}
export class UuidNameError extends Error {
  constructor(
    public readonly code: "invalid_namespace" | "invalid_unicode" | "too_large",
  ) {
    super(code);
  }
}

const CANONICAL_UUID_PATTERN =
  /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/u;
const COMPACT_UUID_PATTERN = /^[0-9a-f]{32}$/u;

function stripUuidWrappers(value: string) {
  let prepared = value.trim().toLowerCase();
  if (prepared.startsWith("urn:uuid:"))
    prepared = prepared.slice("urn:uuid:".length);
  const startsWithBrace = prepared.startsWith("{");
  const endsWithBrace = prepared.endsWith("}");
  if (startsWithBrace !== endsWithBrace) return "";
  if (startsWithBrace) prepared = prepared.slice(1, -1);
  return prepared;
}

export function normalizeNamespaceUuid(value: string): string | null {
  const prepared = stripUuidWrappers(value);
  if (!prepared) return null;
  const canonicalMatch = CANONICAL_UUID_PATTERN.exec(prepared);
  if (canonicalMatch)
    return canonicalMatch
      .slice(1)
      .join("")
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/u, "$1-$2-$3-$4-$5");
  if (!COMPACT_UUID_PATTERN.test(prepared)) return null;
  return prepared.replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/u,
    "$1-$2-$3-$4-$5",
  );
}

export function isValidNamespaceUuid(value: string) {
  return normalizeNamespaceUuid(value) !== null;
}

export function resolveNamespacePresetId(
  value: string,
): UuidV3NamespacePresetId | null {
  const normalized = normalizeNamespaceUuid(value);
  return (
    UUID_V3_NAMESPACE_PRESETS.find((preset) => preset.value === normalized)
      ?.id ?? null
  );
}

export function validateUuidV3Name(name: string): UuidV3ErrorCode | null {
  if (name.length > MAX_UUID_V3_NAME_LENGTH) return "too-large";
  if (/[\uD800-\uDFFF]/u.test(name)) return "invalid-unicode";
  return null;
}

function uuidToBytes(uuid: string) {
  const compact = uuid.replaceAll("-", "");
  return Uint8Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16),
  );
}

export function bytesToUuid(bytes: Uint8Array) {
  if (bytes.length !== 16)
    throw new RangeError("UUID byte array must contain exactly 16 bytes");
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/u, "$1-$2-$3-$4-$5");
}

function generateNameHashUuid(
  normalizedNamespace: string,
  name: string,
  version: 3 | 5,
) {
  const namespaceBytes = uuidToBytes(normalizedNamespace);
  const nameBytes = new TextEncoder().encode(name);
  const data = new Uint8Array(16 + nameBytes.length);
  data.set(namespaceBytes);
  data.set(nameBytes, 16);
  const hash = (version === 3 ? md5(data) : sha1(data)).slice(0, 16);
  hash[6] = (hash[6] & 15) | (version << 4);
  hash[8] = (hash[8] & 63) | 128;
  return bytesToUuid(hash);
}

export function generateUuidV3(namespace: string, name: string): string {
  const normalizedNamespace = normalizeNamespaceUuid(namespace);
  if (!normalizedNamespace) throw new UuidV3Error("invalid-namespace");
  const nameError = validateUuidV3Name(name);
  if (nameError) throw new UuidV3Error(nameError);
  return generateNameHashUuid(normalizedNamespace, name, 3);
}
export function generateNameUuid(
  namespace: string,
  name: string,
  version: 3 | 5,
): string {
  if (version !== 3 && version !== 5)
    throw new Error("Unsupported UUID name version");
  if (name.length > MAX_UUID_NAME_LENGTH) throw new UuidNameError("too_large");
  if (namespace.length !== 36) throw new UuidNameError("invalid_namespace");
  const normalized = namespace.toLowerCase();
  if (
    !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(
      normalized,
    ) &&
    normalized !== "00000000-0000-0000-0000-000000000000" &&
    normalized !== "ffffffff-ffff-ffff-ffff-ffffffffffff"
  )
    throw new UuidNameError("invalid_namespace");
  for (const point of name) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const code = point.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff)
      throw new UuidNameError("invalid_unicode");
  }
  return generateNameHashUuid(normalized, name, version);
}
