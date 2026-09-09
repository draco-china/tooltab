import * as z from "zod/v4";
import {
  isPlaceholderText,
  placeholderDefaults,
  placeholderSvg,
} from "@workspace/tools/image/placeholder";
import {
  MAX_IMAGE_PIXELS,
  validateDimensions,
} from "@workspace/tools/image/options";
import {
  ImageServiceError,
  imageOutputSchema,
  MAX_IMAGE_OUTPUT_BYTES,
} from "./image-resizer";
import type { Operation } from "./operation-contract";

const color = z
  .string()
  .regex(/^#[\da-fA-F]{6}$/)
  .length(7);
const text = z
  .string()
  .max(500)
  .refine(isPlaceholderText, "Text must contain valid XML Unicode characters");
export const placeholderInputSchema = z.strictObject({
  width: z
    .number()
    .int()
    .positive()
    .max(8192)
    .default(placeholderDefaults.width),
  height: z
    .number()
    .int()
    .positive()
    .max(8192)
    .default(placeholderDefaults.height),
  scale: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  backgroundType: z.enum(["solid", "linear", "radial"]).default("solid"),
  background: color.default(placeholderDefaults.background),
  endColor: color.default(placeholderDefaults.endColor),
  text: text.default(""),
  textColor: color.default(placeholderDefaults.textColor),
  format: z.enum(["png", "jpeg", "webp", "svg"]).default("png"),
});
export const placeholderOutputSchema = imageOutputSchema;
let active = 0;
export async function generatePlaceholderBytes(
  input: unknown,
  signal?: AbortSignal,
  outputLimit = MAX_IMAGE_OUTPUT_BYTES,
) {
  signal?.throwIfAborted();
  const parsed = placeholderInputSchema.safeParse(input);
  if (!parsed.success) throw new ImageServiceError("INVALID_OPTIONS");
  const options = parsed.data;
  const width = options.width * options.scale,
    height = options.height * options.scale;
  try {
    validateDimensions({ width, height });
  } catch {
    throw new ImageServiceError("INVALID_DIMENSIONS");
  }
  const svg = Buffer.from(placeholderSvg(options));
  if (options.format === "svg") {
    if (svg.length > outputLimit)
      throw new ImageServiceError("OUTPUT_TOO_LARGE");
    return { data: svg, mimeType: "image/svg+xml", width, height };
  }
  const { default: sharp } = await import("sharp");
  signal?.throwIfAborted();
  if (active >= 2) throw new ImageServiceError("BUSY");
  active++;
  const renderer = sharp(svg, {
    limitInputPixels: MAX_IMAGE_PIXELS,
    limitInputChannels: 4,
    failOn: "warning",
  }).timeout({ seconds: 10 });
  const abort = () =>
    renderer.destroy(
      signal?.reason instanceof Error
        ? signal.reason
        : new DOMException("Aborted", "AbortError"),
    );
  renderer.on("error", () => {});
  signal?.addEventListener("abort", abort, { once: true });
  try {
    renderer.toColourspace("srgb");
    if (options.format === "jpeg")
      renderer.flatten({ background: "#ffffff" }).jpeg({ quality: 92 });
    else if (options.format === "webp") renderer.webp({ quality: 92 });
    else renderer.png();
    const { data, info } = await renderer.toBuffer({ resolveWithObject: true });
    signal?.throwIfAborted();
    if (data.length > outputLimit)
      throw new ImageServiceError("OUTPUT_TOO_LARGE");
    if (
      info.width !== width ||
      info.height !== height ||
      info.format !== options.format
    )
      throw new ImageServiceError("DECODE_FAILED");
    return { data, mimeType: `image/${options.format}`, width, height };
  } catch (cause) {
    signal?.throwIfAborted();
    if (cause instanceof ImageServiceError) throw cause;
    throw new ImageServiceError("DECODE_FAILED");
  } finally {
    signal?.removeEventListener("abort", abort);
    renderer.destroy();
    active--;
  }
}
export async function runPlaceholder(input: unknown, signal?: AbortSignal) {
  const result = await generatePlaceholderBytes(input, signal);
  return {
    output: result.data.toString("base64"),
    encoding: "base64" as const,
    mimeType: result.mimeType,
    width: result.width,
    height: result.height,
    bytes: result.data.length,
  };
}
export const placeholderOperation: Operation = {
  id: "placeholder-generator",
  name: "tooltab_placeholder_generator",
  description:
    "Generate a local SVG, PNG, JPEG or WebP placeholder with solid/linear/radial background and centered text. Raster text uses installed system fonts; output is base64 up to 6 MiB.",
  inputSchema: placeholderInputSchema,
  outputSchema: placeholderOutputSchema,
  bodyLimit: 10000,
  idempotent: true,
  run: runPlaceholder,
};
