import { z } from "zod";
import { ImageFormatError } from "@workspace/tools/image";
import { runWorkerTask, workerResult } from "@/lib/worker-task";
import type { FormatBatch, FormatJob } from "./image-formats-worker";
import { serviceWorkerUrl } from "./worker-url";

const count = z.number().int().nonnegative();
const positive = z.number().int().positive();
const resultSchema = z.object({
  bytes: z.custom<Uint8Array<ArrayBuffer>>(
    (value) =>
      value instanceof Uint8Array &&
      value.buffer instanceof ArrayBuffer &&
      value.length > 0,
  ),
  mimeType: z.string(),
  filename: z.string(),
  files: z
    .array(
      z.object({
        name: z.string(),
        bytes: positive,
        inputBytes: count,
        width: positive,
        height: positive,
        sizes: z.array(positive).optional(),
      }),
    )
    .nonempty(),
  errors: z.array(z.object({ name: z.string(), code: z.string() })),
});

export function runImageFormatsWorker(
  job: FormatJob,
  signal?: AbortSignal,
  timeoutMs = 120000,
): Promise<FormatBatch> {
  signal?.throwIfAborted();
  if (!process.versions.bun)
    return Promise.reject(new ImageFormatError("unsupported"));
  return runWorkerTask(job, {
    create: () =>
      new Worker(
        serviceWorkerUrl("image-formats-worker", import.meta.url).href,
      ),
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) =>
          new ImageFormatError(
            (code ?? "conversion_failed") as ImageFormatError["code"],
          ),
      );
      const parsed = resultSchema.safeParse(result);
      if (!parsed.success) throw new ImageFormatError("conversion_failed");
      return parsed.data;
    },
    error: (failure) =>
      new ImageFormatError(
        failure === "timeout"
          ? "timeout"
          : failure === "send"
            ? "invalid_image"
            : "conversion_failed",
      ),
    timeoutMs,
    signal,
  });
}
