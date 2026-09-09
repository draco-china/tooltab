export class PasswordToolError extends Error {
  constructor(
    public code:
      | "invalid_input"
      | "invalid_options"
      | "too_large"
      | "random_unavailable"
      | "unsupported"
      | "timeout"
      | "busy"
      | "artifact_required",
  ) {
    super(code);
  }
}
export const MAX_PASSWORD_OUTPUT = 1024 * 1024;
export const CHARSETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()_+-={}[]|:;<>,.?/~",
} as const;
export type Charset = keyof typeof CHARSETS;
export type GeneratorOptions = {
  mode: "random" | "words" | "separator" | "pin";
  length: number;
  charsets: Charset[];
  excludeSimilar: boolean;
  wordCount: number;
  separator: string;
  capitalize: boolean;
  includeNumber: boolean;
  blockLength: number;
  blockCount: number;
  blockSeparator: string;
  allowLeadingZero: boolean;
};
export const generatorDefaults: GeneratorOptions = {
  mode: "random",
  length: 16,
  charsets: ["upper", "lower", "digits"],
  excludeSimilar: true,
  wordCount: 4,
  separator: "-",
  capitalize: false,
  includeNumber: false,
  blockLength: 3,
  blockCount: 3,
  blockSeparator: "-",
  allowLeadingZero: true,
};
export function wellFormed(text: string) {
  if (
    typeof text !== "string" ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
      text,
    )
  )
    throw new PasswordToolError("invalid_input");
}
function positive(n: number) {
  if (!Number.isInteger(n) || n < 1)
    throw new PasswordToolError("invalid_options");
  if (n > MAX_PASSWORD_OUTPUT) throw new PasswordToolError("too_large");
}
function checkedSeparator(value: string) {
  wellFormed(value);
  if (new TextEncoder().encode(value).length > 16384)
    throw new PasswordToolError("too_large");
  return value || "-";
}
export function charsetPool(charsets: Charset[], excludeSimilar: boolean) {
  if (
    !Array.isArray(charsets) ||
    charsets.some((c) => !Object.hasOwn(CHARSETS, c)) ||
    typeof excludeSimilar !== "boolean"
  )
    throw new PasswordToolError("invalid_options");
  const keys = charsets.length
    ? [...new Set(charsets)]
    : generatorDefaults.charsets;
  const pool = keys.map((k) => CHARSETS[k]).join("");
  return excludeSimilar ? pool.replace(/[Il1O0]/g, "") : pool;
}
// Reject the incomplete tail of the uint32 range; no modulo bias and no Math.random fallback.
export function secureIndex() {
  let buffer = new Uint32Array(0),
    cursor = 0;
  return (size: number) => {
    if (!Number.isInteger(size) || size < 1 || size > 0xffffffff)
      throw new PasswordToolError("invalid_options");
    const limit = Math.floor(0x100000000 / size) * size;
    for (let attempt = 0; attempt < 128; attempt++) {
      if (cursor === buffer.length) {
        buffer = new Uint32Array(1024);
        try {
          globalThis.crypto.getRandomValues(buffer);
        } catch {
          throw new PasswordToolError("random_unavailable");
        }
        cursor = 0;
      }
      const n = buffer[cursor++];
      if (n < limit) return n % size;
    }
    throw new PasswordToolError("random_unavailable");
  };
}
export async function generatePassword(o: GeneratorOptions) {
  if (!["random", "words", "separator", "pin"].includes(o.mode))
    throw new PasswordToolError("invalid_options");
  const index = secureIndex();
  let output = "",
    samplingEntropyBits = 0;
  const encoder = new TextEncoder();
  function randomChars(length: number, pool: string) {
    const chunks: string[] = [];
    let pending = "";
    for (let n = 0; n < length; n++) {
      pending += pool[index(pool.length)];
      if (pending.length === 8192) {
        chunks.push(pending);
        pending = "";
      }
    }
    chunks.push(pending);
    return chunks.join("");
  }
  if (o.mode === "random") {
    positive(o.length);
    const pool = charsetPool(o.charsets, o.excludeSimilar);
    output = randomChars(o.length, pool);
    samplingEntropyBits = o.length * Math.log2(pool.length);
  } else if (o.mode === "pin") {
    positive(o.length);
    if (typeof o.allowLeadingZero !== "boolean")
      throw new PasswordToolError("invalid_options");
    output =
      (o.allowLeadingZero ? String(index(10)) : String(index(9) + 1)) +
      randomChars(o.length - 1, CHARSETS.digits);
    samplingEntropyBits =
      (o.length - 1) * Math.log2(10) + Math.log2(o.allowLeadingZero ? 10 : 9);
  } else if (o.mode === "separator") {
    positive(o.blockLength);
    positive(o.blockCount);
    const separator = checkedSeparator(o.blockSeparator),
      pool = charsetPool(o.charsets, o.excludeSimilar);
    if (
      o.blockLength * o.blockCount +
        (o.blockCount - 1) * encoder.encode(separator).length >
      MAX_PASSWORD_OUTPUT
    )
      throw new PasswordToolError("too_large");
    output = Array.from({ length: o.blockCount }, () =>
      randomChars(o.blockLength, pool),
    ).join(separator);
    samplingEntropyBits = o.blockLength * o.blockCount * Math.log2(pool.length);
  } else {
    positive(o.wordCount);
    if (
      typeof o.capitalize !== "boolean" ||
      typeof o.includeNumber !== "boolean"
    )
      throw new PasswordToolError("invalid_options");
    const separator = checkedSeparator(o.separator);
    const separatorBytes = encoder.encode(separator).length;
    if (
      o.wordCount +
        (o.wordCount - 1 + Number(o.includeNumber)) * separatorBytes >
      MAX_PASSWORD_OUTPUT
    )
      throw new PasswordToolError("too_large");
    const { default: words } = await import("bip39/src/wordlists/english.json");
    if (words.length !== 2048) throw new PasswordToolError("unsupported");
    const parts: string[] = [];
    let bytes = 0;
    for (let n = 0; n < o.wordCount; n++) {
      let word = words[index(words.length)];
      if (o.capitalize) word = word.charAt(0).toUpperCase() + word.slice(1);
      bytes += word.length + (n ? separatorBytes : 0);
      if (bytes > MAX_PASSWORD_OUTPUT) throw new PasswordToolError("too_large");
      parts.push(word);
    }
    if (o.includeNumber) parts.push(String(index(100)));
    output = parts.join(separator);
    samplingEntropyBits =
      o.wordCount * 11 + (o.includeNumber ? Math.log2(100) : 0);
  }
  const bytes = encoder.encode(output).length;
  if (bytes > MAX_PASSWORD_OUTPUT) throw new PasswordToolError("too_large");
  return {
    kind: "generated" as const,
    mode: o.mode,
    output,
    bytes,
    samplingEntropyBits,
  };
}
