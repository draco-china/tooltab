import { runWorkerTask } from "@/lib/worker-task";
import {
  BarcodeError,
  type BarcodeImage,
  type BarcodeOptions,
} from "@workspace/tools/encoding/barcode-contract";

let active = 0;

export function runBarcodeGeneratorWorker(
  options: BarcodeOptions,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./generator-worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<BarcodeImage> {
  signal?.throwIfAborted();
  if (active >= 2) throw new BarcodeError("busy");
  if (typeof Worker !== "function") throw new BarcodeError("unsupported");
  const snapshot = structuredClone({ kind: "generate" as const, options });
  return runWorkerTask(snapshot, {
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
    parse: (data: unknown): BarcodeImage => {
      if (!data || typeof data !== "object")
        throw new BarcodeError("invalid_input");
      const response = data as {
        result?: BarcodeImage;
        error?: { code?: BarcodeError["code"] };
      };
      if (response.error)
        throw new BarcodeError(response.error.code ?? "invalid_input");
      if (!("result" in response) || response.result === undefined)
        throw new BarcodeError("invalid_input");
      if (!response.result) throw new BarcodeError("invalid_input");
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
              : "unsupported",
      ),
    timeoutMs: 30_000,
    signal,
  });
}
