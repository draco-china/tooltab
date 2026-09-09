import { runWorkerTask } from "@/lib/worker-task";
import { Base85DecoderError, type Base85Variant } from "./logic";
export function runBase85DecoderWorker(
  source: string,
  variant: Base85Variant,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (typeof Worker !== "function") throw new Base85DecoderError("unsupported");
  return runWorkerTask(
    { source, variant },
    {
      create: () =>
        new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
      parse: (data: unknown): Uint8Array<ArrayBuffer> => {
        const value = data as {
          bytes?: Uint8Array<ArrayBuffer>;
          error?: Base85DecoderError["code"];
        } | null;
        if (value?.error) throw new Base85DecoderError(value.error);
        if (value?.bytes instanceof Uint8Array) return value.bytes;
        throw new Base85DecoderError("invalid-encoding");
      },
      error: () => new Base85DecoderError("unsupported"),
      timeoutMs: 30_000,
      signal,
    },
  );
}
