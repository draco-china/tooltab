import {
  BaseEncodingError,
  type BaseEncodingOptions,
  MAX_BASE_BYTES,
} from "./base-contract";

// Keep the existing public API while sharing the lazy implementation contract.
export {
  BASE58_ALPHABETS,
  BaseEncodingError,
  type BaseEncodingOptions,
  MAX_BASE_BYTES,
} from "./base-contract";

export const MAX_BASE_SOURCE_CHARACTERS = 4 * MAX_BASE_BYTES;
export const BASE_PREVIEW_CHARACTERS = 2000;
export type BaseKind = "base16" | "base32" | "base58" | "base85";
function limitBytes(bytes: Uint8Array) {
  if (bytes.length > MAX_BASE_BYTES) throw new BaseEncodingError("too-large");
}
export function baseTextBytes(text: string): Uint8Array<ArrayBuffer> {
  if (text.length > MAX_BASE_BYTES) throw new BaseEncodingError("too-large");
  if (/[\uD800-\uDFFF]/u.test(text))
    throw new BaseEncodingError("invalid-utf8");
  const bytes = new TextEncoder().encode(text);
  limitBytes(bytes);
  return bytes;
}
function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new BaseEncodingError("invalid-utf8");
  }
}
export function baseBytesText(bytes: Uint8Array): string {
  limitBytes(bytes);
  return decodeUtf8(bytes);
}
export function baseSourceText(bytes: Uint8Array): string {
  if (bytes.length > MAX_BASE_SOURCE_CHARACTERS)
    throw new BaseEncodingError("too-large");
  return decodeUtf8(bytes);
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
type SynchronousBaseKind = Exclude<BaseKind, "base58">;

/** RFC 4648 Base32 encoding without the generic byte-capacity policy. */
export function encodeBase32(bytes: Uint8Array, padding = true): string {
  const symbols = Array.from(
    { length: Math.ceil((bytes.length * 8) / 5) },
    (_, index) => {
      const bit = index * 5;
      const byte = Math.floor(bit / 8);
      const pair = (bytes[byte] << 8) | (bytes[byte + 1] ?? 0);
      return alphabet[(pair >>> (11 - (bit % 8))) & 31];
    },
  ).join("");
  return padding
    ? symbols.padEnd(Math.ceil(symbols.length / 8) * 8, "=")
    : symbols;
}

function prepareBase32(source: string) {
  const normalized = source.replace(/\s/g, "").toUpperCase();
  if (/[^A-Z2-7=]/.test(normalized))
    throw new BaseEncodingError("invalid-encoding");
  const symbols = normalized.replace(/=+$/, "");
  if (symbols.includes("=")) throw new BaseEncodingError("invalid-encoding");
  return { normalized, symbols };
}

function decodePreparedBase32(
  normalized: string,
  symbols: string,
): Uint8Array<ArrayBuffer> {
  const length = Math.floor((symbols.length * 5) / 8);
  const bytes = Uint8Array.from({ length }, (_, index) => {
    const bit = index * 8;
    const offset = Math.floor(bit / 5);
    const value =
      ((alphabet.indexOf(symbols[offset]) & 31) << 10) |
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      ((alphabet.indexOf(symbols[offset + 1]!) & 31) << 5) |
      ((symbols[offset + 2] ? alphabet.indexOf(symbols[offset + 2]) : 0) & 31);
    return (value >>> (7 - (bit % 5))) & 255;
  });
  // Canonical re-encoding validates length, complete padding and zero unused bits.
  if (encodeBase32(bytes, normalized.includes("=")) !== normalized)
    throw new BaseEncodingError("invalid-encoding");
  return bytes;
}

/** RFC 4648 Base32 decoding without the generic source/output limits. */
export function decodeBase32(source: string): Uint8Array<ArrayBuffer> {
  const { normalized, symbols } = prepareBase32(source);
  return decodePreparedBase32(normalized, symbols);
}

export function encodeBase(
  bytes: Uint8Array,
  kind: SynchronousBaseKind,
  padding?: boolean,
  options?: BaseEncodingOptions,
): string;
export function encodeBase(
  bytes: Uint8Array,
  kind: "base58",
  padding?: boolean,
  options?: BaseEncodingOptions,
): Promise<string>;
export function encodeBase(
  bytes: Uint8Array,
  kind: BaseKind,
  padding?: boolean,
  options?: BaseEncodingOptions,
): string | Promise<string>;
export function encodeBase(
  bytes: Uint8Array,
  kind: BaseKind,
  padding = true,
  options: BaseEncodingOptions = {},
): string | Promise<string> {
  limitBytes(bytes);
  if (kind === "base58") {
    const snapshot = bytes.slice();
    const settings = { ...options };
    return import("./base58-wasm")
      .then((module) => module.encode58(snapshot, settings))
      .finally(() => snapshot.fill(0));
  }
  if (kind === "base85") return encodeBase85(bytes, options);
  if (kind === "base16")
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  return encodeBase32(bytes, padding);
}
function prepareBase16(source: string) {
  const normalized = source
    .replace(/[ \t\r\n]/g, "")
    .replace(/^0x/i, "")
    .toUpperCase();
  if (normalized.length % 2 || /[^0-9A-F]/.test(normalized))
    throw new BaseEncodingError("invalid-encoding");

  return normalized;
}
function decodePreparedBase16(normalized: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length: normalized.length / 2 }, (_, index) =>
    Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16),
  );
}
export function decodeBase16(source: string): Uint8Array<ArrayBuffer> {
  return decodePreparedBase16(prepareBase16(source));
}

