import { runWorkerTask } from "@/lib/worker-task";
import {
  type OpenapiJob,
  type OpenapiResult,
  ProjectConfigError,
} from "@workspace/tools/project/openapi-contract";

let active = 0;
export function runOpenapiWorker(
  job: OpenapiJob,
  signal?: AbortSignal,
): Promise<OpenapiResult> {
  signal?.throwIfAborted();
  if (active >= 1) throw new ProjectConfigError("busy");
  if (typeof Worker !== "function") throw new ProjectConfigError("unsupported");
  const snapshot = structuredClone(job);
  let constructionError: unknown;
  return runWorkerTask(snapshot, {
    create: () => {
      let worker: Worker;
      try {
        worker = new Worker(new URL("./worker.ts", import.meta.url), {
          type: "module",
        });
      } catch (cause) {
        constructionError = cause;
        throw cause;
      }
      const terminate = worker.terminate.bind(worker);
      active++;
      worker.terminate = () => {
        active--;
        terminate();
      };
      return worker;
    },
    parse: (data): OpenapiResult => {
      if (!data || typeof data !== "object")
        throw new ProjectConfigError("generation_failed");
      const response = data as {
        result?: OpenapiResult;
        error?: { code: ProjectConfigError["code"]; refs?: string[] };
      };
      if (response.error)
        throw new ProjectConfigError(
          response.error.code,
          response.error.refs ?? [],
        );
      if (!response.result) throw new ProjectConfigError("generation_failed");
      return response.result;
    },
    error: (failure) => {
      if (failure === "create") throw constructionError;
      return new ProjectConfigError(
        failure === "timeout"
          ? "timeout"
          : failure === "send"
            ? "invalid_input"
            : "generation_failed",
      );
    },
    timeoutMs: 30000,
    signal,
  });
}
