import type { Base58AlphabetKey } from "@workspace/tools/encoding/base58";
import { runWorkerTask } from "@/lib/worker-task";
import { Base58EncoderError } from "./logic";

export function runBase58Encoder(
  bytes: Uint8Array<ArrayBuffer>,
  alphabet: Base58AlphabetKey,
  signal?: AbortSignal,
  createWorker?: () => Worker,
) {
  signal?.throwIfAborted();
  if (!createWorker && typeof Worker !== "function") {
    throw new Base58EncoderError("unsupported");
  }

  return runWorkerTask(
    { bytes, alphabet },
    {
      create:
        createWorker ??
        (() =>
          new Worker(new URL("./encoder-worker.ts", import.meta.url), {
            type: "module",
          })),
      signal,
      timeoutMs: 120_000,
      error: () => new Base58EncoderError("unsupported"),
      parse: (data): string => {
        if (!data || typeof data !== "object")
          throw new Base58EncoderError("unsupported");
        if ("error" in data)
          throw new Base58EncoderError(
            data.error === "too-large" ? "too-large" : "unsupported",
          );
        if (!("encoded" in data) || typeof data.encoded !== "string")
          throw new Base58EncoderError("unsupported");
        return data.encoded;
      },
    },
  );
}
