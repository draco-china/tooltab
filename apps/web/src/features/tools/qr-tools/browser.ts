import { qrPixels } from "@workspace/tools/encoding/qr-pixels";
import {
  QR_IMAGE_LIMIT,
  QR_PIXEL_LIMIT,
  QrError,
  type QrFormat,
  type QrMatrix,
  type QrOptions,
} from "@workspace/tools/encoding/qr-contract";
import { runQrWorker } from "./worker-client";
export async function qrBlob(
  matrix: QrMatrix,
  options: QrOptions,
  format: QrFormat,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (format === "svg")
    return new Blob([matrix.svg], { type: "image/svg+xml" });
  const pixels = qrPixels(matrix, options);
  let canvas: HTMLCanvasElement | undefined;
  let abort: (() => void) | undefined;
  try {
    canvas = document.createElement("canvas");
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new QrError("unsupported");
    ctx.putImageData(
      new ImageData(pixels.data, pixels.width, pixels.height),
      0,
      0,
    );
    const target = canvas;
    const blob = await new Promise<Blob>((resolve, reject) => {
      abort = () => reject(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      target.toBlob(
        (b) => (b ? resolve(b) : reject(new QrError("unsupported"))),
        `image/${format}`,
        0.92,
      );
    });
    signal?.throwIfAborted();
    if (blob.type !== `image/${format}`) throw new QrError("unsupported");
    return blob;
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
    pixels.data.fill(0);
    if (canvas) canvas.width = canvas.height = 0;
  }
}
export async function readQrFile(file: File, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!file.type.startsWith("image/")) throw new QrError("invalid_input");
  if (file.size > QR_IMAGE_LIMIT) throw new QrError("too_large");
  const bitmap = await createImageBitmap(file);
  let canvas: HTMLCanvasElement | undefined;
  try {
    canvas = document.createElement("canvas");
    signal?.throwIfAborted();
    if (bitmap.width * bitmap.height > QR_PIXEL_LIMIT)
      throw new QrError("too_large");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new QrError("unsupported");
    ctx.drawImage(bitmap, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    try {
      return await runQrWorker(
        {
          kind: "read",
          data: image.data,
          width: image.width,
          height: image.height,
        },
        signal,
      );
    } finally {
      image.data.fill(0);
    }
  } finally {
    bitmap.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
