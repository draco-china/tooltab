import {
  BaseEncodingError,
  baseTextBytes,
  encodeBase,
} from "@workspace/tools/encoding/base";

export const MAX_BASE32_BYTES = 1024 * 1024;

export type Base32EncoderErrorCode =
  | "too-large"
  | "invalid-utf8"
  | "read-failed";

export class Base32EncoderError extends Error {
  constructor(public readonly code: Base32EncoderErrorCode) {
    super(code);
    this.name = "Base32EncoderError";
  }
}

function mapEncodingError(error: unknown): Base32EncoderError {
  if (error instanceof BaseEncodingError && error.code === "too-large") {
    return new Base32EncoderError("too-large");
  }
  return new Base32EncoderError("invalid-utf8");
}

export function encodeBytesAsBase32(
  bytes: Uint8Array | ArrayBuffer,
  options: Readonly<{ padding?: boolean }> = {},
) {
  const input = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (input.length > MAX_BASE32_BYTES) {
    throw new Base32EncoderError("too-large");
  }
  return encodeBase(input, "base32", options.padding);
}

export function encodeTextAsBase32(value: string) {
  try {
    return encodeBase(baseTextBytes(value), "base32");
  } catch (error) {
    throw mapEncodingError(error);
  }
}

export async function encodeBase32(source: Blob) {
  if (source.size > MAX_BASE32_BYTES) {
    throw new Base32EncoderError("too-large");
  }
  try {
    return encodeBytesAsBase32(await source.arrayBuffer());
  } catch (error) {
    if (error instanceof Base32EncoderError) throw error;
    throw new Base32EncoderError("read-failed");
  }
}

export function deriveEncodedFileName(fileName?: string | null) {
  if (fileName === undefined) return "encoded.base32.txt";
  if (!fileName) return "file.b32";
  const baseName = fileName.replace(/\.[^/.]+$/, "");
  return baseName ? `${baseName}.b32` : "file.b32";
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
