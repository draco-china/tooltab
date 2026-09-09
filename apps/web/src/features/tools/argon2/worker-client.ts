import { runWorkerTask, workerResult } from "@/lib/worker-task";
import {
  ArgonError,
  type ArgonErrorCode,
  type ArgonJob,
  type ArgonResult,
  validateJob,
} from "@workspace/tools/crypto/argon2";

function isArgonResult(value: unknown): value is ArgonResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.hash === "string" &&
    ["argon2id", "argon2i", "argon2d"].includes(result.algorithm as string) &&
    [
      "version",
      "iterations",
      "memorySize",
      "parallelism",
      "saltLength",
      "hashLength",
    ].every(
      (key) =>
        typeof result[key] === "number" &&
        Number.isSafeInteger(result[key]) &&
        result[key] > 0,
    ) &&
    (typeof result.matches === "boolean" || result.matches === null)
  );
}

export function runArgon(
  job: ArgonJob,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
): Promise<ArgonResult> {
  signal.throwIfAborted();
  validateJob(job);
  if (typeof Worker !== "function") throw new ArgonError("worker_failed");
  return runWorkerTask(job, {
    create: createWorker,
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) => new ArgonError((code ?? "worker_failed") as ArgonErrorCode),
      );
      if (!isArgonResult(result)) throw new ArgonError("worker_failed");
      return result;
    },
    error: (failure) =>
      new ArgonError(failure === "timeout" ? "timeout" : "worker_failed"),
    timeoutMs: 120000,
    signal,
  });
}
