import wasmUrl from "@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url";
import { PdfEditingError } from "@workspace/tools/pdf/core";
import {
  checkImageSize,
  checkImageSource,
  type FinishingJob,
  imagesToPdf,
  qpdfRuntime,
  removeOwnerProtection,
} from "@workspace/tools/pdf/finishing";

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
            const options = {
              locateFile: () => wasmUrl,
              noInitialRun: true,
              print: () => {},
              printErr: () => {},
            };
            const module = await createQpdf(options);
            return qpdfRuntime(module);
          })
        : await imagesToPdf(
            data,
            async (source, quality) => {
              if (
                typeof createImageBitmap !== "function" ||
                typeof OffscreenCanvas !== "function"
              )
                throw new PdfEditingError("unsupported");
              const kind = checkImageSource(source),
                bitmap = await createImageBitmap(
                  new Blob([new Uint8Array(source.bytes)], {
                    type: `image/${kind}`,
                  }),
                  { imageOrientation: "from-image" },
                );
              let canvas: OffscreenCanvas | undefined;
              try {
                checkImageSize(bitmap.width, bitmap.height);
                const turn = source.rotation % 180 !== 0,
                  width = turn ? bitmap.height : bitmap.width,
                  height = turn ? bitmap.width : bitmap.height;
                canvas = new OffscreenCanvas(width, height);
                const ctx = canvas.getContext("2d");
                if (!ctx) throw new PdfEditingError("unsupported");
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, width, height);
                ctx.translate(width / 2, height / 2);
                ctx.rotate((source.rotation * Math.PI) / 180);
                ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
                const blob = await canvas.convertToBlob({
                  type: "image/jpeg",
                  quality,
                });
                if (blob.type !== "image/jpeg")
                  throw new PdfEditingError("unsupported");
                return {
                  bytes: new Uint8Array(await blob.arrayBuffer()),
                  width,
                  height,
                };
              } finally {
                bitmap.close();
                if (canvas) {
                  canvas.width = 1;
                  canvas.height = 1;
                }
              }
            },
            (done, total) => scope.postMessage({ progress: { done, total } }),
          );
    scope.postMessage({ result }, [result.bytes.buffer as ArrayBuffer]);
  } catch (error) {
    scope.postMessage({
      error: error instanceof PdfEditingError ? error.code : "invalid_pdf",
    });
  }
};
