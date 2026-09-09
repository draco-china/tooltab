import {
  CsvJsonError,
  type CsvJsonJob,
  type CsvJsonResult,
} from "@workspace/tools/encoding/csv-json";
import { runWorkerTask } from "@/lib/worker-task";

export function runCsvJsonWorker(
  job: CsvJsonJob,
  signal?: AbortSignal,
  timeoutMs = 30000,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<CsvJsonResult> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new CsvJsonError("unsupported"));
  return runWorkerTask(job, {
    create: createWorker,
    parse(data: unknown) {
      if (!data || typeof data !== "object")
        throw new CsvJsonError("invalid_input");
      const response = data as {
        error?: CsvJsonError["code"];
        row?: number;
        result?: CsvJsonResult;
      };
      if (response.error) throw new CsvJsonError(response.error, response.row);
      if (!response.result) throw new CsvJsonError("invalid_input");
      return response.result;
    },
    error: (failure) =>
      new CsvJsonError(
        failure === "timeout"
          ? "timeout"
          : failure === "create" || failure === "error"
            ? "unsupported"
            : "invalid_input",
      ),
    timeoutMs,
    signal,
  });
}
