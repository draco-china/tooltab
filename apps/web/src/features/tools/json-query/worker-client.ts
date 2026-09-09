import { runWorkerTask } from "@/lib/worker-task";
import {
  MAX_QUERY_INPUT,
  QueryError,
  type QueryJob,
  type QueryResult,
} from "@workspace/tools/json/value";

let active = 0;
export function runQueryWorker(
  job: QueryJob,
  signal?: AbortSignal,
  createWorker?: () => Worker,
) {
  signal?.throwIfAborted();
  if (job.input.length > MAX_QUERY_INPUT) throw new QueryError("too_large");
  if (typeof Worker !== "function") throw new QueryError("unsupported");
  if (active >= 1) throw new QueryError("busy");
  const snapshot = structuredClone(job);
  return runWorkerTask(snapshot, {
    create: () => {
      const worker = createWorker
        ? createWorker()
        : new Worker(new URL("./worker.ts", import.meta.url), {
            type: "module",
          });
      const terminate = worker.terminate.bind(worker);
      active++;
      worker.terminate = () => {
        active--;
        terminate();
      };
      return worker;
    },
    parse: (data: unknown): QueryResult => {
      const response = data as {
        result?: QueryResult;
        error?: { code: QueryError["code"] };
      } | null;
      if (response?.error) throw new QueryError(response.error.code);
      if (response?.result) return response.result;
      throw new QueryError("invalid_query");
    },
    error: (failure) =>
      new QueryError(
        failure === "create"
          ? "unsupported"
          : failure === "timeout"
            ? "timeout"
            : "invalid_query",
      ),
    timeoutMs: 30_000,
    signal,
  });
}
