import type {
  ReadingJob,
  ReadingResult,
} from "@/features/tools/pdf-reading/types";
import { runReadingTask } from "@/features/tools/pdf-reading/worker-task";
import { serviceWorkerUrl } from "./worker-url";
export function runServiceReadingWorker(
  job: ReadingJob,
  signal?: AbortSignal,
  timeoutMs = 60000,
  onProgress?: (done: number, total: number) => void,
): Promise<ReadingResult> {
  return runReadingTask(
    job,
    () =>
      new Worker(serviceWorkerUrl("pdf-reading-worker", import.meta.url), {
        type: "module",
      }),
    signal,
    timeoutMs,
    onProgress,
  );
}
