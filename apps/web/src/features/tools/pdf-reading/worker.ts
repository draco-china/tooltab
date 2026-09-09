import * as pdfjs from "pdfjs-dist";
// Vite supplies the default export for this static asset/Worker query.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PdfEditingError } from "@workspace/tools/pdf/core";
import type { ReadingJob } from "./types";
import { runReading } from "./runtime";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ReadingJob>) => void) | null;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
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
            cMapUrl: new URL("/pdfjs-6.3.289/cmaps/", location.origin).href,
            cMapPacked: true,
            standardFontDataUrl: new URL(
              "/pdfjs-6.3.289/standard_fonts/",
              location.origin,
            ).href,
            wasmUrl: new URL("/pdfjs-6.3.289/wasm/", location.origin).href,
            iccUrl: new URL("/pdfjs-6.3.289/iccs/", location.origin).href,
            useWorkerFetch: true,
          }),
        render: async () => {
          throw new PdfEditingError("unsupported");
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
