import { runWorkerTask, workerResult } from "@/lib/worker-task";
import {
  BcryptError,
  type BcryptErrorCode,
  type BcryptJob,
  type BcryptResult,
  validateBcryptJob,
} from "@workspace/tools/crypto/bcrypt";

function isBcryptResult(value: unknown): value is BcryptResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.hash === "string" &&
    typeof result.version === "string" &&
    typeof result.cost === "number" &&
    Number.isSafeInteger(result.cost) &&
    result.cost > 0 &&
    typeof result.salt === "string" &&
    typeof result.checksum === "string" &&
    typeof result.passwordBytes === "number" &&
    Number.isSafeInteger(result.passwordBytes) &&
    result.passwordBytes >= 0 &&
    typeof result.truncated === "boolean" &&
    (typeof result.matches === "boolean" || result.matches === null)
  );
}

export function runBcrypt(
  job: BcryptJob,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
): Promise<BcryptResult> {
  signal.throwIfAborted();
  validateBcryptJob(job);
  if (typeof Worker !== "function") throw new BcryptError("worker_failed");
  return runWorkerTask(job, {
    create: createWorker,
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) => new BcryptError((code ?? "worker_failed") as BcryptErrorCode),
      );
      if (!isBcryptResult(result)) throw new BcryptError("worker_failed");
      return result;
    },
    error: (failure) =>
      new BcryptError(failure === "timeout" ? "timeout" : "worker_failed"),
    timeoutMs: 120000,
    signal,
  });
}
