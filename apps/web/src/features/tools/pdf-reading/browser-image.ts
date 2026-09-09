import type { PDFDocumentLoadingTask, PDFWorker, RenderTask } from "pdfjs-dist";
// Vite supplies the default export for this static asset/Worker query.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PdfEditingError } from "@workspace/tools/pdf/core";
import type { ReadingJob, ReadingResult } from "./types";
import { checkSource } from "@workspace/tools/pdf/reading";
import { imageDimensions, imageOptions } from "@workspace/tools/pdf/rendering";
import { runReading } from "./runtime";
import { packImages } from "./zip-client";
export function runBrowserImage(
  job: Extract<ReadingJob, { kind: "image" }>,
  signal?: AbortSignal,
  timeoutMs = 60000,
  progress?: (done: number, total: number) => void,
): Promise<ReadingResult> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new PdfEditingError("unsupported"));
  checkSource(job.source);
  imageOptions(job);
  return new Promise((resolve, reject) => {
    const zipAbort = new AbortController();
    let disposed = false,
      loading: PDFDocumentLoadingTask | undefined,
      parserWorker: PDFWorker | undefined,
      render: RenderTask | undefined,
      canvas: HTMLCanvasElement | undefined;
    const release = () => {
      clearTimeout(timer);
      zipAbort.abort();
      signal?.removeEventListener("abort", abort);
      render?.cancel();
      void loading?.destroy().catch(() => {});
      parserWorker?.destroy();
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
        canvas.remove();
      }
    };
    const fail = (error: unknown) => {
      if (disposed) return;
      disposed = true;
      release();
      reject(error);
    };
    const abort = () =>
      fail(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(
      () => fail(new PdfEditingError("timeout")),
      timeoutMs,
    );
    signal?.addEventListener("abort", abort, { once: true });
    const current = () => {
      if (disposed) throw new DOMException("Aborted", "AbortError");
    };
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        current();
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        parserWorker = new pdfjs.PDFWorker();
        await parserWorker.promise;
        current();
        if (!(parserWorker.port instanceof Worker))
          throw new PdfEditingError("unsupported");
        const result = await runReading(
          {
            ...job,
            source: { ...job.source, bytes: new Uint8Array(job.source.bytes) },
          },
          {
            imageOps: new Set(),
            pack: (files) => packImages(files, zipAbort.signal, timeoutMs),
            load: (bytes) => {
              current();
              loading = pdfjs.getDocument({
                data: bytes,
                worker: parserWorker,
                verbosity: pdfjs.VerbosityLevel.ERRORS,
                enableXfa: false,
                stopAtErrors: true,
                cMapUrl: "/pdfjs-6.3.289/cmaps/",
                cMapPacked: true,
                standardFontDataUrl: "/pdfjs-6.3.289/standard_fonts/",
                wasmUrl: "/pdfjs-6.3.289/wasm/",
                iccUrl: "/pdfjs-6.3.289/iccs/",
                useWorkerFetch: true,
              });
              return loading;
            },
            render: async (page, options) => {
              current();
              const viewport = page.getViewport({ scale: options.dpi / 72 }),
                dimensions = imageDimensions(viewport.width, viewport.height);
              canvas = document.createElement("canvas");
              canvas.width = dimensions.width;
              canvas.height = dimensions.height;
              const target = canvas;
              try {
                const context = target.getContext("2d", { alpha: false });
                if (!context) throw new PdfEditingError("unsupported");
                render = page.render({
                  canvas: target,
                  canvasContext: context,
                  viewport,
                  background: "rgb(255,255,255)",
                });
                render.onContinue = (next: () => void) => {
                  setTimeout(() => {
                    if (!disposed) next();
                  }, 0);
                };
                await render.promise;
                current();
                const mime = `image/${options.format}`,
                  blob = await new Promise<Blob>((done, failed) =>
                    target.toBlob(
                      (value) =>
                        value && value.type === mime
                          ? done(value)
                          : failed(new PdfEditingError("unsupported")),
                      mime,
                      options.quality,
                    ),
                  );
                current();
                return {
                  ...dimensions,
                  bytes: new Uint8Array(await blob.arrayBuffer()),
                };
              } finally {
                target.width = 1;
                target.height = 1;
                target.remove();
                canvas = undefined;
                render = undefined;
              }
            },
          },
          (done, total) => {
            current();
            progress?.(done, total);
          },
        );
        current();
        disposed = true;
        release();
        resolve(result);
      } catch (error) {
        fail(
          error instanceof PdfEditingError || error instanceof DOMException
            ? error
            : new PdfEditingError("invalid_pdf"),
        );
      }
    })();
  });
}
