export const NANO_ALPHABETS = {
  "url-safe":
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_",
  alphanumeric:
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  numbers: "0123456789",
  "hex-lowercase": "0123456789abcdef",
  "hex-uppercase": "0123456789ABCDEF",
} as const;

export type NanoPreset = keyof typeof NANO_ALPHABETS | "custom";

export type NanoOptions = {
  count?: number;
  length?: number;
  preset?: NanoPreset;
  alphabet?: string;
};

export class ShortIdError extends Error {
  constructor(
    public readonly code:
      | "invalid-count"
      | "invalid-length"
      | "invalid-alphabet"
      | "unsupported"
      | "generation-failed",
  ) {
    super(code);
  }
}

export function alphabetMetrics(alphabet: string) {
  const chars = Array.from(alphabet);
  const unique = new Set(chars);
  return {
    unique: unique.size,
    duplicates: [
      ...new Set(chars.filter((char, index) => chars.indexOf(char) !== index)),
    ],
  };
}

function randomBytes(size: number) {
  if (typeof globalThis.crypto?.getRandomValues !== "function")
    throw new ShortIdError("unsupported");
  return crypto.getRandomValues(new Uint8Array(size));
}

function resolveAlphabet(options: NanoOptions) {
  const preset = options.preset ?? "url-safe";
  const source =
    preset === "custom"
      ? (options.alphabet ?? "")
      : Object.hasOwn(NANO_ALPHABETS, preset)
        ? NANO_ALPHABETS[preset as keyof typeof NANO_ALPHABETS]
        : "";
  if (
    source.length > 1024 ||
    /[\uD800-\uDFFF]/u.test(source) ||
    /[\r\n\u2028\u2029]/u.test(source)
  )
    throw new ShortIdError("invalid-alphabet");
  const alphabet = Array.from(source);
  const metrics = alphabetMetrics(source);
  if (metrics.unique < 2 || metrics.unique > 256 || metrics.duplicates.length)
    throw new ShortIdError("invalid-alphabet");
  return alphabet;
}

export async function generateShortIds(
  kind: "nanoid",
  options: NanoOptions = {},
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const count = options.count ?? 5;
  const length = options.length ?? 21;
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new ShortIdError("invalid-count");
  if (!Number.isInteger(length) || length < 1 || length > 128)
    throw new ShortIdError("invalid-length");
  const alphabet = resolveAlphabet(options);
  randomBytes(1);
  try {
    const { customRandom } = await import("nanoid");
    // Indexing a BMP alphabet preserves arbitrary Unicode scalar values.
    const indices = alphabet
      .map((_, index) => String.fromCharCode(256 + index))
      .join("");
    const nano = customRandom(indices, length, randomBytes);
    const create = () =>
      Array.from(nano(), (char) => alphabet[char.charCodeAt(0) - 256]).join("");
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      signal?.throwIfAborted();
      ids.push(create());
      if (i % 20 === 19 && i + 1 < count)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    return { kind, ids, count, length, timestamp: null, monotonic: false };
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ShortIdError) throw error;
    throw new ShortIdError("generation-failed");
  }
}
