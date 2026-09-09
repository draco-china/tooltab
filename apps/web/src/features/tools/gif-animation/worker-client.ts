import type {
  AnimationJob,
  AnimationResult,
} from "@workspace/tools/image/gif-contract";
import { AnimationError } from "@workspace/tools/image/gif-contract";
import { workerResult } from "@/lib/worker-task";

function parseAnimationResult(value: unknown): AnimationResult {
  if (!value || typeof value !== "object")
    throw new AnimationError("conversion_failed");
  const result = value as Record<string, unknown>;
  if (
    !(result.bytes instanceof Uint8Array) ||
    ![
      "width",
      "height",
      "originalWidth",
      "originalHeight",
      "frames",
      "durationMs",
      "plays",
      "originalBytes",
      "outputBytes",
    ].every(
      (key) => typeof result[key] === "number" && Number.isFinite(result[key]),
    )
  )
    throw new AnimationError("conversion_failed");
  return result as AnimationResult;
}

export function runAnimationWorker(
  job: AnimationJob,
  signal?: AbortSignal,
  timeoutMs = 600000,
): Promise<AnimationResult> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new AnimationError("unsupported"));
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      w.onmessage = w.onerror = w.onmessageerror = null;
      w.terminate();
    };
    const abort = () => {
      close();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      close();
      reject(new AnimationError("timeout"));
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    w.onerror = (e) => {
      if (closed) return;
      e.preventDefault();
      close();
      reject(new AnimationError("conversion_failed"));
    };
    w.onmessageerror = () => {
      if (closed) return;
      close();
      reject(new AnimationError("conversion_failed"));
    };
    w.onmessage = (e) => {
      if (closed) return;
      close();
      try {
        const result = workerResult<AnimationResult>(
          e.data,
          (code) =>
            new AnimationError(
              (code ?? "conversion_failed") as AnimationError["code"],
            ),
        );
        resolve(parseAnimationResult(result));
      } catch (error) {
        reject(error);
      }
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      w.postMessage(job);
    } catch {
      close();
      reject(new AnimationError("invalid_input"));
    }
  });
}
