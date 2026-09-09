import type {
  OptimizerJob,
  OptimizerResult,
} from "@workspace/tools/image/optimizer";
import { OptimizerError } from "@workspace/tools/image/optimizer";
import { runWorkerTask, workerResult } from "@/lib/worker-task";

export type OptimizerPreviewResult = OptimizerResult & { highlighted?: string };

export function parseOptimizerResult(value: unknown): OptimizerPreviewResult {
  if (!value || typeof value !== "object")
    throw new OptimizerError("optimize_failed");
  const result = value as Record<string, unknown>;
  const numeric = [
    "originalBytes",
    "optimizedBytes",
    "savedBytes",
    "savedPercent",
  ];
  if (
    !(result.bytes instanceof Uint8Array) ||
    !numeric.every(
      (key) => typeof result[key] === "number" && Number.isFinite(result[key]),
    )
  )
    throw new OptimizerError("optimize_failed");
  for (const key of ["width", "height", "bitDepth"]) {
    if (
      result[key] !== undefined &&
      (typeof result[key] !== "number" || !Number.isFinite(result[key]))
    )
      throw new OptimizerError("optimize_failed");
  }
  for (const key of ["animated", "interlaced"]) {
    if (result[key] !== undefined && typeof result[key] !== "boolean")
      throw new OptimizerError("optimize_failed");
  }
  for (const key of ["chunksRemoved", "chunksChanged"]) {
    if (
      result[key] !== undefined &&
      (!Array.isArray(result[key]) ||
        !result[key].every((item) => typeof item === "string"))
    )
      throw new OptimizerError("optimize_failed");
  }
  if (
    result.highlighted !== undefined &&
    typeof result.highlighted !== "string"
  )
    throw new OptimizerError("optimize_failed");
  return result as OptimizerPreviewResult;
}

export function runOptimizerWorker(
  job: OptimizerJob,
  signal?: AbortSignal,
  timeoutMs = 120000,
): Promise<OptimizerPreviewResult> {
  signal?.throwIfAborted();
  return runWorkerTask(job, {
    create: () => {
      if (typeof Worker !== "function") throw new OptimizerError("unsupported");
      return new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
    },
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) =>
          new OptimizerError(
            (code ?? "optimize_failed") as OptimizerError["code"],
          ),
      );
      return parseOptimizerResult(result);
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
