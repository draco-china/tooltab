import { z } from "zod";
export const barcodeFormats = [
  "CODE128",
  "CODE128A",
  "CODE128B",
  "CODE128C",
  "EAN13",
  "EAN8",
  "EAN5",
  "EAN2",
  "UPC",
  "UPCE",
  "CODE39",
  "ITF",
  "ITF14",
  "MSI",
  "MSI10",
  "MSI11",
  "MSI1010",
  "MSI1110",
  "pharmacode",
  "codabar",
  "CODE93",
] as const;
export const barcodeOptionsSchema = z.strictObject({
  text: z.string().max(100000).default("0123456789"),
  format: z.enum(barcodeFormats).default("CODE128"),
  width: z.number().int().min(1).max(8).default(2),
  height: z.number().int().min(20).max(300).default(100),
  margin: z.number().int().min(0).max(30).default(10),
  displayValue: z.boolean().default(true),
  textAlign: z.enum(["left", "center", "right"]).default("center"),
  textPosition: z.enum(["top", "bottom"]).default("bottom"),
  fontSize: z.number().int().min(8).max(48).default(20),
  lineColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#000000"),
  background: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#ffffff"),
});
export type BarcodeOptions = z.output<typeof barcodeOptionsSchema>;
export const BARCODE_IMAGE_LIMIT = 32 * 1024 * 1024,
  BARCODE_PIXEL_LIMIT = 32 * 1024 * 1024;
export class BarcodeError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "invalid_options"
      | "capacity"
      | "too_large"
      | "unsupported"
      | "decode_failed"
      | "timeout"
      | "busy",
  ) {
    super(code);
    this.name = "BarcodeError";
  }
}
export type BarcodeImage = { svg: string; width: number; height: number };
export type BarcodeReadResult = {
  text: string;
  format: string;
  width: number;
  height: number;
  kind: string;
  href: string | null;
} | null;
