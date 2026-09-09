import { DataUriError } from "@workspace/tools/encoding/data-uri";
import { serviceWorkerUrl } from "./worker-url";

let active = 0;
export function startDataUriWorker(signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (typeof Worker !== "function" || active >= 2)
    throw new DataUriError("unsupported");
  const worker = new Worker(
    serviceWorkerUrl("data-uri-worker", import.meta.url),
    {
      type: "module",
    },
  );
  active++;
  let closed = false,
    pending: ((reason: unknown) => void) | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    worker.terminate();
    signal?.removeEventListener("abort", abort);
    active--;
  };
  const abort = () => {
    pending?.(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    close();
  };
  const timer = setTimeout(() => {
    pending?.(new DataUriError("unsupported"));
    close();
  }, 120000);
  signal?.addEventListener("abort", abort, { once: true });
  return {
    close,
    request<T>(job: { input: string } | { pull: true }): Promise<T> {
      signal?.throwIfAborted();
      if (closed) throw new DataUriError("unsupported");
      return new Promise((resolve, reject) => {
        pending = reject;
        worker.onmessage = (event) => {
          pending = undefined;
          if (event.data.error) reject(new DataUriError(event.data.error));
          else resolve(event.data as T);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          pending = undefined;
          reject(new DataUriError("unsupported"));
          close();
        };
        try {
          worker.postMessage(job);
        } catch (e) {
          reject(e);
          close();
        }
      });
    },
  };
}
