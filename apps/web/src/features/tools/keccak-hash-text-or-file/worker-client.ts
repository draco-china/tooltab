import {
  type KeccakErrorCode,
  type KeccakJob,
  KeccakPageError,
} from "@workspace/tools/hash/keccak-browser";
import { runWorkerTask, workerResult } from "@/lib/worker-task";

export function runKeccakWorker(job: KeccakJob, signal: AbortSignal) {
  signal.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new KeccakPageError("unsupported"));
  return runWorkerTask<KeccakJob, Uint8Array<ArrayBuffer>>(
    job,
    {
      create: () =>
        new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
      parse: (data) => {
        const result = workerResult<unknown>(
          data,
          (code) =>
            new KeccakPageError((code ?? "digest-failed") as KeccakErrorCode),
        );
        if (!(result instanceof ArrayBuffer))
          throw new KeccakPageError("digest-failed");
        return new Uint8Array(result);
      },
      error: (failure) =>
        new KeccakPageError(
          failure === "create" || failure === "send"
            ? "unsupported"
            : failure === "timeout"
              ? "timeout"
              : "digest-failed",
        ),
      timeoutMs: 30_000,
      signal,
    },
    job.source === "text" ? [job.bytes.buffer] : undefined,
  );
}