export function decodeBase(
  source: string,
  kind: SynchronousBaseKind,
  options?: BaseEncodingOptions,
): Uint8Array<ArrayBuffer>;
export function decodeBase(
  source: string,
  kind: "base58",
  options?: BaseEncodingOptions,
): Promise<Uint8Array<ArrayBuffer>>;
export function decodeBase(
  source: string,
  kind: BaseKind,
  options?: BaseEncodingOptions,
): Uint8Array<ArrayBuffer> | Promise<Uint8Array<ArrayBuffer>>;
export function decodeBase(
  source: string,
  kind: BaseKind,
  options: BaseEncodingOptions = {},
): Uint8Array<ArrayBuffer> | Promise<Uint8Array<ArrayBuffer>> {
  if (source.length > MAX_BASE_SOURCE_CHARACTERS)
    throw new BaseEncodingError("too-large");
  if (kind === "base58") {
    const settings = { ...options };
    return import("./base58-wasm").then((module) =>
      module.decode58(source, settings),
    );
  }
  if (kind === "base85") {
    try {
      return decodeBase85(source, options);
    } catch (error) {
      if (error instanceof BaseEncodingError)
        throw new BaseEncodingError(error.code);
      throw error;
    }
  }
  if (kind === "base16") {
    const normalized = prepareBase16(source);
    if (normalized.length / 2 > MAX_BASE_BYTES)
      throw new BaseEncodingError("too-large");
    return decodePreparedBase16(normalized);
  }
  const { normalized, symbols } = prepareBase32(source);
  if (Math.floor((symbols.length * 5) / 8) > MAX_BASE_BYTES)
    throw new BaseEncodingError("too-large");
  return decodePreparedBase32(normalized, symbols);
}
export function basePreview(bytes: Uint8Array): {
  text: string | null;
  preview: string;
  truncated: boolean;
} {
  let text: string;
  try {
    text = baseBytesText(bytes);
  } catch (error) {
    if (error instanceof BaseEncodingError && error.code === "invalid-utf8")
      return { text: null, preview: "", truncated: false };
    throw error;
  }
  const characters = Array.from(text);
  return {
    text,
    preview: characters.slice(0, BASE_PREVIEW_CHARACTERS).join(""),
    truncated: characters.length > BASE_PREVIEW_CHARACTERS,
  };
}

const Z85_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#";
function alphabet85(options: BaseEncodingOptions): string {
  if (options.variant && !["ascii85", "z85"].includes(options.variant))
    throw new BaseEncodingError("invalid-encoding");
  return options.variant === "z85"
    ? Z85_ALPHABET
    : Array.from({ length: 85 }, (_, index) =>
        String.fromCharCode(33 + index),
      ).join("");
}
export function encodeBase85(
  bytes: Uint8Array,
  options: BaseEncodingOptions = {},
): string {
  const alphabet = alphabet85(options);
  const z85 = options.variant === "z85";
  if (z85 && bytes.length % 4) throw new BaseEncodingError("invalid-encoding");
  const blocks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 4) {
    const length = Math.min(4, bytes.length - offset);
    let value = 0;
    for (let i = 0; i < 4; i++) value = value * 256 + (bytes[offset + i] ?? 0);
    if (!z85 && length === 4 && value === 0) {
      blocks.push("z");
      continue;
    }
    let encoded = "";
    for (let i = 0; i < 5; i++) {
      encoded = alphabet[value % 85] + encoded;
      value = Math.floor(value / 85);
    }
    blocks.push(encoded.slice(0, length + 1));
  }
  return blocks.join("");
}
class Base85DecodingError extends BaseEncodingError {
  constructor(
    message: string,
    code: "invalid-encoding" | "too-large" = "invalid-encoding",
  ) {
    super(code);
    this.message = message;
  }
}
export function decodeBase85(
  source: string,
  options: BaseEncodingOptions = {},
): Uint8Array<ArrayBuffer> {
  if (source.length > MAX_BASE_SOURCE_CHARACTERS)
    throw new Base85DecodingError("Base85 input is too large", "too-large");
  const alphabet = alphabet85(options);
  const z85 = options.variant === "z85";
  let text = source.replace(/\s/g, "");
  if (!z85) {
    const start = text.startsWith("<~");
    const end = text.endsWith("~>");
    if (start !== end)
      throw new Base85DecodingError("Invalid Base85 delimiter");
    if (start) text = text.slice(2, -2);
  }
  if (z85 && text.length % 5)
    throw new Base85DecodingError("Invalid Base85 length");
  const output: number[] = [];
  let digits: number[] = [];
  const emit = (length: number) => {
    let value = 0;
    for (let i = 0; i < 5; i++) value = value * 85 + (digits[i] ?? 84);
    if (value > 0xffffffff)
      throw new Base85DecodingError("Invalid Base85 value");
    if (output.length + length > MAX_BASE_BYTES)
      throw new Base85DecodingError(
        "Decoded Base85 output is too large",
        "too-large",
      );
    for (let i = 0; i < length; i++)
      output.push(Math.floor(value / 256 ** (3 - i)) % 256);
    digits = [];
  };
  for (const character of text) {
    if (!z85 && character === "z") {
      if (digits.length) throw new Base85DecodingError("Invalid Base85 length");
      if (output.length + 4 > MAX_BASE_BYTES)
        throw new Base85DecodingError(
          "Decoded Base85 output is too large",
          "too-large",
        );
      output.push(0, 0, 0, 0);
      continue;
    }
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Base85DecodingError("Invalid Base85 character");
    digits.push(value);
    if (digits.length === 5) emit(4);
  }
  if (digits.length) {
    if (z85 || digits.length === 1)
      throw new Base85DecodingError("Invalid Base85 length");
    emit(digits.length - 1);
  }
  return Uint8Array.from(output);
}
