import { DOMParser, type Element, XMLSerializer } from "@xmldom/xmldom";
import * as z from "zod/v4";
import {
  outputDimensions,
  type SvgXmlRuntime,
  svgViewport,
  validateSvg,
} from "@workspace/tools/image/svg";
import { imageMimes, MAX_IMAGE_PIXELS } from "@workspace/tools/image/options";
import {
  ImageServiceError,
  imageOutputSchema,
  MAX_IMAGE_OUTPUT_BYTES,
} from "./image-resizer";
export const MAX_SVG_BYTES = 2_000_000;
/** Never recover malformed XML or allow external entities. The shared validator rejects declarations before parsing. */
export const serverSvgXml: SvgXmlRuntime = {
  parse(source) {
    // XML mode preserves absent namespaces; SVG mode would synthesize one.
    const doc = new DOMParser({
      onError: () => {
        throw Error("svgInvalid");
      },
    }).parseFromString(source, "application/xml");
    if (!doc.documentElement) throw Error("svgInvalid");
    return doc as unknown as ReturnType<SvgXmlRuntime["parse"]>;
  },
  serialize(root) {
    return new XMLSerializer().serializeToString(root as unknown as Element);
  },
};
export const svgImageOptionsSchema = z.strictObject({
  width: z.number().int().positive().max(8192).optional(),
  height: z.number().int().positive().max(8192).optional(),
  scale: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  format: z.enum(["png", "jpeg", "webp"]).default("png"),
  quality: z.number().min(0.01).max(1).default(0.92),
  transparent: z.boolean().default(true),
  background: z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .default("#ffffff"),
});
export const svgImageInputSchema = svgImageOptionsSchema.extend({
  input: z.string().max(MAX_SVG_BYTES),
});
export const svgImagePathSchema = svgImageOptionsSchema.extend({
  inputPath: z.string().min(1).max(4096),
});
export const svgImageMcpInputSchema = z.union([
  svgImageInputSchema,
  svgImagePathSchema,
]);
export const svgImageOutputSchema = imageOutputSchema;
let active = 0;
export async function rasterizeSvgService(
  source: string,
  input: unknown,
  signal?: AbortSignal,
  outputLimit = MAX_IMAGE_OUTPUT_BYTES,
) {
  signal?.throwIfAborted();
  if (
    source.length > MAX_SVG_BYTES ||
    Buffer.byteLength(source, "utf8") > MAX_SVG_BYTES
  )
    throw new ImageServiceError("INPUT_TOO_LARGE");
  const parsed = svgImageOptionsSchema.safeParse(input);
  if (!parsed.success) throw new ImageServiceError("INVALID_OPTIONS");
  const options = parsed.data;
  if (active >= 2) throw new ImageServiceError("BUSY");
  active++;
  let decoder: import("sharp").Sharp | undefined;
  const abort = () =>
    decoder?.destroy(
      signal?.reason instanceof Error
        ? signal.reason
        : new DOMException("Aborted", "AbortError"),
    );
  try {
    let svg: ReturnType<typeof validateSvg>;
    try {
      svg = validateSvg(source, serverSvgXml);
    } catch {
      throw new ImageServiceError("INVALID_IMAGE");
    }
    const width = options.width ?? svg.width,
      height = options.height ?? svg.height;
    let size: { width: number; height: number };
    try {
      size = outputDimensions(width, height, options.scale);
    } catch {
      throw new ImageServiceError("INVALID_DIMENSIONS");
    }
    const safe = svgViewport(
      svg.source,
      width,
      height,
      options.scale,
      serverSvgXml,
    );
    const { default: sharp } = await import("sharp");
    signal?.throwIfAborted();
    decoder = sharp(Buffer.from(safe), {
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXELS,
      limitInputChannels: 4,
      pages: 1,
      sequentialRead: true,
    }).timeout({ seconds: 10 });
    decoder.on("error", () => {});
    signal?.addEventListener("abort", abort, { once: true });
    if (!options.transparent || options.format === "jpeg")
      decoder.flatten({ background: options.background });
    decoder.toColourspace("srgb");
    if (options.format === "png") decoder.png();
    else if (options.format === "jpeg")
      decoder.jpeg({ quality: Math.round(options.quality * 100) });
    else decoder.webp({ quality: Math.round(options.quality * 100) });
    const { data, info } = await decoder.toBuffer({ resolveWithObject: true });
    signal?.throwIfAborted();
    if (data.length > Math.min(outputLimit, MAX_IMAGE_OUTPUT_BYTES))
      throw new ImageServiceError("OUTPUT_TOO_LARGE");
    if (
      info.format !== options.format ||
      info.width !== size.width ||
      info.height !== size.height
    )
      throw new ImageServiceError("DECODE_FAILED");
    return { data, mimeType: imageMimes[options.format], ...size };
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ImageServiceError) throw error;
    throw new ImageServiceError("DECODE_FAILED");
  } finally {
    signal?.removeEventListener("abort", abort);
    decoder?.destroy();
    active--;
  }
}
export async function svgImageOperation(
  input: unknown,
  signal?: AbortSignal,
  roots?: readonly string[],
) {
  signal?.throwIfAborted();
  let source: string;
  let options: z.infer<typeof svgImageOptionsSchema>;
  if (
    roots !== undefined &&
    typeof input === "object" &&
    input !== null &&
    "inputPath" in input
  ) {
    const { inputPath, ...settings } = svgImagePathSchema.parse(input);
    options = settings;
    const { readAuthorizedFile } = await import("./files");
    const bytes = await readAuthorizedFile(inputPath, roots, signal);
    try {
      if (bytes.length > MAX_SVG_BYTES)
        throw new ImageServiceError("INPUT_TOO_LARGE");
      try {
        source = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
      } catch {
        throw new ImageServiceError("INVALID_IMAGE");
      }
    } finally {
      bytes.fill(0);
    }
  } else {
    const { input: content, ...settings } = svgImageInputSchema.parse(input);
    source = content;
    options = settings;
  }
  const result = await rasterizeSvgService(source, options, signal);
  return {
    output: result.data.toString("base64"),
    encoding: "base64" as const,
    mimeType: result.mimeType,
    width: result.width,
    height: result.height,
    bytes: result.data.length,
  };
}
