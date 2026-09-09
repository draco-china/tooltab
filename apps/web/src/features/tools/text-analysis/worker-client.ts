import { runWorkerTask } from "@/lib/worker-task";
import {
  type AnalysisJob,
  type AnalysisResult,
  TextAnalysisError,
} from "@workspace/tools/text/analysis";
export function runTextAnalysisWorker(
  job: AnalysisJob,
  signal?: AbortSignal,
  timeoutMs = 10000,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<AnalysisResult> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new TextAnalysisError("unsupported"));
  return runWorkerTask(job, {
    create: createWorker,
    parse: (data) => {
      if (!data || typeof data !== "object")
        throw new TextAnalysisError("invalid_input");
      const reply = data as {
        result?: AnalysisResult;
        error?: TextAnalysisError["code"];
        detail?: string;
      };
      if (reply.error) throw new TextAnalysisError(reply.error, reply.detail);
      if (!reply.result) throw new TextAnalysisError("invalid_input");
      return reply.result;
    },
    error: (failure) =>
      new TextAnalysisError(
        failure === "timeout"
          ? "timeout"
          : failure === "send"
            ? "invalid_input"
            : "unsupported",
      ),
    timeoutMs,
    signal,
  });
}
