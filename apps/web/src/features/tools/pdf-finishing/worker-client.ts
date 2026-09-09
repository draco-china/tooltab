import { workerResult } from "@/lib/worker-task";
import { PdfEditingError } from "@workspace/tools/pdf/core";
import type {
  FinishingJob,
  FinishingResult,
} from "@workspace/tools/pdf/finishing";

function parseFinishingResult(value: unknown): FinishingResult {
  if (!value || typeof value !== "object")
    throw new PdfEditingError("invalid_pdf");
  const result = value as Record<string, unknown>;
  if (
    !(result.bytes instanceof Uint8Array) ||
    typeof result.pages !== "number" ||
    !Number.isFinite(result.pages) ||
    !Array.isArray(result.warnings) ||
    !result.warnings.every((warning) => typeof warning === "string") ||
    (result.wasEncrypted !== undefined &&
      typeof result.wasEncrypted !== "boolean")
  )
    throw new PdfEditingError("invalid_pdf");
  return result as FinishingResult;
}

export function runFinishingWorker(
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
      worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
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
      event.preventDefault();
      close();
      reject(new PdfEditingError("unsupported"));
    };
    worker.onmessageerror = () => {
      close();
      reject(new PdfEditingError("unsupported"));
    };
    worker.onmessage = (event) => {
      if (closed) return;
      if (!event.data || typeof event.data !== "object") {
        close();
        reject(new PdfEditingError("invalid_pdf"));
        return;
      }
      if (event.data.progress) {
        try {
          const { done, total } = event.data.progress;
          if (
            !Number.isSafeInteger(done) ||
            !Number.isSafeInteger(total) ||
            done < 0 ||
            total < 0 ||
            done > total
          )
            throw new PdfEditingError("invalid_pdf");
          onProgress?.(done, total);
        } catch (error) {
          close();
          reject(error);
        }
        return;
      }
      close();
      try {
        const result = workerResult<FinishingResult>(
          event.data,
          (code) =>
            new PdfEditingError(
              (code ?? "invalid_pdf") as PdfEditingError["code"],
            ),
        );
        resolve(parseFinishingResult(result));
      } catch (error) {
        reject(error);
      }
    };
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
