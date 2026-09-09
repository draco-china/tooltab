import { runBarcodeReaderWorker } from "./reader-worker-client";
import {
  BARCODE_IMAGE_LIMIT,
  BARCODE_PIXEL_LIMIT,
  BarcodeError,
} from "@workspace/tools/encoding/barcode-contract";

export async function readBarcodeFile(file: File, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!file.type.startsWith("image/")) throw new BarcodeError("invalid_input");
  if (file.size > BARCODE_IMAGE_LIMIT) throw new BarcodeError("too_large");
  const bitmap = await createImageBitmap(file);
  let canvas: HTMLCanvasElement | undefined;
  try {
    canvas = document.createElement("canvas");
    signal?.throwIfAborted();
    if (bitmap.width * bitmap.height > BARCODE_PIXEL_LIMIT)
      throw new BarcodeError("too_large");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new BarcodeError("unsupported");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    try {
      return await runBarcodeReaderWorker(
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
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
