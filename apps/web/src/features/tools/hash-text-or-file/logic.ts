import { ShaHashError } from "@workspace/tools/hash/sha-input";
/** FileReader supports cancelling an in-progress file read. No blob URL is used. */
export function readHashFile(
  file: File,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal.throwIfAborted();
  if (file.size > maxBytes) throw new ShaHashError("too-large");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const clean = () => {
      signal.removeEventListener("abort", abort);
      reader.onload = reader.onerror = reader.onabort = null;
    };
    const abort = () => {
      reader.abort();
      clean();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    reader.onload = () => {
      const result = reader.result;
      clean();
      if (signal.aborted) reject(signal.reason);
      else if (result instanceof ArrayBuffer) resolve(new Uint8Array(result));
      else reject(new ShaHashError("read-failed"));
    };
    reader.onerror = () => {
      clean();
      reject(new ShaHashError("read-failed"));
    };
    reader.onabort = () => {
      clean();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      reader.readAsArrayBuffer(file);
    } catch {
      clean();
      reject(new ShaHashError("read-failed"));
    }
  });
}
