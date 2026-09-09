import {
  MAX_SCHEMA_INPUT,
  SchemaToolError,
} from "@workspace/tools/json/schema-contract";
import type { SchemaJob, SchemaResult } from "./jobs";

let active = 0;
export function runSchemaWorker(
  job: SchemaJob,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
) {
  signal?.throwIfAborted();
  if (job.input.length > MAX_SCHEMA_INPUT)
    throw new SchemaToolError("too_large");
  if (typeof Worker !== "function") throw new SchemaToolError("unsupported");
  if (active >= 1) throw new SchemaToolError("busy");
  const snapshot = structuredClone(job);
  return new Promise<SchemaResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = createWorker();
    } catch {
      reject(new SchemaToolError("unsupported"));
      return;
    }
    active++;
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
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
      reject(new SchemaToolError("timeout"));
    }, 30000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      event.preventDefault();
      close();
      reject(new SchemaToolError("invalid_options"));
    };
    worker.onmessageerror = () => {
      close();
      reject(new SchemaToolError("invalid_options"));
    };
    worker.onmessage = (
      event: MessageEvent<{
        result?: SchemaResult;
        error?: {
          code: SchemaToolError["code"];
          line?: number;
          column?: number;
        };
      }>,
    ) => {
      if (done) return;
      close();
      if (!event.data || typeof event.data !== "object") {
        reject(new SchemaToolError("invalid_options"));
        return;
      }
      if (event.data.error) {
        const e = event.data.error;
        reject(new SchemaToolError(e.code));
      } else if (event.data.result) resolve(event.data.result);
      else reject(new SchemaToolError("invalid_options"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage(snapshot);
    } catch {
      close();
      reject(new SchemaToolError("invalid_options"));
    }
  });
}
