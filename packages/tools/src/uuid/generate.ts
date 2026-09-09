export const MAX_UUID_COUNT = 1000;
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export const MAX_UUID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
export class UuidGenerationError extends Error {
  constructor(public readonly code: "invalid_count" | "crypto_unavailable") {
    super(code);
  }
}
export function uuidV4FromBytes(source: Uint8Array): string {
  if (source.length !== 16) throw new Error("UUID requires exactly 16 bytes");
  const bytes = new Uint8Array(source);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function generateUuidV4(count = 1): string[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_UUID_COUNT)
    throw new UuidGenerationError("invalid_count");
  if (typeof globalThis.crypto?.getRandomValues !== "function")
    throw new UuidGenerationError("crypto_unavailable");
  try {
    const random = globalThis.crypto.getRandomValues(
      new Uint8Array(count * 16),
    );
    return Array.from({ length: count }, (_, index) =>
      uuidV4FromBytes(random.subarray(index * 16, index * 16 + 16)),
    );
  } catch {
    throw new UuidGenerationError("crypto_unavailable");
  }
}
export function uuidSentinel(kind: "nil" | "max") {
  if (kind !== "nil" && kind !== "max")
    throw new Error("Invalid UUID sentinel");
  const canonical = kind === "nil" ? NIL_UUID : MAX_UUID;
  return {
    canonical,
    hex: canonical.replaceAll("-", ""),
    urn: `urn:uuid:${canonical}`,
  };
}

export const MAX_UUID_TIMESTAMP = 281_474_976_710_655;
export class UuidV7Error extends Error {
  constructor(
    public readonly code:
      | "invalid_count"
      | "invalid_timestamp"
      | "crypto_unavailable"
      | "random_overflow",
  ) {
    super(code);
  }
}
export function uuidV7FromParts(timestamp: number, random: bigint): string {
  if (
    !Number.isInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > MAX_UUID_TIMESTAMP
  )
    throw new UuidV7Error("invalid_timestamp");
  if (random < 0n || random >= 1n << 74n)
    throw new UuidV7Error("random_overflow");
  const bits =
    (BigInt(timestamp) << 80n) |
    (7n << 76n) |
    ((random >> 62n) << 64n) |
    (2n << 62n) |
    (random & ((1n << 62n) - 1n));
  const hex = bits.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function generateUuidV7(
  count = 1,
  timestamp = Date.now(),
): { values: string[]; timestamp: number } {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new UuidV7Error("invalid_count");
  uuidV7FromParts(timestamp, 0n);
  let bytes: Uint8Array;
  try {
    bytes = globalThis.crypto.getRandomValues(new Uint8Array(10));
  } catch {
    throw new UuidV7Error("crypto_unavailable");
  }
  const seed =
    BigInt(
      `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
    ) &
    ((1n << 74n) - 1n);
  if (seed + BigInt(count - 1) >= 1n << 74n)
    throw new UuidV7Error("random_overflow");
  return {
    values: Array.from({ length: count }, (_, index) =>
      uuidV7FromParts(timestamp, seed + BigInt(index)),
    ),
    timestamp,
  };
}
