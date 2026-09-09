import { PdfEditingError } from "@workspace/tools/pdf/core";
import type { PdfInfo, PdfJob, PdfOutput } from "@workspace/tools/pdf/editing";
export function runPdfWorker(
  job: PdfJob,
  signal?: AbortSignal,
  timeoutMs = 60000,
  onProgress?: (done: number, total: number) => void,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<PdfOutput | PdfInfo> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new PdfEditingError("unsupported"));
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = createWorker();
    } catch {
      reject(new PdfEditingError("unsupported"));
      return;
    }
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
    };
    const abort = () => {
      close();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      close();
      reject(new PdfEditingError("timeout"));
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      if (closed) return;
      event.preventDefault();
      close();
      reject(new PdfEditingError("unsupported"));
    };
    worker.onmessageerror = () => {
      if (closed) return;
      close();
      reject(new PdfEditingError("invalid_pdf"));
    };
    worker.onmessage = (event) => {
      if (closed) return;
      const data = event.data;
      if (!data || typeof data !== "object") {
        close();
        reject(new PdfEditingError("invalid_pdf"));
        return;
      }
      if (data.progress) {
        try {
          const { done, total } = data.progress;
          if (
            !Number.isSafeInteger(done) ||
            !Number.isSafeInteger(total) ||
            done < 0 ||
            total < 0 ||
            done > total
          )
            throw new PdfEditingError("invalid_pdf");
          onProgress?.(done, total);
        } catch (cause) {
          close();
          reject(cause);
        }
        return;
      }
      close();
      if (typeof data.error === "string")
        reject(new PdfEditingError(data.error));
      else if (
        data.result &&
        (data.result.kind === "info" || data.result.kind === "output")
      )
        resolve(data.result);
      else reject(new PdfEditingError("invalid_pdf"));
    };
    // Construction can synchronously abort before the listener is installed.
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage(job);
    } catch {
      close();
      reject(new PdfEditingError("invalid_pdf"));
    }
  });
}
