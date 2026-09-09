const MAX_BASE_BYTES = 1024 * 1024;

export const MAX_BASE64_TEXT_BYTES = MAX_BASE_BYTES;
export const MAX_BASE64_CHARACTERS = 4 * Math.ceil(MAX_BASE64_TEXT_BYTES / 3);
export const MAX_BASE64_INPUT_CHARACTERS = MAX_BASE64_CHARACTERS * 2;

export type Base64ErrorCode = "too-large" | "invalid-base64" | "invalid-utf8";

export class Base64Error extends Error {
  constructor(public readonly code: Base64ErrorCode) {
    super(code);
    this.name = "Base64Error";
  }
}

/** Standard padded RFC 4648 Base64, with UTF-8 text as the byte source. */
export function encodeBase64Text(text: string): string {
  if (text.length > MAX_BASE64_TEXT_BYTES) throw new Base64Error("too-large");
  // TextEncoder would silently replace unpaired surrogates, losing input data.
  if (/[\uD800-\uDFFF]/u.test(text)) throw new Base64Error("invalid-utf8");
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_BASE64_TEXT_BYTES) throw new Base64Error("too-large");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function normalizeBase64Input(value: string) {
  return value.replace(/\s+/g, "");
}

/** Reject malformed alphabet, padding, non-zero pad bits and non-UTF-8 bytes. */
export function decodeBase64Text(encoded: string): string {
  if (encoded.length > MAX_BASE64_INPUT_CHARACTERS)
    throw new Base64Error("too-large");
  encoded = normalizeBase64Input(encoded);
  if (encoded.length > MAX_BASE64_CHARACTERS)
    throw new Base64Error("too-large");
  if (!encoded.includes("=") && encoded.length % 4 !== 1)
    encoded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  if (encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded))
    throw new Base64Error("invalid-base64");
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  if (encoded.slice(0, encoded.length - padding).includes("="))
    throw new Base64Error("invalid-base64");
  const binary = atob(encoded);
  if (btoa(binary) !== encoded) throw new Base64Error("invalid-base64");
  if (binary.length > MAX_BASE64_TEXT_BYTES) throw new Base64Error("too-large");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Base64Error("invalid-utf8");
  }
}

export const encodeBase64 = encodeBase64Text;
export const decodeBase64 = decodeBase64Text;

export function isValidBase64(value: string) {
  if (value.trim() === "") return true;
  try {
    decodeBase64Text(value);
    return true;
  } catch {
    return false;
  }
}
