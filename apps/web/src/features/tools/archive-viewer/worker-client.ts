import { z } from "zod";
import type { ArchiveJob, ArchiveResult } from "@workspace/tools/archive";
import { ArchiveError } from "@workspace/tools/archive";
import { runWorkerTask, workerResult } from "@/lib/worker-task";

export const archiveEntrySchema = z.strictObject({
  id: z.string(),
  path: z.string(),
  kind: z.enum(["file", "directory", "symlink", "other"]),
  size: z.number(),
  compressedSize: z.number().nullable(),
  modifiedAt: z.string().nullable(),
  unsafePath: z.boolean(),
  encrypted: z.boolean(),
  linkTarget: z.string().optional(),
});
const archiveResultSchema = z.object({
  format: z.enum(["zip", "tar", "gz", "tgz"]),
  entries: z.array(archiveEntrySchema),
  archiveBytes: z.number().int().nonnegative(),
  uncompressedBytes: z.number().int().nonnegative(),
  bytes: z
    .custom<Uint8Array<ArrayBuffer>>(
      (value) =>
        value instanceof Uint8Array && value.buffer instanceof ArrayBuffer,
    )
    .optional(),
  previewText: z.string().optional(),
  highlighted: z.string().optional(),
});
export function parseArchiveWorkerResult(
  data: unknown,
  job: ArchiveJob,
): ArchiveResult & { highlighted?: string } {
  const result = workerResult<unknown>(
    data,
    (code) => new ArchiveError((code ?? "read_failed") as ArchiveError["code"]),
  );
  const parsed = archiveResultSchema.safeParse(result);
  if (
    !parsed.success ||
    (job.action !== "list" &&
      (parsed.data.bytes === undefined ||
        !parsed.data.entries.some((entry) => entry.id === job.entryId)))
  )
    throw new ArchiveError("read_failed");
  return parsed.data;
}

export function runArchiveWorker(
  job: ArchiveJob,
  signal?: AbortSignal,
  timeoutMs = 120000,
): Promise<ArchiveResult & { highlighted?: string }> {
  signal?.throwIfAborted();
  return runWorkerTask(job, {
    create: () => {
      if (typeof Worker !== "function") throw new ArchiveError("unsupported");
      return new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
    },
    parse: (data) => parseArchiveWorkerResult(data, job),
    error: (failure) =>
      new ArchiveError(
        failure === "create"
          ? "unsupported"
          : failure === "timeout"
            ? "timeout"
            : failure === "send"
              ? "invalid_input"
              : "read_failed",
      ),
    timeoutMs,
    signal,
  });
}
