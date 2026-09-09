import { runWorkerTask } from "@/lib/worker-task";
import {
  MAX_STRUCTURED_INPUT,
  StructuredError,
  type StructuredJob,
} from "@workspace/tools/encoding/structured";

type StructuredResult = { output: string; bytes: number };
type StructuredResponse = {
  result?: StructuredResult;
  error?: Pick<StructuredError, "code" | "line" | "column">;
};
let active = 0;
export function runStructuredWorker(
  job: StructuredJob,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
) {
  signal?.throwIfAborted();
  if (job.input.length > MAX_STRUCTURED_INPUT)
    throw new StructuredError("too_large");
  if (typeof Worker !== "function") throw new StructuredError("unsupported");
  if (active >= 1) throw new StructuredError("busy");
  const snapshot = { ...job };
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
    parse: (data): StructuredResult => {
      if (!data || typeof data !== "object")
        throw new StructuredError("invalid_input");
      const { error, result } = data as StructuredResponse;
      if (error)
        throw new StructuredError(error.code, error.line, error.column);
      if (!result) throw new StructuredError("invalid_input");
      return result;
    },
    error: (failure) =>
      new StructuredError(
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
