import { decodeBase32 } from "@workspace/tools/encoding/base";

export type DecodeBase32PreviewResult =
  | { state: "empty" }
  | { state: "invalid-base32" }
  | {
      state: "decoded";
      bytes: Uint8Array<ArrayBuffer>;
      text: string;
      previewText: string;
      isPreviewTruncated: boolean;
    };

export const PREVIEW_CHARACTER_LIMIT = 2000;

export function decodeBase32Preview(value: string): DecodeBase32PreviewResult {
  if (value.trim() === "") return { state: "empty" };
  try {
    const bytes = decodeBase32(value);
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
    return { state: "invalid-base32" };
  }
}

export function deriveDecodedFileName(fileName?: string | null) {
  if (!fileName) return "decoded.bin";
  const baseName = fileName.replace(/\.[^/.]+$/, "");
  return baseName ? `${baseName}.bin` : "decoded.bin";
}
