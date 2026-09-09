import {
  BaseEncodingError,
  baseTextBytes,
  encodeBase,
  MAX_BASE_BYTES,
} from "@workspace/tools/encoding/base";

export type Base16EncoderErrorCode =
  | "too-large"
  | "invalid-utf8"
  | "read-failed";

export class Base16EncoderError extends Error {
  constructor(public readonly code: Base16EncoderErrorCode) {
    super(code);
    this.name = "Base16EncoderError";
  }
}

export function encodeTextAsBase16(value: string) {
  try {
    return encodeBase(baseTextBytes(value), "base16");
  } catch (error) {
    if (
      error instanceof BaseEncodingError &&
      (error.code === "too-large" || error.code === "invalid-utf8")
    )
      throw new Base16EncoderError(error.code);
    throw error;
  }
}

export async function encodeBase16(source: Blob) {
  if (source.size > MAX_BASE_BYTES) {
    throw new Base16EncoderError("too-large");
  }
  try {
    return encodeBase(new Uint8Array(await source.arrayBuffer()), "base16");
  } catch (error) {
    if (error instanceof Base16EncoderError) throw error;
    if (error instanceof BaseEncodingError && error.code === "too-large")
      throw new Base16EncoderError("too-large");
    throw new Base16EncoderError("read-failed");
  }
}

export function deriveEncodedFileName(fileName?: string | null) {
  if (fileName === undefined) return "encoded.hex.txt";
  if (!fileName) return "file.hex";
  const baseName = fileName.replace(/\.[^/.]+$/, "");
  return baseName ? `${baseName}.hex` : "file.hex";
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
