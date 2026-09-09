import { createRequire } from "node:module";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { gc } from "bun";
import sharp from "sharp";
import { PdfEditingError } from "@workspace/tools/pdf/core";
import {
  checkImageSize,
  checkImageSource,
  type FinishingJob,
  imagesToPdf,
  MAX_IMAGE_PIXELS,
  qpdfRuntime,
  removeOwnerProtection,
} from "@workspace/tools/pdf/finishing";

const require = createRequire(import.meta.url);
const scope = globalThis as unknown as {
  onmessage: ((e: MessageEvent<FinishingJob>) => void) | null;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    if (data.kind === "unlock") {
      console.log = () => {};
      console.warn = () => {};
      console.error = () => {};
    }
    const result =
      data.kind === "unlock"
        ? await removeOwnerProtection(data.bytes, async () => {
            const { default: createQpdf } = await import(
              "@neslinesli93/qpdf-wasm"
            );
            const wasmPath = require.resolve(
              "@neslinesli93/qpdf-wasm/dist/qpdf.wasm",
            );
            const options = {
              locateFile: () => wasmPath,
              noInitialRun: true,
              print: () => {},
              printErr: () => {},
            };
            return qpdfRuntime(await createQpdf(options));
          })
        : await imagesToPdf(
            data,
            async (source, quality) => {
              const kind = checkImageSource(source);
              let bytes = source.bytes;
              if (kind === "bmp") {
                if (bytes.length < 26) throw new PdfEditingError("read_failed");
                const view = new DataView(
                    bytes.buffer,
                    bytes.byteOffset,
                    bytes.byteLength,
                  ),
                  old = view.getUint32(14, true) === 12,
                  width = old
                    ? view.getUint16(18, true)
                    : view.getInt32(18, true),
                  height = old
                    ? view.getUint16(20, true)
                    : Math.abs(view.getInt32(22, true));
                checkImageSize(width, height);
                const image = await loadImage(Buffer.from(bytes));
                try {
                  checkImageSize(image.width, image.height);
                  const canvas = createCanvas(image.width, image.height);
                  try {
                    canvas.getContext("2d").drawImage(image, 0, 0);
                    bytes = new Uint8Array(canvas.toBuffer("image/png"));
                  } finally {
                    canvas.width = 1;
                    canvas.height = 1;
                  }
                } finally {
                  image.onload = undefined;
                  image.onerror = undefined;
                  image.src = "";
                }
              }
              const image = sharp(bytes, {
                animated: false,
                limitInputPixels: MAX_IMAGE_PIXELS,
                failOn: "error",
              });
              try {
                const metadata = await image.metadata();
                checkImageSize(metadata.width ?? 0, metadata.height ?? 0);
                const result = await image
                  .autoOrient()
                  .rotate(source.rotation)
                  .flatten({ background: "#ffffff" })
                  .jpeg({ quality: Math.round(quality * 100) })
                  .toBuffer({ resolveWithObject: true });
                return {
                  bytes: new Uint8Array(result.data),
                  width: result.info.width,
                  height: result.info.height,
                };
              } finally {
                image.destroy();
              }
            },
            (done, total) => scope.postMessage({ progress: { done, total } }),
          );
    gc(true);
    scope.postMessage({ result }, [result.bytes.buffer as ArrayBuffer]);
  } catch (error) {
    scope.postMessage({
      error: error instanceof PdfEditingError ? error.code : "invalid_pdf",
    });
  }
};
