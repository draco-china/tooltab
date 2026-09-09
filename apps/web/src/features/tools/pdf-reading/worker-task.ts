import { PdfEditingError } from "@workspace/tools/pdf/core";
import type { ReadingJob, ReadingResult } from "./types";
export function runReadingTask(
  job: ReadingJob,
  create: () => Worker,
  signal?: AbortSignal,
  timeoutMs = 60000,
  onProgress?: (done: number, total: number) => void,
): Promise<ReadingResult> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new PdfEditingError("unsupported"));
  return new Promise((resolve, reject) => {
    let worker: Worker;
    let settled = false;
    try {
      worker = create();
    } catch {
      reject(new PdfEditingError("unsupported"));
      return;
    }
    const close = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const fail = (cause: unknown) => {
      if (settled) return;
      settled = true;
      close();
      reject(cause);
    };
    const abort = () =>
      fail(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(
      () => fail(new PdfEditingError("timeout")),
      timeoutMs,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      event.preventDefault();
      fail(new PdfEditingError("unsupported"));
    };
    worker.onmessageerror = () => fail(new PdfEditingError("invalid_pdf"));
    worker.onmessage = (event) => {
      if (settled) return;
      const message = event.data;
      if (!message || typeof message !== "object") {
        fail(new PdfEditingError("invalid_pdf"));
        return;
      }
      if (
        "progress" in message &&
        message.progress &&
        typeof message.progress === "object" &&
        "done" in message.progress &&
        "total" in message.progress &&
        typeof message.progress.done === "number" &&
        typeof message.progress.total === "number" &&
        Number.isFinite(message.progress.done) &&
        Number.isFinite(message.progress.total)
      ) {
        try {
          onProgress?.(message.progress.done, message.progress.total);
        } catch (cause) {
          fail(cause);
        }
        return;
      }
      settled = true;
      close();
      if ("error" in message && typeof message.error === "string") {
        reject(new PdfEditingError(message.error));
        return;
      }
      if (
        "result" in message &&
        message.result &&
        typeof message.result === "object" &&
        message.result.kind === job.kind
      ) {
        resolve(message.result as ReadingResult);
        return;
      }
      reject(new PdfEditingError("invalid_pdf"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage(job);
    } catch {
      fail(new PdfEditingError("invalid_pdf"));
    }
  });
}
