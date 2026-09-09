import { runWorkerTask } from "@/lib/worker-task";
import { PdfEditingError } from "@workspace/tools/pdf/core";
import type { ImageFile } from "./types";

export function packImages(
  files: ImageFile[],
  signal: AbortSignal,
  timeoutMs = 60000,
): Promise<{ files: ImageFile[]; archive: Uint8Array | null }> {
  signal.throwIfAborted();
  if (files.length < 2) return Promise.resolve({ files, archive: null });
  return runWorkerTask(
    files,
    {
      create: () =>
        new Worker(new URL("./zip-worker.ts", import.meta.url), {
          type: "module",
        }),
      parse: (data) => {
        if (!data || typeof data !== "object")
          throw new PdfEditingError("invalid_pdf");
        const result = data as Partial<{
          files: ImageFile[];
          archive: Uint8Array;
          error: unknown;
        }>;
        if (result.error) throw new PdfEditingError("too_large");
        if (
          !(result.archive instanceof Uint8Array) ||
          !Array.isArray(result.files) ||
          result.files.length !== files.length ||
          !result.files.every(
            (file, index) =>
              file &&
              file.bytes instanceof Uint8Array &&
              file.name === files[index].name &&
              file.page === files[index].page &&
              file.width === files[index].width &&
              file.height === files[index].height,
          )
        )
          throw new PdfEditingError("invalid_pdf");
        return { files: result.files, archive: result.archive };
      },
      error: (failure) =>
        new PdfEditingError(
          failure === "create"
            ? "unsupported"
            : failure === "send"
              ? "too_large"
              : failure === "timeout"
                ? "timeout"
                : "invalid_pdf",
        ),
      signal,
      timeoutMs,
    },
    files.map((file) => file.bytes.buffer as ArrayBuffer),
  );
}
