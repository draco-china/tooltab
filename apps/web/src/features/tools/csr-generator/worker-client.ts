import { runWorkerTask, workerResult } from "@/lib/worker-task";
import { csrResultSchema, type CsrJob } from "../certificate-tools/jobs";
import type { CsrResult } from "@workspace/tools/crypto/certificate-contract";
import { CertificateToolError } from "@workspace/tools/crypto/certificate-contract";

export function runCsr(job: CsrJob, signal: AbortSignal): Promise<CsrResult> {
  signal.throwIfAborted();
  return runWorkerTask(job, {
    create: () =>
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
    parse: (data) => {
      const result = workerResult<unknown>(
        data,
        (code) => new CertificateToolError(code ?? "worker_failed"),
      );
      const parsed = csrResultSchema.safeParse(result);
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
