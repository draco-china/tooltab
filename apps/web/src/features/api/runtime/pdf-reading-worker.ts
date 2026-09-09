import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PdfEditingError } from "@workspace/tools/pdf/core";
import type { ReadingJob } from "@/features/tools/pdf-reading/types";
import { imageDimensions } from "@workspace/tools/pdf/rendering";
import { runReading } from "@/features/tools/pdf-reading/runtime";

const require = createRequire(import.meta.url);
const assets = dirname(require.resolve("pdfjs-dist/package.json"));
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ReadingJob>) => void) | null;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    const result = await runReading(
      data,
      {
        imageOps: new Set([
          pdfjs.OPS.paintImageXObject,
          pdfjs.OPS.paintInlineImageXObject,
          pdfjs.OPS.paintImageMaskXObject,
          pdfjs.OPS.paintImageXObjectRepeat,
        ]),
        load: (bytes) =>
          pdfjs.getDocument({
            verbosity: pdfjs.VerbosityLevel.ERRORS,
            data: bytes,
            enableXfa: false,
            stopAtErrors: true,
            cMapUrl: `${join(assets, "cmaps")}/`,
            cMapPacked: true,
            standardFontDataUrl: `${join(assets, "standard_fonts")}/`,
            wasmUrl: `${join(assets, "wasm")}/`,
            iccUrl: `${join(assets, "iccs")}/`,
            useSystemFonts: false,
          }),
        render: async (page, job) => {
          const viewport = page.getViewport({ scale: job.dpi / 72 }),
            dimensions = imageDimensions(viewport.width, viewport.height),
            canvas = createCanvas(dimensions.width, dimensions.height);
          try {
            await page.render({
              canvas: canvas as unknown as HTMLCanvasElement,
              viewport,
              background: "rgb(255,255,255)",
            }).promise;
            const buffer =
              job.format === "png"
                ? canvas.toBuffer("image/png")
                : canvas.toBuffer(
                    job.format === "jpeg" ? "image/jpeg" : "image/webp",
                    job.quality * 100,
                  );
            return { ...dimensions, bytes: new Uint8Array(buffer) };
          } finally {
            canvas.width = 1;
            canvas.height = 1;
          }
        },
      },
      (done, total) => scope.postMessage({ progress: { done, total } }),
    );
    scope.postMessage(
      { result },
      result.kind === "image"
        ? [
            ...result.files.map((file) => file.bytes.buffer as ArrayBuffer),
            ...(result.archive ? [result.archive.buffer as ArrayBuffer] : []),
          ]
        : [],
    );
  } catch (error) {
    scope.postMessage({
      error: error instanceof PdfEditingError ? error.code : "invalid_pdf",
    });
  }
};
