import { MAX_BASE_BYTES } from "@workspace/tools/encoding/base";

export type Base58EncoderErrorCode =
  | "too-large"
  | "read-failed"
  | "unsupported";

export class Base58EncoderError extends Error {
  constructor(public readonly code: Base58EncoderErrorCode) {
    super(code);
    this.name = "Base58EncoderError";
  }
}

export async function readBase58Source(source: Blob) {
  if (source.size > MAX_BASE_BYTES) {
    throw new Base58EncoderError("too-large");
  }
  try {
    return new Uint8Array(await source.arrayBuffer());
  } catch {
    throw new Base58EncoderError("read-failed");
  }
}

export function deriveBase58FileName(fileName?: string | null) {
  if (fileName === undefined) return "encoded.base58.txt";
  if (!fileName) return "file.b58";
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${stem || "file"}.b58`;
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
