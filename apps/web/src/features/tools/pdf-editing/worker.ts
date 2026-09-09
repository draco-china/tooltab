import { PdfEditingError } from "@workspace/tools/pdf/core";
import { type PdfJob, runPdfJob } from "@workspace/tools/pdf/editing";

const scope = globalThis as unknown as {
  onmessage: ((e: MessageEvent<PdfJob>) => void) | null;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    const result = await runPdfJob(data, (done, total) =>
      scope.postMessage({ progress: { done, total } }),
    );
    scope.postMessage(
      { result },
      result.kind === "output"
        ? [
            ...result.files.map((f) => f.bytes.buffer as ArrayBuffer),
            ...(result.archive ? [result.archive.buffer as ArrayBuffer] : []),
          ]
        : [],
    );
  } catch (e) {
    scope.postMessage({
      error: e instanceof PdfEditingError ? e.code : "invalid_pdf",
    });
  }
};
