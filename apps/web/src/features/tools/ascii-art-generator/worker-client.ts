import { z } from "zod";
import { workerResult } from "@/lib/worker-task";
import {
  ASCII_INPUT_LIMIT,
  AsciiError,
  type AsciiJob,
  type AsciiResult,
  asciiOptionsSchema,
} from "@workspace/tools/text/ascii";

const resultSchema = z.object({
  output: z.string(),
  filename: z.string(),
  bytes: z.number().int().nonnegative(),
  lines: z.number().int().nonnegative(),
  font: z.string(),
  align: asciiOptionsSchema.shape.align.unwrap(),
  width: z.number().int().nonnegative(),
});
let active = 0;
export function runAsciiWorker(input: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let job: AsciiJob;
  try {
    job = asciiOptionsSchema.parse(input);
  } catch {
    throw new AsciiError("invalid_input");
  }
  if (new TextEncoder().encode(job.text).length > ASCII_INPUT_LIMIT)
    throw new AsciiError("invalid_input");
  if (typeof Worker !== "function") throw new AsciiError("unsupported");
  if (active >= 1) throw new AsciiError("busy");
  return new Promise<AsciiResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      reject(new AsciiError("unsupported"));
      return;
    }
    active++;
    let settled = false;
    const close = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      active--;
    };
    const abort = () => {
      close();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      close();
      reject(new AsciiError("timeout"));
    }, 20_000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      event.preventDefault();
      close();
      reject(new AsciiError("invalid_input"));
    };
    worker.onmessageerror = () => {
      close();
      reject(new AsciiError("invalid_input"));
    };
    worker.onmessage = (
      event: MessageEvent<{ result?: AsciiResult; error?: AsciiError["code"] }>,
    ) => {
      if (settled) return;
      close();
      try {
        const result = workerResult<unknown>(
          event.data,
          (code) =>
            new AsciiError((code ?? "invalid_input") as AsciiError["code"]),
        );
        const parsed = resultSchema.safeParse(result);
        if (!parsed.success) throw new AsciiError("invalid_input");
        resolve(parsed.data);
      } catch (error) {
        reject(error);
      }
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage(structuredClone(job));
    } catch (error) {
      close();
      reject(error);
    }
  });
}
