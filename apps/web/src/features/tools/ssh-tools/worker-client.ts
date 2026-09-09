import { z } from "zod";
import { runWorkerTask, workerResult } from "@/lib/worker-task";
import type { SshJob, SshResult } from "./jobs";
import { SshError } from "@workspace/tools/crypto/ssh";
export const sshGeneratedSchema = z.strictObject({
  algorithm: z.enum(["ed25519", "rsa"]),
  keyType: z.string(),
  bits: z.number().int(),
  comment: z.string(),
  publicKey: z.string(),
  privateKey: z.string(),
  fingerprintSha256: z.string(),
});
export const sshFingerprintSchema = z.strictObject({
  results: z.array(
    z.strictObject({
      line: z.number().int(),
      keyType: z.string(),
      bits: z.number().int().nullable(),
      curve: z.string().nullable(),
      detailsChecked: z.boolean(),
      comment: z.string(),
      sha256: z.string(),
      md5: z.string(),
    }),
  ),
  errors: z.array(z.strictObject({ line: z.number().int(), code: z.string() })),
});
export function runSsh(
  job: SshJob,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<SshResult> {
  signal.throwIfAborted();
  return runWorkerTask(job, {
    create: createWorker,
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) => new SshError(code ?? "worker_failed"),
      );
      const parsed = (
        job.mode === "generate" ? sshGeneratedSchema : sshFingerprintSchema
      ).safeParse(result);
      if (!parsed.success) throw new SshError("worker_failed");
      return parsed.data;
    },
    error: (failure) =>
      new SshError(failure === "timeout" ? "timeout" : "worker_failed"),
    timeoutMs: 120000,
    signal,
  });
}
