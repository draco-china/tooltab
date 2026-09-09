import {
  type BlakeAlgorithm,
  BlakeHashError,
  type BlakeOptions,
} from "@workspace/tools/hash/blake";
import { runWorkerTask } from "@/lib/worker-task";

export type BlakeWorkerJob = {
  algorithm: Exclude<BlakeAlgorithm, "Keccak">;
  bytes: Uint8Array<ArrayBuffer>;
  options: BlakeOptions;
};

export function runBlakeWorker(
  job: BlakeWorkerJob,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function") throw new BlakeHashError("unsupported");
  return runWorkerTask<BlakeWorkerJob, Uint8Array<ArrayBuffer>>(job, {
    create: () => {
      return new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
    },
    parse: (data) => {
      if (!data || typeof data !== "object")
        throw new BlakeHashError("digest-failed");
      if ("error" in data && typeof data.error === "string")
        throw new BlakeHashError(data.error as BlakeHashError["code"]);
      if (!("result" in data)) throw new BlakeHashError("digest-failed");
      return data.result as Uint8Array<ArrayBuffer>;
    },
    error: (failure) =>
      new BlakeHashError(
        failure === "create" || failure === "send"
          ? "unsupported"
          : "digest-failed",
      ),
    signal,
  });
}
