import type {
  CodeScreenshotOptions,
  CodeScreenshotRender,
} from "@workspace/tools/image/code-screenshot";
import { workerResult } from "@/lib/worker-task";

let nextId = 0;

function isRender(value: unknown): value is CodeScreenshotRender {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<CodeScreenshotRender>;
  return (
    typeof result.svg === "string" &&
    typeof result.html === "string" &&
    [result.width, result.height, result.lines].every(
      (value) =>
        typeof value === "number" && Number.isSafeInteger(value) && value > 0,
    )
  );
}

export function renderInWorker(
  options: CodeScreenshotOptions,
  signal?: AbortSignal,
) {
  return new Promise<CodeScreenshotRender>((resolve, reject) => {
    signal?.throwIfAborted();
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    const id = ++nextId;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      signal?.removeEventListener("abort", abort);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
    };
    const abort = () => {
      close();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      close();
      reject(new Error("render_failed"));
    };
    worker.onmessageerror = () => {
      close();
      reject(new Error("render_failed"));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (closed) return;
      const data = event.data;
      if (!data || typeof data !== "object" || !("id" in data)) {
        close();
        reject(new Error("render_failed"));
        return;
      }
      if (data.id !== id) return;
      try {
        const result = workerResult<unknown>(
          data,
          (code) => new Error(code ?? "render_failed"),
        );
        if (!isRender(result)) throw new Error("render_failed");
        close();
        resolve(result);
      } catch (error) {
        close();
        reject(error);
      }
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage({ id, options });
    } catch (error) {
      close();
      reject(error);
    }
  });
}
