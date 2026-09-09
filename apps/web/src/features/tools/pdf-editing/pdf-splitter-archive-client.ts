import { runWorkerTask } from "@/lib/worker-task";

export class PdfZipError extends Error {}

export function archiveSinglePdf(
  name: string,
  bytes: Uint8Array,
  signal?: AbortSignal,
  timeoutMs = 60000,
): Promise<Uint8Array> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function") return Promise.reject(new PdfZipError());
  let copy: Uint8Array<ArrayBuffer>;
  try {
    copy = bytes.slice();
  } catch {
    return Promise.reject(new PdfZipError());
  }
  return runWorkerTask(
    { name, bytes: copy },
    {
      create: () =>
        new Worker(
          new URL("./pdf-splitter-archive-worker.ts", import.meta.url),
          { type: "module" },
        ),
      parse: (data) => {
        if (
          !data ||
          typeof data !== "object" ||
          !("archive" in data) ||
          !(data.archive instanceof Uint8Array) ||
          ("error" in data && data.error)
        )
          throw new PdfZipError();
        return data.archive;
      },
      error: () => new PdfZipError(),
      signal,
      timeoutMs,
    },
    [copy.buffer],
  );
}
