import { runWorkerTask, workerResult } from "@/lib/worker-task";
import {
  IcalError,
  type IcalOptions,
  type IcalResult,
} from "@workspace/tools/time/ical-contract";

function isIcalResult(value: unknown): value is IcalResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.content === "string" &&
    typeof result.filename === "string" &&
    typeof result.uid === "string" &&
    typeof result.dtstamp === "string" &&
    Array.isArray(result.warnings) &&
    result.warnings.every((warning) => typeof warning === "string") &&
    typeof result.timeZoneTransitions === "number" &&
    Number.isSafeInteger(result.timeZoneTransitions) &&
    result.timeZoneTransitions >= 0
  );
}

export function runIcal(
  options: IcalOptions,
  nowMs: number,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<IcalResult> {
  signal.throwIfAborted();
  return runWorkerTask(
    { options, nowMs },
    {
      create: createWorker,
      parse: (data) => {
        const result = workerResult<unknown>(
          data,
          (code) => new IcalError(code ?? "worker_failed"),
        );
        if (!isIcalResult(result)) throw new IcalError("worker_failed");
        return result;
      },
      error: (failure) =>
        new IcalError(failure === "timeout" ? "timeout" : "worker_failed"),
      timeoutMs: 30000,
      signal,
    },
  );
}
