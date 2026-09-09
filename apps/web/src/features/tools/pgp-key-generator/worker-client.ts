import { runWorkerTask } from "@/lib/worker-task";
import {
  type PgpOptions,
  type PgpResult,
  PgpToolError,
} from "@workspace/tools/crypto/pgp-contract";

export function runPgp(
  job: PgpOptions,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<PgpResult> {
  signal.throwIfAborted();
  return runWorkerTask(job, {
    create: createWorker,
    parse: (data: unknown): PgpResult => {
      if (!data || typeof data !== "object")
        throw new PgpToolError("worker_failed");
      if ("error" in data && data.error)
        throw new PgpToolError(
          typeof data.error === "string" ? data.error : "worker_failed",
        );
      if (
        !("result" in data) ||
        !data.result ||
        typeof data.result !== "object"
      )
        throw new PgpToolError("worker_failed");
      return data.result as PgpResult;
    },
    error: (failure) =>
      new PgpToolError(failure === "timeout" ? "timeout" : "worker_failed"),
    timeoutMs: 120_000,
    signal,
  }).catch((error: unknown) => {
    if (signal.aborted && error === signal.reason && !(error instanceof Error))
      throw new DOMException("The operation was aborted", "AbortError");
    throw error;
  });
}
