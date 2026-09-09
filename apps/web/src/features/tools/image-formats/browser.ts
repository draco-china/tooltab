import {
  dimensions,
  type FormatOutput,
  type FormatSettings,
  ImageFormatError,
  MAX_FORMAT_INPUT,
  type Raster,
} from "@workspace/tools/image";
import { browserXml } from "./svg";
import { validateSvg } from "@workspace/tools/image/svg";
export async function decodeBrowser(
  file: File,
  signal: AbortSignal,
): Promise<Raster> {
  signal.throwIfAborted();
  if (file.size > MAX_FORMAT_INPUT) throw new ImageFormatError("input_limit");
  let source: Blob = file;
  const prefix = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (prefix[0] === 31 && prefix[1] === 139)
    throw new ImageFormatError("invalid_image");
  const head = new TextDecoder().decode(prefix);
  if (
    file.type.includes("svg") ||
    /\.svgz?$/i.test(file.name) ||
    head.trimStart().startsWith("<")
  ) {
    try {
      source = new Blob([validateSvg(await file.text(), browserXml).source], {
        type: "image/svg+xml",
      });
    } catch {
      throw new ImageFormatError("invalid_image");
    }
  }
  signal.throwIfAborted();
  const url = URL.createObjectURL(source),
    img = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const clean = () => {
        signal.removeEventListener("abort", abort);
        img.onload = null;
        img.onerror = null;
      };
      const abort = () => {
        clean();
        img.src = "";
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      img.onload = () => {
        clean();
        resolve();
      };
      img.onerror = () => {
        clean();
        reject(new ImageFormatError("invalid_image"));
      };
      signal.addEventListener("abort", abort, { once: true });
      img.src = url;
    });
    signal.throwIfAborted();
    const { width, height } = dimensions(img.naturalWidth, img.naturalHeight),
      canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new ImageFormatError("unsupported");
      ctx.drawImage(img, 0, 0);
      return {
        data: ctx.getImageData(0, 0, width, height).data,
        width,
        height,
      };
    } finally {
      canvas.width = canvas.height = 1;
    }
  } finally {
    img.src = "";
    URL.revokeObjectURL(url);
  }
}
function work<T>(
  payload: unknown,
  transfer: Transferable[],
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new ImageFormatError("unsupported"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    const close = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      close();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      close();
      reject(new ImageFormatError("timeout"));
    }, 120000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (e) => {
      e.preventDefault();
      close();
      reject(new ImageFormatError("unsupported"));
    };
    worker.onmessage = (e) => {
      close();
      if (e.data.error) reject(new ImageFormatError(e.data.error));
      else resolve(e.data);
    };
    try {
      worker.postMessage(payload, transfer);
    } catch {
      close();
      reject(new ImageFormatError("conversion_failed"));
    }
  });
}
export async function convertBrowser(
  raster: Raster,
  settings: FormatSettings,
  signal: AbortSignal,
) {
  return (
    await work<{ result: FormatOutput }>(
      { raster, settings },
      [raster.data.buffer],
      signal,
    )
  ).result;
}
export async function zipBrowser(
  archive: { name: string; bytes: Uint8Array<ArrayBuffer> }[],
  signal: AbortSignal,
) {
  return (
    await work<{ archive: Uint8Array<ArrayBuffer> }>({ archive }, [], signal)
  ).archive;
}
/** Safe source thumbnail: render vetted decoded pixels, never an unvalidated SVG URL. */
export async function previewBrowser(
  file: File,
  signal: AbortSignal,
): Promise<Blob> {
  const r = await decodeBrowser(file, signal),
    source = document.createElement("canvas"),
    target = document.createElement("canvas");
  source.width = r.width;
  source.height = r.height;
  const scale = Math.min(1, 256 / Math.max(r.width, r.height));
  target.width = Math.max(1, Math.round(r.width * scale));
  target.height = Math.max(1, Math.round(r.height * scale));
  try {
    const s = source.getContext("2d"),
      t = target.getContext("2d");
    if (!s || !t) throw new ImageFormatError("unsupported");
    s.putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
    t.drawImage(source, 0, 0, target.width, target.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      target.toBlob(
        (b) =>
          b ? resolve(b) : reject(new ImageFormatError("conversion_failed")),
        "image/png",
      ),
    );
    signal.throwIfAborted();
    return blob;
  } finally {
    source.width = source.height = target.width = target.height = 1;
  }
}
