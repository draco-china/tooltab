import { type ListOptions, ListSlugError } from "@workspace/tools/text/lists";
import { serviceWorkerUrl } from "./worker-url";
export type ListSlugServiceJob =
  | { kind: "list"; left: string; right: string; options: ListOptions }
  | {
      kind: "slug";
      input: string;
      separator: "-" | "_" | ".";
      caseMode: "lower" | "preserve";
    };
export type WorkerReady = {
  inline?: Record<string, unknown>;
  summary?: unknown;
  files?: { filename: string; mimeType: string }[];
};
let active = 0;
export function startListSlugWorker(signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (typeof Worker !== "function" || active >= 2)
    throw new ListSlugError("unsupported");
  const worker = new Worker(
    serviceWorkerUrl("list-slug-worker", import.meta.url),
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
    pending?.(new ListSlugError("unsupported"));
    close();
  }, 120000);
  signal?.addEventListener("abort", abort, { once: true });
  return {
    close,
    request<T>(job: ListSlugServiceJob | { pull: number }): Promise<T> {
      signal?.throwIfAborted();
      if (closed) throw new ListSlugError("unsupported");
      return new Promise((resolve, reject) => {
        pending = reject;
        worker.onmessage = (event) => {
          pending = undefined;
          if (event.data.error) reject(new ListSlugError(event.data.error));
          else resolve(event.data as T);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          pending = undefined;
          reject(new ListSlugError("unsupported"));
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
