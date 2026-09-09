import { getConstants, init, isCuid } from "@paralleldrive/cuid2";

const { defaultLength, bigLength } = getConstants();
export const CUID2_DEFAULT_LENGTH = defaultLength;
export const CUID2_MAX_LENGTH = bigLength;
export const CUID2_MIN_LENGTH = 2;
export const CUID2_MAX_COUNT = 100;
export class ShortIdError extends Error {
  constructor(
    public readonly code:
      | "invalid-count"
      | "invalid-length"
      | "unsupported"
      | "generation-failed",
  ) {
    super(code);
  }
}
export function normalizeCuid2Length(value: number) {
  return Number.isFinite(value)
    ? Math.min(CUID2_MAX_LENGTH, Math.max(CUID2_MIN_LENGTH, Math.floor(value)))
    : CUID2_DEFAULT_LENGTH;
}
export function normalizeCuid2Count(value: number) {
  return Number.isFinite(value)
    ? Math.min(CUID2_MAX_COUNT, Math.max(1, Math.floor(value)))
    : 1;
}
function secureRandom() {
  if (typeof globalThis.crypto?.getRandomValues !== "function")
    throw new ShortIdError("unsupported");
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return (bytes[0] ?? 0) / 4294967296;
}

export function generateCuid2Ids(count: number, length: number) {
  const normalizedCount = normalizeCuid2Count(count);
  const normalizedLength = normalizeCuid2Length(length);
  secureRandom();
  const create = init({ length: normalizedLength, random: secureRandom });
  return Array.from({ length: normalizedCount }, () => create());
}

export async function generateShortIds(
  kind: "cuid2",
  options: { count?: number; length?: number } = {},
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const count = options.count ?? 1;
  const length = options.length ?? CUID2_DEFAULT_LENGTH;
  if (!Number.isInteger(count) || count < 1 || count > CUID2_MAX_COUNT)
    throw new ShortIdError("invalid-count");
  if (
    !Number.isInteger(length) ||
    length < CUID2_MIN_LENGTH ||
    length > CUID2_MAX_LENGTH
  )
    throw new ShortIdError("invalid-length");
  try {
    const ids = generateCuid2Ids(count, length);
    signal?.throwIfAborted();
    return { kind, ids, count, length };
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ShortIdError) throw error;
    throw new ShortIdError("generation-failed");
  }
}
export function isValidCuid2(value: string) {
  return isCuid(value, {
    minLength: CUID2_MIN_LENGTH,
    maxLength: CUID2_MAX_LENGTH,
  });
}
