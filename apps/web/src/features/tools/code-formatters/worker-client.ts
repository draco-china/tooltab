import {
  FORMATTER_INPUT_LIMIT,
  FormatterError,
} from "@workspace/tools/format/contract";
import type { FormatterJob, FormatterResult } from "./types";

let active = 0;
export function runFormatterWorker(
  job: FormatterJob,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
) {
  signal?.throwIfAborted();
  if (new TextEncoder().encode(job.input).length > FORMATTER_INPUT_LIMIT)
    throw new FormatterError("too_large");
  if (typeof Worker !== "function") throw new FormatterError("unsupported");
  if (active >= 1) throw new FormatterError("busy");
  const snapshot = structuredClone(job);
  return new Promise<FormatterResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = createWorker();
    } catch {
      reject(new FormatterError("unsupported"));
      return;
    }
    active++;
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      active--;
    };
    const abort = () => {
      close();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      close();
      reject(new FormatterError("timeout"));
    }, 30000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      event.preventDefault();
      close();
      reject(new FormatterError("invalid_input"));
    };
    worker.onmessageerror = () => {
      close();
      reject(new FormatterError("invalid_input"));
    };
    worker.onmessage = (
      event: MessageEvent<{
        result?: FormatterResult;
        error?: {
          code: FormatterError["code"];
          message?: string;
          line?: number;
          column?: number;
        };
      }>,
    ) => {
      if (done) return;
      close();
      if (!event.data || typeof event.data !== "object") {
        reject(new FormatterError("invalid_input"));
        return;
      }
      if (event.data.error) {
        const e = event.data.error;
        reject(new FormatterError(e.code, e.message, e.line, e.column));
      } else if (event.data.result) resolve(event.data.result);
      else reject(new FormatterError("invalid_input"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage(snapshot);
    } catch {
      close();
      reject(new FormatterError("invalid_input"));
    }
  });
}
