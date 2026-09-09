import { z } from "zod";
import { ImageMetadataError } from "@workspace/tools/image/metadata-containers";
import { runWorkerTask, workerResult } from "@/lib/worker-task";
import type { ImageMetadataJob, ImageMetadataResult } from "./logic";

const count = z.number().int().nonnegative();
const metadataResultSchema = z.object({
  kind: z.literal("metadata"),
  format: z.string(),
  groups: z.array(
    z.object({
      id: z.enum(["basic", "camera", "gps", "advanced"]),
      entries: z.array(
        z.object({
          key: z.string(),
          source: z.string(),
          value: z.unknown(),
          description: z.string(),
        }),
      ),
    }),
  ),
  fields: count,
  gps: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
  json: z.string(),
  warnings: z.array(z.string()),
  preview: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .nullable(),
});
const cleanResultSchema = z.object({
  kind: z.literal("cleaned"),
  format: z.enum(["jpeg", "png", "webp"]),
  bytes: z.instanceof(Uint8Array),
  originalBytes: count,
  removedBytes: count,
  removed: z.record(z.string(), count),
  preservesCompressedPixels: z.literal(true),
  appearanceMayChange: z.literal(true),
});

export function runImageMetadataWorker(
  job: ImageMetadataJob,
  signal?: AbortSignal,
  timeoutMs = 30000,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
): Promise<ImageMetadataResult> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new ImageMetadataError("unsupported"));
  return runWorkerTask(job, {
    create: createWorker,
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) =>
          new ImageMetadataError(
            (code ?? "invalid_image") as ImageMetadataError["code"],
          ),
      );
      const parsed = (
        job.kind === "inspect" ? metadataResultSchema : cleanResultSchema
      ).safeParse(result);
      if (!parsed.success) throw new ImageMetadataError("invalid_image");
      return parsed.data;
    },
    error: (failure) =>
      new ImageMetadataError(
        failure === "timeout"
          ? "timeout"
          : failure === "send"
            ? "invalid_image"
            : "unsupported",
      ),
    timeoutMs,
    signal,
  });
}
