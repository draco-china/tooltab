import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
// Vite supplies the default export for this static asset/Worker query.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { pageRanges } from "@workspace/tools/pdf/core";
import { numberPlacement } from "@workspace/tools/pdf/numbering";
import type { NumberOptions } from "@workspace/tools/pdf/numbering";

let previewQueue: Promise<void> = Promise.resolve();
const PreviewContext = createContext<{
  document: PDFDocumentProxy | null;
  failed: boolean;
}>({ document: null, failed: false });
export function PdfPreviewDocument({
  bytes,
  children,
}: {
  bytes: Uint8Array;
  children: ReactNode;
}) {
  const [state, setState] = useState<{
    document: PDFDocumentProxy | null;
    failed: boolean;
  }>({ document: null, failed: false });
  useEffect(() => {
    let disposed = false,
      loading: PDFDocumentLoadingTask | undefined;
    setState({ document: null, failed: false });
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        loading = pdfjs.getDocument({
          data: new Uint8Array(bytes),
          enableXfa: false,
          stopAtErrors: true,
          maxImageSize: 32000000,
          canvasMaxAreaInBytes: 16000000,
          cMapUrl: "/pdfjs-6.3.289/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs-6.3.289/standard_fonts/",
          wasmUrl: "/pdfjs-6.3.289/wasm/",
          iccUrl: "/pdfjs-6.3.289/iccs/",
          useWorkerFetch: true,
        });
        const document = await loading.promise;
        if (!disposed) setState({ document, failed: false });
        else await loading.destroy();
      } catch {
        if (!disposed) setState({ document: null, failed: true });
      }
    })();
    return () => {
      disposed = true;
      void loading?.destroy();
    };
  }, [bytes]);
  return (
    <PreviewContext.Provider value={state}>{children}</PreviewContext.Provider>
  );
}
export function PdfPreview({
  page = 1,
  rotation,
  options,
  label,
  unavailable,
}: {
  page?: number;
  rotation?: number;
  options?: NumberOptions;
  label: string;
  unavailable: string;
}) {
  const { document, failed: documentFailed } = useContext(PreviewContext);
  const canvas = useRef<HTMLCanvasElement | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!document) return;
    let disposed = false,
      render: RenderTask | undefined;
    setFailed(false);
    previewQueue = previewQueue
      .catch(() => {})
      .then(async () => {
        if (disposed) return;
        try {
          const pdfjs = await import("pdfjs-dist");
          const p = await document.getPage(page),
            base = p.getViewport({ scale: 1, rotation }),
            scale = Math.min(1, 420 / base.width, 560 / base.height),
            viewport = p.getViewport({ scale, rotation });
          if (disposed || !canvas.current) return;
          const c = canvas.current,
            context = c.getContext("2d");
          if (!context) throw new Error("Canvas unavailable");
          c.width = Math.ceil(viewport.width);
          c.height = Math.ceil(viewport.height);
          render = p.render({
            canvas: c,
            canvasContext: context,
            viewport,
            annotationMode: pdfjs.AnnotationMode.ENABLE,
          });
          await render.promise;
          if (disposed) return;
          if (options) {
            const selection = pageRanges(
                options.pages,
                document.numPages,
                true,
              ).pages,
              index = selection.indexOf(page);
            if (index >= 0) {
              const text =
                options.format === "number"
                  ? String(options.startNumber + index)
                  : `${options.startNumber + index}/${document.numPages}`;
              context.font = `${options.fontSize * scale}px ${options.fontFamily === "serif" ? "Times New Roman" : "Arial"}`;
              context.fillStyle = "#000000";
              const pos = numberPlacement(
                base.width,
                base.height,
                (
                  await (
                    await PDFDocument.create()
                  ).embedFont(
                    options.fontFamily === "serif"
                      ? StandardFonts.TimesRoman
                      : StandardFonts.Helvetica,
                  )
                ).widthOfTextAtSize(text, options.fontSize),
                options,
              );
              if (disposed) return;
              context.fillText(
                text,
                pos.x * scale,
                (base.height - pos.y) * scale,
              );
            }
          }
        } catch {
          if (!disposed) setFailed(true);
        }
      });
    return () => {
      disposed = true;
      render?.cancel();
    };
  }, [document, page, rotation, options]);
  return failed || documentFailed ? (
    <p className="text-sm text-muted-foreground">{unavailable}</p>
  ) : (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      className="h-auto max-w-full rounded border"
    />
  );
}
