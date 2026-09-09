import {
  BarcodeError,
  type BarcodeImage,
  type BarcodeReadResult,
} from "@workspace/tools/encoding/barcode-contract";
import type { BarcodeJob } from "./barcode-worker";
import { serviceWorkerUrl } from "./worker-url";

let active = 0;
export function runBarcodeWorker(
  job: Extract<BarcodeJob, { kind: "generate" }>,
  signal?: AbortSignal,
): Promise<BarcodeImage>;
export function runBarcodeWorker(
  job: Extract<BarcodeJob, { kind: "read" }>,
  signal?: AbortSignal,
): Promise<BarcodeReadResult>;
export function runBarcodeWorker(
  job: BarcodeJob,
  signal?: AbortSignal,
): Promise<BarcodeImage | BarcodeReadResult> {
  signal?.throwIfAborted();
  if (active >= 2) throw new BarcodeError("busy");
  if (typeof Worker !== "function") throw new BarcodeError("unsupported");
  const snapshot = structuredClone(job);
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      serviceWorkerUrl("barcode-worker", import.meta.url),
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
      worker.onmessage = worker.onerror = null;
      worker.terminate();
      active--;
    };
    const abort = () => {
      finish();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new BarcodeError("timeout"));
    }, 30000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (e) => {
      e.preventDefault();
      finish();
      reject(new BarcodeError("decode_failed"));
    };
    worker.onmessage = (e) => {
      finish();
      if (e.data.error) reject(new BarcodeError(e.data.error.code));
      else resolve(e.data.result);
    };
    try {
      worker.postMessage(snapshot);
    } catch {
      finish();
      reject(new BarcodeError("invalid_input"));
    }
  });
}
