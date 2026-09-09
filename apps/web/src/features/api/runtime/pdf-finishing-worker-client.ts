import { PdfEditingError } from "@workspace/tools/pdf/core";
import type {
  FinishingJob,
  FinishingResult,
} from "@workspace/tools/pdf/finishing";
import { serviceWorkerUrl } from "./worker-url";
export function runServiceFinishingWorker(
  job: FinishingJob,
  signal?: AbortSignal,
  timeoutMs = 60000,
  onProgress?: (done: number, total: number) => void,
): Promise<FinishingResult> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new PdfEditingError("unsupported"));
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        serviceWorkerUrl("pdf-finishing-worker", import.meta.url),
        {
          type: "module",
        },
      );
    } catch {
      reject(new PdfEditingError("unsupported"));
      return;
    }
    const close = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
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
      event.preventDefault();
      close();
      reject(new PdfEditingError("unsupported"));
    };
    worker.onmessage = (event) => {
      if (event.data.progress) {
        onProgress?.(event.data.progress.done, event.data.progress.total);
        return;
      }
      close();
      if (event.data.error) reject(new PdfEditingError(event.data.error));
      else resolve(event.data.result);
    };
    try {
      worker.postMessage(job);
    } catch {
      close();
      reject(new PdfEditingError("invalid_pdf"));
    }
  });
}
