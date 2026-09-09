import { runWorkerTask } from "@/lib/worker-task";
import {
  MAX_MARKDOWN_INPUT,
  MarkdownError,
} from "@workspace/tools/text/markdown-contract";
import type { MarkdownJob, MarkdownResult } from "./types";

let active = 0;
export function runMarkdownWorker(
  job: MarkdownJob,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
) {
  signal?.throwIfAborted();
  if (job.input.length > MAX_MARKDOWN_INPUT)
    throw new MarkdownError("too_large");
  if (typeof Worker !== "function") throw new MarkdownError("unsupported");
  if (active >= 1) throw new MarkdownError("busy");
  const snapshot = structuredClone(job);
  return runWorkerTask(snapshot, {
    create: () => {
      const worker = createWorker();
      const terminate = worker.terminate.bind(worker);
      active++;
      worker.terminate = () => {
        active--;
        terminate();
      };
      return worker;
    },
    parse: (data: unknown): MarkdownResult => {
      const response = data as {
        result?: MarkdownResult;
        error?: { code: MarkdownError["code"] };
      } | null;
      if (response?.error) throw new MarkdownError(response.error.code);
      if (response?.result && response.result.kind === snapshot.kind)
        return response.result;
      throw new MarkdownError("invalid_input");
    },
    error: (failure) =>
      new MarkdownError(
        failure === "create"
          ? "unsupported"
          : failure === "timeout"
            ? "timeout"
            : "invalid_input",
      ),
    timeoutMs: 30_000,
    signal,
  });
}
