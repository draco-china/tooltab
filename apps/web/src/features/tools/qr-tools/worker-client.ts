import { runWorkerTask } from "@/lib/worker-task";
import {
  QrError,
  type QrMatrix,
  type QrReadResult,
} from "@workspace/tools/encoding/qr-contract";
import type { QrJob } from "./worker";

let active = 0;
export function runQrWorker(
  job: Extract<QrJob, { kind: "generate" }>,
  signal?: AbortSignal,
  createWorker?: () => Worker,
): Promise<QrMatrix>;
export function runQrWorker(
  job: Extract<QrJob, { kind: "read" }>,
  signal?: AbortSignal,
  createWorker?: () => Worker,
): Promise<QrReadResult>;
export function runQrWorker(
  job: QrJob,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<QrMatrix | QrReadResult> {
  signal?.throwIfAborted();
  if (active >= 2) throw new QrError("busy");
  if (typeof Worker !== "function") throw new QrError("unsupported");
  const snapshot = structuredClone(job);
  return runWorkerTask(snapshot, {
    create: () => {
      let worker: Worker;
      try {
        worker = createWorker();
      } catch (error) {
        if (snapshot.kind === "read") snapshot.data.fill(0);
        throw error;
      }
      const terminate = worker.terminate.bind(worker);
      active++;
      worker.terminate = () => {
        active--;
        if (snapshot.kind === "read") snapshot.data.fill(0);
        terminate();
      };
      return worker;
    },
    parse: (data: unknown): QrMatrix | QrReadResult => {
      if (!data || typeof data !== "object") throw new QrError("decode_failed");
      const response = data as {
        result?: QrMatrix | QrReadResult;
        error?: { code?: QrError["code"] };
      };
      if (response.error)
        throw new QrError(response.error.code ?? "decode_failed");
      if (
        !("result" in response) ||
        response.result === undefined ||
        (snapshot.kind === "generate" && response.result === null)
      )
        throw new QrError("decode_failed");
      return response.result;
    },
    error: (failure) =>
      new QrError(
        failure === "timeout"
          ? "timeout"
          : failure === "send"
            ? "invalid_input"
            : failure === "create"
              ? "unsupported"
              : "decode_failed",
      ),
    timeoutMs: 30_000,
    signal,
  });
}
