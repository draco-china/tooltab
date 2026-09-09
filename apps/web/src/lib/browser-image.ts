import {
  type Dimensions,
  exportOptions,
  type ImageFormat,
  validateDimensions,
  validateFile,
} from "@workspace/tools/image/options";
export async function decodeImage(file: File, signal?: AbortSignal) {
  validateFile(file);
  signal?.throwIfAborted();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Error("decodeError");
  }
  try {
    signal?.throwIfAborted();
    validateDimensions(bitmap);
    return bitmap;
  } catch (error) {
    bitmap.close();
    throw error;
  }
}
export async function renderImage(
  source: CanvasImageSource,
  size: Dimensions,
  format: ImageFormat,
  quality: number,
  signal?: AbortSignal,
): Promise<Blob> {
  validateDimensions(size);
  const options = exportOptions(format, quality);
  signal?.throwIfAborted();
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  let abort: (() => void) | undefined;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("canvasUnsupported");
    if (format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.drawImage(source, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      abort = () => reject(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error("unsupported"))),
        options.type,
        options.quality,
      );
    });
    signal?.throwIfAborted();
    if (blob.type !== options.type) throw Error("unsupported");
    return blob;
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
    canvas.width = canvas.height = 0;
  }
}
