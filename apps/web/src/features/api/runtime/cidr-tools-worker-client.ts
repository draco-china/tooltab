import { CidrError } from "@workspace/tools/network/cidr";
import { serviceWorkerUrl } from "./worker-url";

let active = 0;
export function startCidrWorker(signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (typeof Worker !== "function" || active >= 2)
    throw new CidrError("unsupported");
  const worker = new Worker(
    serviceWorkerUrl("cidr-tools-worker", import.meta.url),
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
    pending?.(new CidrError("unsupported"));
    close();
  }, 120000);
  signal?.addEventListener("abort", abort, { once: true });
  return {
    close,
    request<T>(
      job: { merge: string; exclude: string } | { pull: true },
    ): Promise<T> {
      signal?.throwIfAborted();
      if (closed) throw new CidrError("unsupported");
      return new Promise((resolve, reject) => {
        pending = reject;
        worker.onmessage = (event) => {
          pending = undefined;
          if (event.data.error)
            reject(new CidrError(event.data.error, event.data.issues));
          else resolve(event.data as T);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          pending = undefined;
          reject(new CidrError("unsupported"));
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
