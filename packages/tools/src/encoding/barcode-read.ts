import { readBarcodes } from "zxing-wasm/reader";
import { classifyBarcodeContent } from "./barcode-content";
import {
  BARCODE_PIXEL_LIMIT,
  BarcodeError,
  type BarcodeReadResult,
} from "./barcode-contract";

export const readerFormats = [
  "QRCode",
  "DataMatrix",
  "PDF417",
  "Aztec",
  "Code128",
  "Code39",
  "Code93",
  "Codabar",
  "EAN13",
  "EAN8",
  "UPCA",
  "UPCE",
  "ITF",
] as const;
export async function readBarcode(
  data: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
): Promise<BarcodeReadResult> {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > BARCODE_PIXEL_LIMIT ||
    data.length !== width * height * 4
  )
    throw new BarcodeError("too_large");
  let pixels = data;
  for (let i = 3; i < data.length; i += 4)
    if (data[i] !== 255) {
      pixels = new Uint8ClampedArray(data);
      for (let j = 0; j < pixels.length; j += 4) {
        const a = pixels[j + 3] / 255;
        for (let c = 0; c < 3; c++)
          pixels[j + c] = pixels[j + c] * a + 255 * (1 - a);
        pixels[j + 3] = 255;
      }
      break;
    }
  const image = { data: pixels, width, height, colorSpace: "srgb" as const };
  try {
    const results = await readBarcodes(image, {
      formats: [...readerFormats],
      maxNumberOfSymbols: 1,
      tryHarder: true,
      textMode: "Plain",
    });
    const result = results[0];
    if (!result) return null;
    // ZXing 3 exposes normalized GTIN text; retain the actual UPC symbol representation.
    const extra = JSON.parse(result.extra || "{}") as Record<string, unknown>;
    const text =
      result.format === "UPCE" && typeof extra.UPCE === "string"
        ? extra.UPCE
        : (result.format === "UPCA" || result.format === "EAN13") &&
            result.text.length === 13 &&
            result.text.startsWith("0")
          ? result.text.slice(1)
          : result.text;
    return {
      text,
      format:
        result.format === "EAN13" && text.length === 12
          ? "UPCA"
          : result.format,
      width,
      height,
      ...classifyBarcodeContent(text),
    };
  } catch {
    throw new BarcodeError("decode_failed");
  } finally {
    if (pixels !== data) pixels.fill(0);
  }
}
