export const UUID_V6_MAX_COUNT = 100;
export const UUID_CLOCK_SEQUENCE_MAX = 0x3fff;

const UUID_V6_MIN_COUNT = 1;
const UUID_NODE_BYTE_LENGTH = 6;
const UUID_BYTE_LENGTH = 16;
const UUID_TIMESTAMP_MAX = (1n << 60n) - 1n;
const GREGORIAN_UNIX_EPOCH_OFFSET_100NS = 122_192_928_000_000_000n;

export const UUID_V6_MIN_UNIX_MILLISECONDS = Number(
  -GREGORIAN_UNIX_EPOCH_OFFSET_100NS / 10_000n,
);
export const UUID_V6_MAX_UNIX_MILLISECONDS = Number(
  (UUID_TIMESTAMP_MAX - GREGORIAN_UNIX_EPOCH_OFFSET_100NS) / 10_000n,
);

export type UuidV6NodeMode = "random" | "custom";
export type UuidV6ClockSequenceMode = "random" | "custom";

type GenerateUuidV6Options = Readonly<{
  unixMilliseconds: number;
  subMillisecondTick?: number;
  clockSequence: number;
  node: Uint8Array;
}>;

type GenerateUuidV6BatchOptions = Readonly<{
  count: number;
  unixMilliseconds: number;
  nodeMode: UuidV6NodeMode;
  customNode?: Uint8Array;
  clockSequenceMode: UuidV6ClockSequenceMode;
  customClockSequence?: number;
}>;

const HEX_BYTE = Array.from({ length: 256 }, (_, value) =>
  value.toString(16).padStart(2, "0"),
);

function hexByte(value: number) {
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  return HEX_BYTE[value]!;
}

export function normalizeUuidV6Count(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return UUID_V6_MIN_COUNT;
  }
  return Math.min(
    Math.max(Math.floor(value), UUID_V6_MIN_COUNT),
    UUID_V6_MAX_COUNT,
  );
}

export function isValidUuidV6UnixMilliseconds(unixMilliseconds: number) {
  if (!Number.isFinite(unixMilliseconds)) return false;
  const floored = Math.floor(unixMilliseconds);
  return (
    floored >= UUID_V6_MIN_UNIX_MILLISECONDS &&
    floored <= UUID_V6_MAX_UNIX_MILLISECONDS
  );
}

export function isValidUuidClockSequence(value: number) {
  return (
    Number.isInteger(value) && value >= 0 && value <= UUID_CLOCK_SEQUENCE_MAX
  );
}

export function parseUuidNode(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/[:-]/gu, "").replace(/\./gu, "");
  const hasValidShape =
    /^[0-9a-f]{12}$/iu.test(trimmed) ||
    /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/iu.test(trimmed) ||
    /^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/iu.test(trimmed);
  if (!hasValidShape || !/^[0-9a-f]{12}$/iu.test(normalized)) {
    throw new Error("Invalid UUID node ID.");
  }
  return Uint8Array.from({ length: UUID_NODE_BYTE_LENGTH }, (_, index) =>
    Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16),
  );
}

export function formatUuidNode(node: Uint8Array) {
  if (node.length !== UUID_NODE_BYTE_LENGTH) {
    throw new Error("UUID node ID requires 6 bytes.");
  }
  return Array.from(node, (byte) => hexByte(byte).toUpperCase()).join(":");
}

export function createRandomUuidNode() {
  const node = crypto.getRandomValues(new Uint8Array(UUID_NODE_BYTE_LENGTH));
  node[0] = (node[0] & 0xfe) | 0x02;
  return node;
}

export function createRandomUuidClockSequence() {
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  return ((bytes[0] << 8) | bytes[1]) & UUID_CLOCK_SEQUENCE_MAX;
}

export function unixMillisecondsToUuidTimestamp(unixMilliseconds: number) {
  if (!isValidUuidV6UnixMilliseconds(unixMilliseconds)) {
    throw new RangeError("UUID v6 timestamp out of range.");
  }
  return (
    BigInt(Math.floor(unixMilliseconds)) * 10_000n +
    GREGORIAN_UNIX_EPOCH_OFFSET_100NS
  );
}

export function bytesToUuid(bytes: Uint8Array) {
  if (bytes.length !== UUID_BYTE_LENGTH) {
    throw new Error("UUID requires 16 bytes.");
  }
  const hex = Array.from(bytes, hexByte).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createUuidV6Bytes({
  unixMilliseconds,
  subMillisecondTick = 0,
  clockSequence,
  node,
}: GenerateUuidV6Options) {
  if (!Number.isInteger(subMillisecondTick) || subMillisecondTick < 0) {
    throw new RangeError("UUID v6 sub-millisecond tick must be non-negative.");
  }
  if (!isValidUuidClockSequence(clockSequence)) {
    throw new RangeError("UUID clock sequence out of range.");
  }
  if (node.length !== UUID_NODE_BYTE_LENGTH) {
    throw new Error("UUID node ID requires 6 bytes.");
  }
  const timestamp =
    unixMillisecondsToUuidTimestamp(unixMilliseconds) +
    BigInt(subMillisecondTick);
  if (timestamp > UUID_TIMESTAMP_MAX) {
    throw new RangeError("UUID v6 timestamp out of range.");
  }
  const timeHigh = Number((timestamp >> 28n) & 0xffff_ffffn);
  const timeMid = Number((timestamp >> 12n) & 0xffffn);
  const timeLow = Number(timestamp & 0xfffn);
  const bytes = new Uint8Array(UUID_BYTE_LENGTH);
  bytes[0] = (timeHigh >>> 24) & 0xff;
  bytes[1] = (timeHigh >>> 16) & 0xff;
  bytes[2] = (timeHigh >>> 8) & 0xff;
  bytes[3] = timeHigh & 0xff;
  bytes[4] = (timeMid >>> 8) & 0xff;
  bytes[5] = timeMid & 0xff;
  bytes[6] = 0x60 | ((timeLow >>> 8) & 0x0f);
  bytes[7] = timeLow & 0xff;
  bytes[8] = 0x80 | ((clockSequence >>> 8) & 0x3f);
  bytes[9] = clockSequence & 0xff;
  bytes.set(node, 10);
  return bytes;
}

export function generateUuidV6(options: GenerateUuidV6Options) {
  return bytesToUuid(createUuidV6Bytes(options));
}

export function generateUuidV6Batch({
  count,
  unixMilliseconds,
  nodeMode,
  customNode,
  clockSequenceMode,
  customClockSequence,
}: GenerateUuidV6BatchOptions) {
  return Array.from({ length: normalizeUuidV6Count(count) }, (_, index) =>
    generateUuidV6({
      unixMilliseconds,
      subMillisecondTick: index,
      clockSequence:
        clockSequenceMode === "custom"
          ? (customClockSequence ?? 0)
          : createRandomUuidClockSequence(),
      node:
        nodeMode === "custom"
          ? (customNode ?? new Uint8Array(6))
          : createRandomUuidNode(),
    }),
  );
}
