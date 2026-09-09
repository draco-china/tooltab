import * as z from "zod/v4";
import { colorValues, extractPalette } from "@workspace/tools/image/palette";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_PIXELS,
  validateDimensions,
} from "@workspace/tools/image/options";
import { readAuthorizedFile } from "./files";
import {
  decodeImageCarrier,
  ImageServiceError,
  imageFormat,
  MAX_IMAGE_BASE64,
} from "./image-resizer";
export class PaletteError extends Error {
  readonly code = "NO_OPAQUE_COLORS";
  constructor() {
    super("No sampled pixels have alpha >=128.");
  }
}
const options = z.strictObject({
  count: z.number().int().min(2).max(12).default(6),
  format: z.enum(["hex", "css", "json"]).default("hex"),
});
export const paletteInputSchema = options.extend({
  input: z.string().max(MAX_IMAGE_BASE64),
});
export const palettePathSchema = options.extend({
  inputPath: z.string().min(1).max(4096),
});
export const paletteMcpSchema = z.union([
  paletteInputSchema,
  palettePathSchema,
]);
export const paletteOutputSchema = z.strictObject({
  colors: z.array(
    z.strictObject({ hex: z.string(), rgb: z.string(), hsl: z.string() }),
  ),
  output: z.string(),
  format: z.enum(["hex", "css", "json"]),
  sampleWidth: z.number(),
  sampleHeight: z.number(),
});
let active = 0;
export async function extractImagePalette(
  source: Uint8Array,
  input: unknown = {},
  signal?: AbortSignal,
) {
  const parsed = options.parse(input);
  signal?.throwIfAborted();
  if (!source.length || source.length > MAX_FILE_BYTES)
    throw new ImageServiceError("INPUT_TOO_LARGE");
  const expected = imageFormat(
    Buffer.from(source.buffer, source.byteOffset, source.byteLength),
  );
  const { default: sharp } = await import("sharp");
  signal?.throwIfAborted();
  if (active >= 2) throw new ImageServiceError("BUSY");
  active++;
  const decoder = sharp(source, {
    limitInputPixels: MAX_IMAGE_PIXELS,
    limitInputChannels: 4,
    pages: 1,
    failOn: "warning",
  }).timeout({ seconds: 10 });
  decoder.on("error", () => {});
  const abort = () =>
    decoder.destroy(
      signal?.reason instanceof Error
        ? signal.reason
        : new DOMException("Aborted", "AbortError"),
    );
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const metadata = await decoder.metadata();
    signal?.throwIfAborted();
    if (metadata.format !== expected)
      throw new ImageServiceError("INVALID_IMAGE");
    let original = validateDimensions({
      width: metadata.width,
      height: metadata.pageHeight ?? metadata.height,
    });
    if (metadata.orientation && metadata.orientation >= 5)
      original = { width: original.height, height: original.width };
    const ratio = Math.min(1, 192 / Math.max(original.width, original.height));
    const sampleWidth = Math.max(1, Math.round(original.width * ratio));
    const sampleHeight = Math.max(1, Math.round(original.height * ratio));
    const { data } = await decoder
      .autoOrient()
      .resize(sampleWidth, sampleHeight, { fit: "fill" })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    signal?.throwIfAborted();
    const hex = extractPalette(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      parsed.count,
    );
    if (!hex.length) throw new PaletteError();
    const colors = hex.map(colorValues);
    const output =
      parsed.format === "css"
        ? `:root {\n${hex.map((color, i) => `  --color-${i + 1}: ${color};`).join("\n")}\n}`
        : parsed.format === "json"
          ? JSON.stringify(colors, null, 2)
          : hex.join("\n");
    return { colors, output, format: parsed.format, sampleWidth, sampleHeight };
  } catch (cause) {
    signal?.throwIfAborted();
    if (cause instanceof PaletteError || cause instanceof ImageServiceError)
      throw cause;
    throw new ImageServiceError("DECODE_FAILED");
  } finally {
    signal?.removeEventListener("abort", abort);
    decoder.destroy();
    active--;
  }
}
export async function runImagePalette(
  input: unknown,
  signal?: AbortSignal,
  roots?: readonly string[],
) {
  if (
    roots !== undefined &&
    typeof input === "object" &&
    input !== null &&
    "inputPath" in input
  ) {
    const { inputPath, ...parsed } = palettePathSchema.parse(input);
    return extractImagePalette(
      await readAuthorizedFile(inputPath, roots, signal),
      parsed,
      signal,
    );
  }
  const { input: carrier, ...parsed } = paletteInputSchema.parse(input);
  return extractImagePalette(decodeImageCarrier(carrier), parsed, signal);
}
