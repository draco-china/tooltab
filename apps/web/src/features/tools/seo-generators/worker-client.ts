import { runWorkerTask } from "@/lib/worker-task";
import {
  MAX_SEO_INPUT,
  SeoError,
  type SeoJob,
  type SeoResult as SeoOutput,
} from "@workspace/tools/project/seo";

export type SeoResult = SeoOutput & { highlighted?: string };

type SeoResponse = {
  result?: SeoResult;
  error?: Pick<SeoError, "code" | "index">;
};
let active = 0;
export function runSeoWorker(
  job: SeoJob,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
) {
  signal?.throwIfAborted();
  if (
    new TextEncoder().encode(JSON.stringify(job.state)).length > MAX_SEO_INPUT
  )
    throw new SeoError("too_large");
  if (typeof Worker !== "function") throw new SeoError("unsupported");
  if (active >= 1) throw new SeoError("busy");
  const snapshot = structuredClone(job);
  return runWorkerTask(snapshot, {
    create: () => {
      const worker = createWorker();
      const terminate = worker.terminate.bind(worker);
      active++;
      worker.terminate = () => {
        active--;
        terminate();
      };
      return worker;
    },
    parse: (data): SeoResult => {
      if (!data || typeof data !== "object")
        throw new SeoError("invalid_input");
      const { error, result } = data as SeoResponse;
      if (error) throw new SeoError(error.code, error.index);
      if (!result) throw new SeoError("invalid_input");
      return result;
    },
    error: (failure) =>
      new SeoError(
        failure === "create"
          ? "unsupported"
          : failure === "timeout"
            ? "timeout"
            : "invalid_input",
      ),
    timeoutMs: 30000,
    signal,
  });
}
