import { runWorkerTask } from "@/lib/worker-task";
import { type BarcodeReadJob, barcodeReadJobSchema } from "./types";
import {
  BarcodeError,
  type BarcodeReadResult,
} from "@workspace/tools/encoding/barcode-contract";

let active = 0;

export function runBarcodeReaderWorker(
  input: BarcodeReadJob,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./reader-worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<BarcodeReadResult> {
  signal?.throwIfAborted();
  const job = barcodeReadJobSchema.parse(input);
  if (active >= 2) throw new BarcodeError("busy");
  if (typeof Worker !== "function") throw new BarcodeError("unsupported");
  const snapshot = structuredClone(job);
  return runWorkerTask(
    snapshot,
    {
      create: () => {
        const worker = createWorker();
        const terminate = worker.terminate.bind(worker);
        active += 1;
        worker.terminate = () => {
          active -= 1;
          terminate();
        };
        return worker;
      },
      parse: (data: unknown): BarcodeReadResult => {
        if (!data || typeof data !== "object")
          throw new BarcodeError("decode_failed");
        const response = data as {
          result?: BarcodeReadResult;
          error?: { code?: BarcodeError["code"] };
        };
        if (response.error)
          throw new BarcodeError(response.error.code ?? "decode_failed");
        if (!("result" in response) || response.result === undefined)
          throw new BarcodeError("decode_failed");
        return response.result;
      },
      error: (failure) =>
        new BarcodeError(
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
    },
    [snapshot.data.buffer],
  );
}
