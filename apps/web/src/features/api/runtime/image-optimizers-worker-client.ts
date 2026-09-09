import type {
  OptimizerJob,
  OptimizerResult,
} from "@workspace/tools/image/optimizer";
import { OptimizerError } from "@workspace/tools/image/optimizer";
import { runWorkerTask, workerResult } from "@/lib/worker-task";
import { parseOptimizerResult } from "@/features/tools/image-optimizers/worker-client";
import { serviceWorkerUrl } from "./worker-url";

export function runOptimizerServiceWorker(
  job: OptimizerJob,
  signal?: AbortSignal,
  timeoutMs = 120000,
): Promise<OptimizerResult> {
  signal?.throwIfAborted();
  if (!process.versions.bun)
    return Promise.reject(new OptimizerError("unsupported"));
  return runWorkerTask(job, {
    create: () =>
      new Worker(
        serviceWorkerUrl("image-optimizers-worker", import.meta.url).href,
      ),
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) =>
          new OptimizerError(
            (code ?? "optimize_failed") as OptimizerError["code"],
          ),
      );
      return parseOptimizerResult(result) as OptimizerResult;
    },
    error: (failure) =>
      new OptimizerError(
        failure === "create"
          ? "unsupported"
          : failure === "timeout"
            ? "timeout"
            : failure === "send"
              ? "invalid_input"
              : "optimize_failed",
      ),
    timeoutMs,
    signal,
  });
}
