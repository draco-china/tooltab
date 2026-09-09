import { parseUuid } from "./inspect";

export const GREGORIAN_OFFSET = 122192928000000000n;
export const MAX_TIME_TICKS = (1n << 60n) - 1n;
export const MIN_TIME_MS = Number(-GREGORIAN_OFFSET / 10000n);
export const MAX_TIME_MS = Number((MAX_TIME_TICKS - GREGORIAN_OFFSET) / 10000n);

export class UuidTimeError extends Error {
  constructor(
    public readonly code:
      | "invalid_count"
      | "invalid_timestamp"
      | "invalid_tick"
      | "invalid_node"
      | "invalid_sequence"
      | "crypto_unavailable"
      | "invalid_uuid"
      | "invalid_version"
      | "invalid_variant",
  ) {
    super(code);
  }
}

export function normalizeNode(value: string): string {
  if (value.trim() !== value) throw new UuidTimeError("invalid_node");
  if (
    !/^(?:[\da-f]{12}|(?:[\da-f]{2}:){5}[\da-f]{2}|(?:[\da-f]{2}-){5}[\da-f]{2}|(?:[\da-f]{4}\.){2}[\da-f]{4})$/i.test(
      value,
    ) ||
    value.length > 17
  )
    throw new UuidTimeError("invalid_node");
  return value.replaceAll(/[:.-]/g, "").toLowerCase();
}

function randomBytes(count: number) {
  try {
    return globalThis.crypto.getRandomValues(new Uint8Array(count));
  } catch {
    throw new UuidTimeError("crypto_unavailable");
  }
}

export function randomTimeNode() {
  const bytes = randomBytes(6);
  bytes[0] |= 3;
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function randomTimeSequence() {
  const bytes = randomBytes(2);
  return ((bytes[0] << 8) | bytes[1]) & 0x3fff;
}

export function timeUuidFromFields(
  version: 1 | 6,
  ticks: bigint,
  node: string,
  sequence: number,
): string {
  if (version !== 1 && version !== 6)
    throw new UuidTimeError("invalid_version");
  if (ticks < 0n || ticks > MAX_TIME_TICKS)
    throw new UuidTimeError("invalid_timestamp");
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 16383)
    throw new UuidTimeError("invalid_sequence");
  const nodeHex = normalizeNode(node);
  const prefix =
    version === 1
      ? `${(ticks & 0xffffffffn).toString(16).padStart(8, "0")}${((ticks >> 32n) & 0xffffn).toString(16).padStart(4, "0")}1${(ticks >> 48n).toString(16).padStart(3, "0")}`
      : `${(ticks >> 12n).toString(16).padStart(12, "0")}6${(ticks & 0xfffn).toString(16).padStart(3, "0")}`;
  return `${prefix.slice(0, 8)}-${prefix.slice(8, 12)}-${prefix.slice(12)}-${(sequence | 0x8000).toString(16)}-${nodeHex}`;
}

export interface TimeUuidOptions {
  version: 1 | 6;
  count?: number;
  timestamp?: number;
  tick?: number;
  node?: string;
  sequence?: number;
}

export function generateTimeUuid({
  version,
  count = 1,
  timestamp = Date.now(),
  tick = 0,
  node,
  sequence,
}: TimeUuidOptions) {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new UuidTimeError("invalid_count");
  if (
    !Number.isInteger(timestamp) ||
    timestamp < MIN_TIME_MS ||
    timestamp > MAX_TIME_MS
  )
    throw new UuidTimeError("invalid_timestamp");
  if (
    !Number.isInteger(tick) ||
    tick < 0 ||
    tick > 9999 ||
    tick + count > 10000
  )
    throw new UuidTimeError("invalid_tick");
  const ticks = BigInt(timestamp) * 10000n + GREGORIAN_OFFSET + BigInt(tick);
  if (ticks + BigInt(count - 1) > MAX_TIME_TICKS)
    throw new UuidTimeError("invalid_timestamp");
  if (node !== undefined) normalizeNode(node);
  if (
    sequence !== undefined &&
    (!Number.isInteger(sequence) || sequence < 0 || sequence > 16383)
  )
    throw new UuidTimeError("invalid_sequence");
  const sharedNode = version === 1 ? (node ?? randomTimeNode()) : undefined;
  const sharedSequence =
    version === 1 ? (sequence ?? randomTimeSequence()) : undefined;
  return {
    timestamp,
    values: Array.from({ length: count }, (_, index) =>
      timeUuidFromFields(
        version,
        ticks + BigInt(index),
        node ?? sharedNode ?? randomTimeNode(),
        sequence ?? sharedSequence ?? randomTimeSequence(),
      ),
    ),
  };
}

export function convertTimeUuid(input: string, from: 1 | 6) {
  if (from !== 1 && from !== 6) throw new UuidTimeError("invalid_version");
  let bits: bigint;
  try {
    bits = parseUuid(input);
  } catch {
    throw new UuidTimeError("invalid_uuid");
  }
  const hex = bits.toString(16).padStart(32, "0");
  if (Number.parseInt(hex[12], 16) !== from)
    throw new UuidTimeError("invalid_version");
  if ((Number.parseInt(hex[16], 16) & 12) !== 8)
    throw new UuidTimeError("invalid_variant");
  const ticks =
    from === 1
      ? (BigInt(`0x${hex.slice(13, 16)}`) << 48n) |
        (BigInt(`0x${hex.slice(8, 12)}`) << 32n) |
        BigInt(`0x${hex.slice(0, 8)}`)
      : (BigInt(`0x${hex.slice(0, 12)}`) << 12n) |
        BigInt(`0x${hex.slice(13, 16)}`);
  const node = hex.slice(20);
  const sequence = Number.parseInt(hex.slice(16, 20), 16) & 16383;
  return {
    v1: timeUuidFromFields(1, ticks, node, sequence),
    v6: timeUuidFromFields(6, ticks, node, sequence),
  };
}
