import { runWorkerTask, workerResult } from "@/lib/worker-task";
import {
  type CurlOptions,
  CurlToolError,
} from "@workspace/tools/network/curl-contract";
import type { CurlResult } from "./types";

export function runCurl(
  job: CurlOptions,
  signal: AbortSignal,
  createWorker?: () => Worker,
): Promise<CurlResult> {
  signal.throwIfAborted();
  return runWorkerTask(job, {
    create: () =>
      createWorker
        ? createWorker()
        : new Worker(new URL("./worker.ts", import.meta.url), {
            type: "module",
          }),
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) => new CurlToolError(code ?? "worker_failed"),
      );
      if (
        !result ||
        typeof result !== "object" ||
        !("output" in result) ||
        typeof result.output !== "string" ||
        !("filename" in result) ||
        typeof result.filename !== "string" ||
        !("highlighted" in result) ||
        typeof result.highlighted !== "string" ||
        !("previewTruncated" in result) ||
        typeof result.previewTruncated !== "boolean" ||
        !("error" in result) ||
        (result.error !== null && typeof result.error !== "string") ||
        !("warnings" in result) ||
        !Array.isArray(result.warnings) ||
        !result.warnings.every(
          (warning: unknown) =>
            warning !== null &&
            typeof warning === "object" &&
            "code" in warning &&
            typeof warning.code === "string" &&
            "message" in warning &&
            typeof warning.message === "string",
        )
      )
        throw new CurlToolError("worker_failed");
      return result as CurlResult;
    },
    error: (failure) =>
      new CurlToolError(failure === "timeout" ? "timeout" : "worker_failed"),
    timeoutMs: 30_000,
    signal,
  });
}
