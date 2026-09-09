import type {
  AnimationJob,
  AnimationResult,
} from "@workspace/tools/image/gif-contract";
import { AnimationError } from "@workspace/tools/image/gif-contract";
import { serviceWorkerUrl } from "./worker-url";
export function runAnimationServiceWorker(
  job: AnimationJob,
  signal?: AbortSignal,
  timeoutMs = 600000,
): Promise<AnimationResult> {
  signal?.throwIfAborted();
  if (!process.versions.bun)
    return Promise.reject(new AnimationError("unsupported"));
  return new Promise((resolve, reject) => {
    const w = new Worker(
      serviceWorkerUrl("gif-animation-worker", import.meta.url).href,
    );
    const close = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
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
      e.preventDefault();
      close();
      reject(new AnimationError("conversion_failed"));
    };
    w.onmessage = (e) => {
      close();
      if (e.data.error) reject(new AnimationError(e.data.error));
      else resolve(e.data.result);
    };
    try {
      w.postMessage(job);
    } catch {
      close();
      reject(new AnimationError("invalid_input"));
    }
  });
}
