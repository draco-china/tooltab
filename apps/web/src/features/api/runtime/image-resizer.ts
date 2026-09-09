import * as z from "zod/v4";
import {
  exportOptions,
  type ImageFormat,
  imageMimes,
  MAX_FILE_BYTES,
  MAX_IMAGE_PIXELS,
  validateDimensions,
} from "@workspace/tools/image/options";
export const MAX_IMAGE_OUTPUT_BYTES = 6 * 1024 * 1024;
export const MAX_IMAGE_BASE64 = 4 * Math.ceil(MAX_FILE_BYTES / 3);
export class ImageServiceError extends Error {
  constructor(
    public readonly code:
      | "INVALID_IMAGE"
      | "INVALID_DIMENSIONS"
      | "INVALID_OPTIONS"
      | "INPUT_TOO_LARGE"
      | "OUTPUT_TOO_LARGE"
      | "DECODE_FAILED"
      | "BUSY",
  ) {
    super(code);
  }
}
export const imageResizeOptionsSchema = z.strictObject({
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
  format: z.enum(["png", "jpeg", "webp"]).default("png"),
  quality: z.number().min(1).max(100).default(85),
});
export const imageInputSchema = imageResizeOptionsSchema.extend({
  input: z.string().max(MAX_IMAGE_BASE64),
});
export const imagePathSchema = imageResizeOptionsSchema.extend({
  inputPath: z.string().min(1).max(4096),
});
export const imageMcpInputSchema = z.union([imageInputSchema, imagePathSchema]);
export const imageOutputSchema = z.strictObject({
  output: z.string(),
  encoding: z.literal("base64"),
  mimeType: z.string(),
  width: z.number(),
  height: z.number(),
  bytes: z.number(),
});
export function imageFormat(bytes: Buffer): ImageFormat {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  throw new ImageServiceError("INVALID_IMAGE");
}
export function decodeImageCarrier(input: string, maxBytes = MAX_FILE_BYTES) {
  if (input.length > 4 * Math.ceil(maxBytes / 3))
    throw new ImageServiceError("INPUT_TOO_LARGE");
  if (input.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(input))
    throw new ImageServiceError("INVALID_IMAGE");
  const bytes = Buffer.from(input, "base64");
  if (bytes.toString("base64") !== input)
    throw new ImageServiceError("INVALID_IMAGE");
  if (bytes.length > maxBytes) throw new ImageServiceError("INPUT_TOO_LARGE");
  return bytes;
}
let activeImages = 0;
export async function resizeImageBytes(
  source: Uint8Array,
  input: unknown,
  signal?: AbortSignal,
  outputLimit = MAX_IMAGE_OUTPUT_BYTES,
) {
  signal?.throwIfAborted();
  const parsed = imageResizeOptionsSchema.safeParse(input);
  if (!parsed.success) throw new ImageServiceError("INVALID_OPTIONS");
  const options = parsed.data;
  try {
    validateDimensions(options);
    exportOptions(options.format, options.quality);
  } catch {
    throw new ImageServiceError("INVALID_DIMENSIONS");
  }
  if (source.byteLength > MAX_FILE_BYTES)
    throw new ImageServiceError("INPUT_TOO_LARGE");
  if (!source.byteLength) throw new ImageServiceError("INVALID_IMAGE");
  const bytes = Buffer.from(
    source.buffer,
    source.byteOffset,
    source.byteLength,
  );
  const expectedFormat = imageFormat(bytes);
  const { default: sharp } = await import("sharp");
  signal?.throwIfAborted();
  if (activeImages >= 2) throw new ImageServiceError("BUSY");
  activeImages++;
  const decoder = sharp(bytes, {
    failOn: "warning",
    limitInputPixels: MAX_IMAGE_PIXELS,
    limitInputChannels: 4,
    pages: 1,
    sequentialRead: true,
  }).timeout({ seconds: 10 });
  const abort = () =>
    decoder.destroy(
      signal?.reason instanceof Error
        ? signal.reason
        : new DOMException("Aborted", "AbortError"),
    );
  // Sharp's native operations may finish after stream destruction; always suppress aborted results.
  decoder.on("error", () => {});
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const metadata = await decoder.metadata();
    signal?.throwIfAborted();
    if (metadata.format !== expectedFormat)
      throw new ImageServiceError("INVALID_IMAGE");
    try {
      validateDimensions({
        width: metadata.width,
        height: metadata.pageHeight ?? metadata.height,
      });
    } catch {
      throw new ImageServiceError("INVALID_DIMENSIONS");
    }
    decoder
      .autoOrient()
      .resize(options.width, options.height, { fit: "fill" })
      .toColourspace("srgb");
    if (options.format === "jpeg")
      decoder
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: Math.round(options.quality) });
    else if (options.format === "webp")
      decoder.webp({ quality: Math.round(options.quality) });
    else decoder.png();
    // No keepMetadata/withMetadata: strip EXIF/XMP/ICC and other source metadata.
    const { data, info } = await decoder.toBuffer({ resolveWithObject: true });
    signal?.throwIfAborted();
    if (data.length > outputLimit)
      throw new ImageServiceError("OUTPUT_TOO_LARGE");
    if (
      info.format !== options.format ||
      info.width !== options.width ||
      info.height !== options.height
    )
      throw new ImageServiceError("DECODE_FAILED");
    return {
      data,
      mimeType: imageMimes[options.format],
      width: info.width,
      height: info.height,
    };
  } catch (cause) {
    signal?.throwIfAborted();
    if (cause instanceof ImageServiceError) throw cause;
    throw new ImageServiceError("DECODE_FAILED");
  } finally {
    signal?.removeEventListener("abort", abort);
    decoder.destroy();
    activeImages--;
  }
}
export async function resizeImageOperation(
  input: unknown,
  signal?: AbortSignal,
  roots?: readonly string[],
) {
  let source: Uint8Array;
  let options: z.infer<typeof imageResizeOptionsSchema>;
  if (
    roots !== undefined &&
    typeof input === "object" &&
    input !== null &&
    "inputPath" in input
  ) {
    const { inputPath, ...parsed } = imagePathSchema.parse(input);
    const { readAuthorizedFile } = await import("./files");
    source = await readAuthorizedFile(inputPath, roots, signal);
    options = parsed;
  } else {
    const { input: carrier, ...parsed } = imageInputSchema.parse(input);
    source = decodeImageCarrier(carrier);
    options = parsed;
  }
  const result = await resizeImageBytes(source, options, signal);
  return {
    output: result.data.toString("base64"),
    encoding: "base64" as const,
    mimeType: result.mimeType,
    width: result.width,
    height: result.height,
    bytes: result.data.length,
  };
}
