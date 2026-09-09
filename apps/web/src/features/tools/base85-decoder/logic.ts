import {
  BaseEncodingError,
  decodeBase85 as decodeBytes,
  MAX_BASE_BYTES,
  MAX_BASE_SOURCE_CHARACTERS,
} from "@workspace/tools/encoding/base";

export class Base85DecoderError extends Error {
  constructor(
    public readonly code: "invalid-encoding" | "too-large" | "unsupported",
  ) {
    super(code);
  }
}
export type Base85Variant = "ascii85" | "z85";
export type DecodeBase85PreviewResult =
  | { state: "empty" }
  | { state: "invalid-base85" }
  | {
      state: "decoded";
      bytes: Uint8Array<ArrayBuffer>;
      text: string | null;
      previewText: string;
      isPreviewTruncated: boolean;
    };

export const PREVIEW_CHARACTER_LIMIT = 2000;
export const MAX_BASE85_SOURCE_CHARACTERS = MAX_BASE_SOURCE_CHARACTERS;
export const MAX_DECODED_BYTES = MAX_BASE_BYTES;

export function isBase85Variant(value: string): value is Base85Variant {
  return value === "ascii85" || value === "z85";
}

export function decodeBase85(
  input: string,
  options: Readonly<{ variant?: Base85Variant }> = {},
) {
  try {
    return decodeBytes(input, options);
  } catch (error) {
    if (error instanceof BaseEncodingError) throw new Error(error.message);
    throw error;
  }
}

export function previewBase85Bytes(
  bytes: Uint8Array<ArrayBuffer>,
): Extract<DecodeBase85PreviewResult, { state: "decoded" }> {
  let text: string | null = null;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    text = null;
  }
  const characters = text === null ? [] : Array.from(text);
  const isPreviewTruncated = characters.length > PREVIEW_CHARACTER_LIMIT;
  return {
    state: "decoded",
    bytes,
    text,
    previewText: isPreviewTruncated
      ? `${characters.slice(0, PREVIEW_CHARACTER_LIMIT).join("")}...`
      : (text ?? ""),
    isPreviewTruncated,
  };
}

export function decodeBase85Preview(
  input: string,
  variant: Base85Variant,
): DecodeBase85PreviewResult {
  if (!input.trim()) return { state: "empty" };
  try {
    const bytes = decodeBase85(input, { variant });
    return previewBase85Bytes(bytes);
  } catch {
    return { state: "invalid-base85" };
  }
}

export function deriveDecodedFileName(fileName?: string | null) {
  if (!fileName) return "decoded.bin";
  const baseName = fileName.replace(/\.[^/.]+$/u, "");
  return baseName ? `${baseName}.bin` : "decoded.bin";
}
