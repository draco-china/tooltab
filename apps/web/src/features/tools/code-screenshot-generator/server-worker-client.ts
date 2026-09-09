import { workerResult } from "@/lib/worker-task";
import { CodeScreenshotError } from "@workspace/tools/image/code-screenshot";
import type { ServerRenderJob } from "./server-worker";

let active = 0;
export type ServerRenderResult = {
  output: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  lines: number;
};
function isRenderResult(value: unknown): value is ServerRenderResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ServerRenderResult>;
  return (
    result.output instanceof Uint8Array &&
    result.output.byteLength > 0 &&
    [result.width, result.height, result.lines].every(
      (value) =>
        typeof value === "number" && Number.isSafeInteger(value) && value > 0,
    )
  );
}
export function renderCodeScreenshotServer(
  job: ServerRenderJob,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./server-worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<ServerRenderResult> {
  signal?.throwIfAborted();
  if (active >= 2) throw new CodeScreenshotError("busy");
  if (typeof Worker !== "function")
    throw new CodeScreenshotError("unsupported");
  return new Promise((resolve, reject) => {
    active++;
    let finished = false;
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (worker) {
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
        worker.terminate();
      }
      active--;
    };
    const abort = () => {
      finish();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      worker = createWorker();
    } catch (error) {
      finish();
      reject(error);
      return;
    }
    if (finished || signal?.aborted) {
      if (!finished) abort();
      else worker.terminate();
      return;
    }
    timer = setTimeout(() => {
      finish();
      reject(new CodeScreenshotError("timeout"));
    }, 30_000);
    worker.onerror = () => {
      finish();
      reject(new CodeScreenshotError("render_failed"));
    };
    worker.onmessageerror = () => {
      finish();
      reject(new CodeScreenshotError("render_failed"));
    };
    worker.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (finished) return;
      finish();
      try {
        const result = workerResult<unknown>(
          data,
          (code) =>
            new CodeScreenshotError(
              code === "too_large" ||
                code === "invalid_input" ||
                code === "invalid_options"
                ? code
                : "render_failed",
            ),
        );
        if (!isRenderResult(result))
          throw new CodeScreenshotError("render_failed");
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    try {
      worker.postMessage(job);
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
