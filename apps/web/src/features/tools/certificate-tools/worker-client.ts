import { runWorkerTask, workerResult } from "@/lib/worker-task";
import {
  csrResultSchema,
  parseResultSchema,
  type CertificateJob,
  type CertificateResult,
} from "./jobs";
import { CertificateToolError } from "@workspace/tools/crypto/certificate-contract";
export function runCertificate(
  job: CertificateJob,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
): Promise<CertificateResult> {
  signal.throwIfAborted();
  return runWorkerTask(job, {
    create: createWorker,
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) => new CertificateToolError(code ?? "worker_failed"),
      );
      const parsed = (
        job.mode === "generate" ? csrResultSchema : parseResultSchema
      ).safeParse(result);
      if (!parsed.success) throw new CertificateToolError("worker_failed");
      return parsed.data;
    },
    error: (failure) =>
      new CertificateToolError(
        failure === "timeout" ? "timeout" : "worker_failed",
      ),
    timeoutMs: 120000,
    signal,
  });
}
