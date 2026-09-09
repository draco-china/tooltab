export const MAX_ULID_TIME = 281474976710655;

export type UlidOptions = {
  count?: number;
  timestamp?: number;
  monotonic?: boolean;
};

export class ShortIdError extends Error {
  constructor(
    public readonly code:
      | "invalid-count"
      | "invalid-time"
      | "unsupported"
      | "generation-failed",
  ) {
    super(code);
  }
}

function randomBytes(size: number) {
  if (typeof globalThis.crypto?.getRandomValues !== "function")
    throw new ShortIdError("unsupported");
  return crypto.getRandomValues(new Uint8Array(size));
}

function randomFloat() {
  const bytes = randomBytes(4);
  return new DataView(bytes.buffer).getUint32(0) / 4294967296;
}

export async function generateShortIds(
  kind: "ulid",
  options: UlidOptions = {},
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const count = options.count ?? 1;
  const timestamp = options.timestamp ?? Date.now();
  const monotonicOption = options.monotonic === true;
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new ShortIdError("invalid-count");
  if (
    !Number.isInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > MAX_ULID_TIME
  )
    throw new ShortIdError("invalid-time");

  randomBytes(1);
  try {
    const { ulid, monotonicFactory } = await import("ulid");
    const monotonic = monotonicFactory(randomFloat);
    // ulid treats zero as Date.now(); use one as the seed and restore the epoch prefix.
    const seed = timestamp === 0 ? 1 : timestamp;
    const create = () => {
      const value = monotonicOption ? monotonic(seed) : ulid(seed, randomFloat);
      return timestamp === 0 ? `0000000000${value.slice(10)}` : value;
    };
    const ids: string[] = [];
    for (let index = 0; index < count; index++) {
      signal?.throwIfAborted();
      ids.push(create());
      if (index % 20 === 19 && index + 1 < count)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    return {
      kind,
      ids,
      count,
      length: 26,
      timestamp,
      monotonic: monotonicOption,
    };
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ShortIdError) throw error;
    throw new ShortIdError("generation-failed");
  }
}

export function ulidCalendarTime(value: string) {
  const match =
    /^(\d{4,5})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      value,
    );
  if (!match || value !== value.trim()) throw new ShortIdError("invalid-time");
  const parts = [
    ...match.slice(1, 7).map((part) => Number(part ?? 0)),
    Number((match[7] ?? "").padEnd(3, "0")),
  ];
  const date = new Date(0);
  date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  date.setUTCHours(parts[3], parts[4], parts[5], parts[6]);
  const actual = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ];
  if (
    actual.some((part, index) => part !== parts[index]) ||
    date.getTime() < 0 ||
    date.getTime() > MAX_ULID_TIME
  )
    throw new ShortIdError("invalid-time");
  return date.getTime();
}

export function ulidCalendarText(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_ULID_TIME) return "";
  return new Date(value)
    .toISOString()
    .replace(/^\+(\d{6})/, (_, year: string) => String(Number(year)))
    .replace(/Z$/, "");
}
