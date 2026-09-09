import {
  BARCODE_IMAGE_LIMIT,
  BarcodeError,
  type BarcodeImage,
} from "@workspace/tools/encoding/barcode-contract";

export async function barcodeBlob(
  image: BarcodeImage,
  format: "png" | "jpeg" | "webp" | "svg",
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const svg = new Blob([image.svg], { type: "image/svg+xml" });
  if (format === "svg") return svg;
  const element = new Image(),
    canvas = document.createElement("canvas"),
    url = URL.createObjectURL(svg);
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal?.reason);
  });
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    await Promise.race([
      cancelled,
      new Promise<void>((resolve, reject) => {
        element.onload = () => resolve();
        element.onerror = () => reject(new BarcodeError("unsupported"));
        element.src = url;
      }),
    ]);
    signal?.throwIfAborted();
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new BarcodeError("unsupported");
    ctx.drawImage(element, 0, 0);
    const blob = await Promise.race([
      cancelled,
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new BarcodeError("unsupported"))),
          `image/${format}`,
          0.95,
        ),
      ),
    ]);
    signal?.throwIfAborted();
    if (blob.size > BARCODE_IMAGE_LIMIT) throw new BarcodeError("too_large");
    if (blob.type !== `image/${format}`) throw new BarcodeError("unsupported");
    return blob;
  } finally {
    signal?.removeEventListener("abort", abort);
    element.onload = element.onerror = null;
    element.src = "";
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}
