import { DeveloperParserError } from "@/features/tools/_shared/developer-parser-error";
import { runWorkerTask, workerResult } from "@/lib/worker-task";
import type { DockerResult } from "@workspace/tools/project/docker";

function isDockerResult(value: unknown): value is DockerResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.output === "string" &&
    Array.isArray(result.warnings) &&
    result.warnings.every((warning) => typeof warning === "string") &&
    (typeof result.error === "string" || result.error === null) &&
    typeof result.serviceCount === "number" &&
    Number.isSafeInteger(result.serviceCount) &&
    result.serviceCount >= 0
  );
}

export function runDocker(
  input: string,
  signal: AbortSignal,
  create?: () => Worker,
): Promise<DockerResult> {
  signal.throwIfAborted();
  return runWorkerTask(input, {
    create: () =>
      create
        ? create()
        : new Worker(new URL("./docker-worker.ts", import.meta.url), {
            type: "module",
          }),
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) => new DeveloperParserError(code ?? "worker_failed"),
      );
      if (!isDockerResult(result))
        throw new DeveloperParserError("worker_failed");
      return result;
    },
    error: (failure) =>
      new DeveloperParserError(
        failure === "timeout" ? "timeout" : "worker_failed",
      ),
    timeoutMs: 30000,
    signal,
  });
}
