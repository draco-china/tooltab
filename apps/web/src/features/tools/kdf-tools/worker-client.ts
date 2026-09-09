import { runWorkerTask, workerResult } from "@/lib/worker-task";
import {
  KdfError,
  type KdfErrorCode,
  type KdfJob,
  type KdfResult,
  validateJob,
} from "@workspace/tools/crypto/kdf";
export function runKdf(
  job: KdfJob,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
): Promise<KdfResult> {
  signal.throwIfAborted();
  validateJob(job);
  if (typeof Worker !== "function") throw new KdfError("worker_failed");
  return runWorkerTask(job, {
    create: createWorker,
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) => new KdfError((code ?? "worker_failed") as KdfErrorCode),
      );
      if (
        !result ||
        typeof result !== "object" ||
        !("hex" in result) ||
        typeof result.hex !== "string" ||
        !("base64" in result) ||
        typeof result.base64 !== "string" ||
        !("saltBytes" in result) ||
        typeof result.saltBytes !== "number" ||
        !Number.isSafeInteger(result.saltBytes) ||
        result.saltBytes < 0 ||
        !("lengthBytes" in result) ||
        typeof result.lengthBytes !== "number" ||
        !Number.isSafeInteger(result.lengthBytes) ||
        result.lengthBytes <= 0 ||
        !("memoryBytes" in result) ||
        (result.memoryBytes !== null &&
          (typeof result.memoryBytes !== "number" ||
            !Number.isSafeInteger(result.memoryBytes) ||
            result.memoryBytes < 0))
      )
        throw new KdfError("worker_failed");
      return result as KdfResult;
    },
    error: (failure) =>
      new KdfError(failure === "timeout" ? "timeout" : "worker_failed"),
    timeoutMs: 120000,
    signal,
  });
}
