import { parseArchiveWorkerResult } from "@/features/tools/archive-viewer/worker-client";
import type { ArchiveJob, ArchiveResult } from "@workspace/tools/archive";
import { ArchiveError } from "@workspace/tools/archive";
import { runWorkerTask } from "@/lib/worker-task";
import { serviceWorkerUrl } from "./worker-url";

export function runArchiveServiceWorker(
  job: ArchiveJob,
  signal?: AbortSignal,
  timeoutMs = 120000,
): Promise<ArchiveResult> {
  signal?.throwIfAborted();
  if (!process.versions.bun)
    return Promise.reject(new ArchiveError("unsupported"));
  return runWorkerTask(job, {
    create: () =>
      new Worker(
        serviceWorkerUrl("archive-viewer-worker", import.meta.url).href,
      ),
    parse: (data) => parseArchiveWorkerResult(data, job),
    error: (failure) =>
      new ArchiveError(
        failure === "create"
          ? "unsupported"
          : failure === "timeout"
            ? "timeout"
            : failure === "send"
              ? "invalid_input"
              : "read_failed",
      ),
    timeoutMs,
    signal,
  });
}
