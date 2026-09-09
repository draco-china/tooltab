import { runBrowserImage } from "./browser-image";
import type { ReadingJob, ReadingResult } from "./types";
import { runReadingTask } from "./worker-task";
export function runReadingWorker(
  job: ReadingJob,
  signal?: AbortSignal,
  timeoutMs = 60000,
  onProgress?: (done: number, total: number) => void,
): Promise<ReadingResult> {
  signal?.throwIfAborted();
  if (job.kind === "image")
    return runBrowserImage(job, signal, timeoutMs, onProgress);
  return runReadingTask(
    job,
    () =>
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
    signal,
    timeoutMs,
    onProgress,
  );
}
