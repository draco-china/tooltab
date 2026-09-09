import { runWorkerTask } from "@/lib/worker-task";
import {
  BaseEncodingError,
  type BaseEncodingOptions,
  type BaseKind,
} from "@workspace/tools/encoding/base";
export type BaseWorkerJob =
  | {
      kind: BaseKind;
      decode: true;
      source: string;
      options?: BaseEncodingOptions;
    }
  | {
      kind: BaseKind;
      decode: false;
      bytes: Uint8Array<ArrayBuffer>;
      options?: BaseEncodingOptions;
      padding?: boolean;
    };
export type BaseWorkerResult =
  | { encoded: string }
  | { decoded: Uint8Array<ArrayBuffer> };
export function runBaseWorker(
  job: BaseWorkerJob,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<BaseWorkerResult> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function") throw new BaseEncodingError("unsupported");
  return runWorkerTask(job, {
    create: createWorker,
    signal,
    error: () => new BaseEncodingError("unsupported"),
    parse: (data) => {
      if (!data || typeof data !== "object")
        throw new BaseEncodingError("unsupported");
      if ("error" in data)
        throw new BaseEncodingError(data.error as BaseEncodingError["code"]);
      return data as BaseWorkerResult;
    },
  });
}
