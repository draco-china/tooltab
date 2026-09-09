import { runWorkerTask, workerResult } from "@/lib/worker-task";
import { TextUtilityError, type UtilityJob, type UtilityResult } from "./logic";

function isUtilityResult(value: unknown): value is UtilityResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    (value.kind === "invisible" ||
      value.kind === "morse" ||
      value.kind === "audio" ||
      value.kind === "lorem")
  );
}

export function runUtilityWorker(
  job: UtilityJob,
  signal?: AbortSignal,
  timeoutMs = 30000,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<UtilityResult> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new TextUtilityError("unsupported"));
  return runWorkerTask(job, {
    create: createWorker,
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) =>
          new TextUtilityError(
            (code ?? "invalid_input") as TextUtilityError["code"],
          ),
      );
      if (!isUtilityResult(result)) throw new TextUtilityError("invalid_input");
      return result;
    },
    error: (failure) =>
      new TextUtilityError(
        failure === "create" ||
          failure === "error" ||
          failure === "messageerror"
          ? "unsupported"
          : failure === "timeout"
            ? "timeout"
            : "invalid_input",
      ),
    timeoutMs,
    signal,
  });
}
