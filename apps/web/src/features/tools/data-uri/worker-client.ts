import { DataUriError } from "@workspace/tools/encoding/data-uri";
export type DataUriJob =
  | { kind: "decode"; input: string }
  | { kind: "encode"; file: Blob };
export type DataUriResult =
  | {
      kind: "encode";
      blob: Blob;
      preview: string;
      size: number;
      mimeType: string;
    }
  | {
      kind: "decode";
      blob: Blob;
      size: number;
      mimeType: string;
      encoding: string;
      filename: string;
      previewKind: string;
      text: string;
      charset: string;
      charsetFallback: boolean;
      truncated: boolean;
    };
export function convertDataUri(
  job: DataUriJob,
  signal: AbortSignal,
): Promise<DataUriResult> {
  signal.throwIfAborted();
  if (typeof Worker !== "function") throw new DataUriError("unsupported");
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    let closed = false;
    const clean = () => {
      if (closed) return;
      closed = true;
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      clean();
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (e) => {
      if (closed) return;
      clean();
      const data: unknown = e.data;
      if (!data || typeof data !== "object") {
        reject(new DataUriError("read_failed"));
      } else if ("error" in data && typeof data.error === "string") {
        reject(new DataUriError(data.error as DataUriError["code"]));
      } else if (
        "kind" in data &&
        data.kind === job.kind &&
        "blob" in data &&
        data.blob instanceof Blob
      ) {
        resolve(data as DataUriResult);
      } else reject(new DataUriError("read_failed"));
    };
    worker.onerror = (e) => {
      if (closed) return;
      e.preventDefault();
      clean();
      reject(new DataUriError("read_failed"));
    };
    worker.onmessageerror = () => {
      if (closed) return;
      clean();
      reject(new DataUriError("read_failed"));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage(job);
    } catch {
      clean();
      reject(new DataUriError("read_failed"));
    }
  });
}
