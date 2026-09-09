import { runWorkerTask } from "@/lib/worker-task";
import {
  type PasswordJob,
  type PasswordResult,
  PasswordToolError,
} from "./logic";
export function runPasswordWorker(
  job: PasswordJob,
  signal?: AbortSignal,
  timeoutMs = 15000,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<PasswordResult> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new PasswordToolError("unsupported"));
  return runWorkerTask(job, {
    create: createWorker,
    signal,
    timeoutMs,
    error: (failure) =>
      new PasswordToolError(
        failure === "timeout"
          ? "timeout"
          : failure === "create" || failure === "error"
            ? "unsupported"
            : "invalid_input",
      ),
    parse(data): PasswordResult {
      if (!data || typeof data !== "object")
        throw new PasswordToolError("invalid_input");
      if ("error" in data && typeof data.error === "string")
        throw new PasswordToolError(data.error as PasswordToolError["code"]);
      if (
        !("result" in data) ||
        !data.result ||
        typeof data.result !== "object" ||
        !("kind" in data.result) ||
        data.result.kind !==
          (job.kind === "generate" ? "generated" : "strength")
      )
        throw new PasswordToolError("invalid_input");
      return data.result as PasswordResult;
    },
  });
}
