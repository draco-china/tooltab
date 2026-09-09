import { CssGeneratorError } from "@workspace/tools/css/generators";
import { runGradientWorker } from "./raster-worker-client";
/** Shared RGBA rasterization runs off the UI thread; Canvas only encodes the resulting pixels. */
export async function renderGradient(
  input: unknown,
  width: number,
  height: number,
  format: "png" | "jpeg" | "webp",
  signal?: AbortSignal,
) {
  const pixels = await runGradientWorker({ input, width, height }, signal);
  signal?.throwIfAborted();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new CssGeneratorError("export_failed");
    context.putImageData(
      new ImageData(new Uint8ClampedArray(pixels.buffer), width, height),
      0,
      0,
    );
    if (format === "jpeg") {
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value?.type === `image/${format}`
            ? resolve(value)
            : reject(new CssGeneratorError("export_failed")),
        `image/${format}`,
        0.92,
      ),
    );
    signal?.throwIfAborted();
    return blob;
  } finally {
    canvas.width = canvas.height = 0;
  }
}
