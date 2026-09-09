import { runWorkerTask, workerResult } from "@/lib/worker-task";
import * as z from "zod/v4";
import { AesToolError, envelopeSchema } from "@workspace/tools/crypto/aes";
import type { AesJob, AesResult } from "./jobs";
const common = {
  algorithm: envelopeSchema.shape.algorithm,
  metadata: envelopeSchema.shape.plaintext,
};
const bytes = z.number().int().nonnegative();
const resultSchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("encrypted"),
    json: z.string(),
    bytes,
    outputBytes: bytes,
    key: envelopeSchema.shape.key,
  }),
  z.object({
    ...common,
    kind: z.literal("inspected"),
    cipherBytes: bytes,
    key: envelopeSchema.shape.key,
  }),
  z.object({
    ...common,
    kind: z.literal("decrypted"),
    bytes: z.instanceof(Uint8Array),
    text: z.string().nullable(),
    authenticated: z.boolean(),
    metadataAuthenticated: z.literal(false),
    sizeMatches: z.boolean().nullable(),
  }),
]);
export function runAesWorker(
  job: AesJob,
  signal?: AbortSignal,
  timeoutMs = 60000,
  createWorker?: () => Worker,
): Promise<AesResult> {
  signal?.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new AesToolError("unsupported"));
  return runWorkerTask(job, {
    create:
      createWorker ??
      (() =>
        new Worker(new URL("./worker.ts", import.meta.url), {
          type: "module",
        })),
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) =>
          new AesToolError((code ?? "invalid_input") as AesToolError["code"]),
      );
      const parsed = resultSchema.safeParse(result);
      if (!parsed.success) throw new AesToolError("invalid_input");
      return parsed.data;
    },
    error: (failure) =>
      new AesToolError(
        failure === "timeout"
          ? "timeout"
          : failure === "send"
            ? "invalid_input"
            : "unsupported",
      ),
    timeoutMs,
    signal,
  });
}
