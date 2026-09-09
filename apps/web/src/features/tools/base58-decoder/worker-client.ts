import type { Base58AlphabetKey } from "@workspace/tools/encoding/base58";
import { runWorkerTask, workerResult } from "@/lib/worker-task";
import type { DecodeBase58PreviewResult } from "./logic";

export type Base58DecodeInput = { input: string; alphabet: Base58AlphabetKey };

export function runBase58Decoder(
  input: Base58DecodeInput,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
) {
  signal.throwIfAborted();
  return runWorkerTask(input, {
    create: createWorker,
    signal,
    timeoutMs: 120_000,
    error: () => new Error("worker_failed"),
    parse: (data) => {
      const result = workerResult<DecodeBase58PreviewResult>(
        data,
        () => new Error("worker_failed"),
      );
      if (!result || typeof result !== "object")
        throw new Error("worker_failed");
      if (result.state === "empty" || result.state === "invalid-base58")
        return result;
      if (
        result.state !== "decoded" ||
        !(result.bytes instanceof Uint8Array) ||
        typeof result.text !== "string" ||
        typeof result.previewText !== "string" ||
        typeof result.isPreviewTruncated !== "boolean"
      )
        throw new Error("worker_failed");
      return result;
    },
  });
}
