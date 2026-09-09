import { validateDimensions } from "@workspace/tools/image/options";
import { runWorkerTask } from "@/lib/worker-task";
import {
  CssGeneratorError,
  gradientSchema,
} from "@workspace/tools/css/generators";
export type GradientRasterJob = {
  input: unknown;
  width: number;
  height: number;
};
export const GRADIENT_TIMEOUT_MS = 300_000;
let active = 0;
export function runGradientWorker(
  job: GradientRasterJob,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./raster-worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  validateDimensions(job);
  const snapshot = { ...job, input: gradientSchema.parse(job.input) };
  if (typeof Worker !== "function" || active >= 2)
    throw new CssGeneratorError("export_failed");
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
    parse: (data) => {
      if (!data || typeof data !== "object")
        throw new CssGeneratorError("export_failed");
      const pixels = (data as { pixels?: unknown }).pixels;
      if (
        !(pixels instanceof Uint8Array) ||
        pixels.byteLength !== snapshot.width * snapshot.height * 4
      )
        throw new CssGeneratorError("export_failed");
      return pixels as Uint8Array<ArrayBuffer>;
    },
    error: (failure) =>
      failure === "timeout"
        ? new DOMException("Gradient rendering timed out", "TimeoutError")
        : new CssGeneratorError("export_failed"),
    timeoutMs: GRADIENT_TIMEOUT_MS,
    signal,
  });
}
