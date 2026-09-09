import { z } from "zod";
import { JoseToolError } from "@workspace/tools/crypto/jose-common";
import { runWorkerTask, workerResult } from "@/lib/worker-task";
import type { JoseJob, JoseResult } from "./jobs";
const claim = z.strictObject({
  claim: z.string(),
  status: z.enum(["invalid", "expired", "future", "valid"]),
  value: z.unknown(),
  date: z.string().nullable(),
});
export const joseTokenSchema = z.strictObject({
  token: z.string(),
  headerJson: z.string(),
  payloadJson: z.string(),
  signature: z.string(),
  algorithm: z.string().nullable(),
  signatureValid: z.boolean().nullable(),
  claims: z.array(claim),
});
export const joseConverterSchema = z.strictObject({
  output: z.string(),
  warnings: z.array(z.string()),
});
// Worker results also retain parsed values used by the UI; the public protocol
// deliberately projects only the JSON strings above.
const decodedMessageSchema = joseTokenSchema
  .omit({ algorithm: true, signatureValid: true })
  .extend({
    header: z.record(z.string(), z.unknown()),
    payload: z.unknown().refine((value) => value !== undefined),
  });
const signedMessageSchema = decodedMessageSchema.extend({
  algorithm: z.string(),
});
const verifiedMessageSchema = signedMessageSchema.extend({
  signatureValid: z.boolean(),
});
export function runJose(
  job: JoseJob,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<JoseResult> {
  signal.throwIfAborted();
  return runWorkerTask(job, {
    create: createWorker,
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) => new JoseToolError(code ?? "worker_failed"),
      );
      const parsed = (
        job.mode === "jwkToPem" || job.mode === "pemToJwk"
          ? joseConverterSchema
          : job.mode === "decode"
            ? decodedMessageSchema
            : job.mode === "sign"
              ? signedMessageSchema
              : verifiedMessageSchema
      ).safeParse(result);
      if (!parsed.success) throw new JoseToolError("worker_failed");
      return parsed.data;
    },
    error: (failure) =>
      new JoseToolError(failure === "timeout" ? "timeout" : "worker_failed"),
    timeoutMs: 30000,
    signal,
  });
}
