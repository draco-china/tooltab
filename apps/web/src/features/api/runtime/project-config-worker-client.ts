import {
  type OpenapiJob,
  type OpenapiResult,
  ProjectConfigError,
} from "@workspace/tools/project/openapi-contract";
import { serviceWorkerUrl } from "./worker-url";

let active = 0;
export function runOpenapiWorker(
  job: OpenapiJob,
  signal?: AbortSignal,
): Promise<OpenapiResult> {
  signal?.throwIfAborted();
  if (active >= 1) throw new ProjectConfigError("busy");
  if (typeof Worker !== "function") throw new ProjectConfigError("unsupported");
  const snapshot = structuredClone(job);
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      serviceWorkerUrl("project-config-worker", import.meta.url),
      {
        type: "module",
      },
    );
    active++;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      active--;
    };
    const abort = () => {
      finish();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new ProjectConfigError("timeout"));
    }, 30000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (e) => {
      e.preventDefault();
      finish();
      reject(new ProjectConfigError("generation_failed"));
    };
    worker.onmessageerror = () => {
      finish();
      reject(new ProjectConfigError("generation_failed"));
    };
    worker.onmessage = (e) => {
      finish();
      const data: unknown = e.data;
      if (!data || typeof data !== "object") {
        reject(new ProjectConfigError("generation_failed"));
        return;
      }
      if (
        "error" in data &&
        data.error &&
        typeof data.error === "object" &&
        "code" in data.error &&
        typeof data.error.code === "string"
      ) {
        const refs =
          "refs" in data.error && Array.isArray(data.error.refs)
            ? data.error.refs.filter(
                (ref): ref is string => typeof ref === "string",
              )
            : [];
        reject(
          new ProjectConfigError(
            data.error.code as ProjectConfigError["code"],
            refs,
          ),
        );
        return;
      }
      if (
        "result" in data &&
        data.result &&
        typeof data.result === "object" &&
        "output" in data.result &&
        typeof data.result.output === "string" &&
        "bytes" in data.result &&
        typeof data.result.bytes === "number" &&
        Number.isSafeInteger(data.result.bytes) &&
        data.result.bytes >= 0
      ) {
        resolve({ output: data.result.output, bytes: data.result.bytes });
        return;
      }
      reject(new ProjectConfigError("generation_failed"));
    };
    try {
      worker.postMessage(snapshot);
    } catch {
      finish();
      reject(new ProjectConfigError("invalid_input"));
    }
  });
}
