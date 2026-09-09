import {
  BaseEncodingError,
  encodeBase85 as encodeBytes,
} from "@workspace/tools/encoding/base";

export type Base85Variant = "ascii85" | "z85";

export function isBase85Variant(value: string): value is Base85Variant {
  return value === "ascii85" || value === "z85";
}

export function encodeBase85(
  input: Uint8Array | ArrayBuffer,
  options: Readonly<{ variant?: Base85Variant }> = {},
) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  try {
    return encodeBytes(bytes, options);
  } catch (error) {
    if (error instanceof BaseEncodingError)
      throw new Error("Invalid Base85 length");
    throw error;
  }
}

export function deriveEncodedFileName(
  fileName: string | null,
  variant: Base85Variant,
) {
  const extension = variant === "z85" ? "z85" : "a85";
  if (!fileName) return `encoded.${extension}.txt`;
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${baseName}.${extension}`;
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
