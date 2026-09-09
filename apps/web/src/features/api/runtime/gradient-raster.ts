import { CssGeneratorError } from "@workspace/tools/css/generators";
import { runGradientWorker } from "@/features/tools/css-generators/raster-worker-client";
import { ImageServiceError, MAX_IMAGE_OUTPUT_BYTES } from "./image-resizer";
import { serviceWorkerUrl } from "./worker-url";
export async function gradientRasterBytes(
  input: unknown,
  width: number,
  height: number,
  format: "png" | "jpeg" | "webp",
  signal?: AbortSignal,
  limit = MAX_IMAGE_OUTPUT_BYTES,
) {
  const pixels = await runGradientWorker(
    { input, width, height },
    signal,
    import.meta.env.PROD
      ? () =>
          new Worker(
            serviceWorkerUrl("gradient-raster-worker", import.meta.url),
            { type: "module" },
          )
      : undefined,
  );
  try {
    signal?.throwIfAborted();
    const { default: sharp } = await import("sharp");
    signal?.throwIfAborted();
    const encoder = sharp(pixels, {
      raw: { width, height, channels: 4 },
      limitInputPixels: 32_000_000,
    }).timeout({ seconds: 30 });
    const abort = () =>
      encoder.destroy(
        signal?.reason instanceof Error
          ? signal.reason
          : new DOMException("Aborted", "AbortError"),
      );
    encoder.on("error", () => {});
    signal?.addEventListener("abort", abort, { once: true });
    try {
      if (format === "jpeg")
        encoder.flatten({ background: "#ffffff" }).jpeg({ quality: 92 });
      else if (format === "webp") encoder.webp({ quality: 92 });
      else encoder.png();
      const { data, info } = await encoder.toBuffer({
        resolveWithObject: true,
      });
      signal?.throwIfAborted();
      if (data.length > limit) throw new ImageServiceError("OUTPUT_TOO_LARGE");
      if (
        info.width !== width ||
        info.height !== height ||
        info.format !== format
      )
        throw new CssGeneratorError("export_failed");
      return data;
    } finally {
      signal?.removeEventListener("abort", abort);
      encoder.destroy();
    }
  } finally {
    pixels.fill(0);
  }
}
