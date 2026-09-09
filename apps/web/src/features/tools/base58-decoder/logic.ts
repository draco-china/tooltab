import {
  decodeBase58,
  type Base58Options,
} from "@workspace/tools/encoding/base58";

export type DecodeBase58PreviewResult =
  | { state: "empty" }
  | { state: "invalid-base58" }
  | {
      state: "decoded";
      bytes: Uint8Array<ArrayBuffer>;
      text: string;
      previewText: string;
      isPreviewTruncated: boolean;
    };

export const PREVIEW_CHARACTER_LIMIT = 2000;

export function decodeBase58Preview(
  value: string,
  options: Base58Options = {},
): DecodeBase58PreviewResult {
  if (value.trim() === "") return { state: "empty" };
  try {
    const bytes = decodeBase58(value, options);
    const text = new TextDecoder().decode(bytes);
    const isPreviewTruncated = text.length > PREVIEW_CHARACTER_LIMIT;
    return {
      state: "decoded",
      bytes,
      text,
      previewText: isPreviewTruncated
        ? `${text.slice(0, PREVIEW_CHARACTER_LIMIT)}...`
        : text,
      isPreviewTruncated,
    };
  } catch {
    return { state: "invalid-base58" };
  }
}

export function deriveDecodedFileName(fileName?: string | null) {
  if (!fileName) return "decoded.bin";
  const baseName = fileName.replace(/\.[^/.]+$/u, "");
  return baseName ? `${baseName}.bin` : "decoded.bin";
}
