import { workerTaskHandler } from "@/lib/worker-task";
import { generateCsr } from "@workspace/tools/crypto/certificate";
import type { CsrJob } from "../certificate-tools/jobs";
import { CertificateToolError } from "@workspace/tools/crypto/certificate-contract";

self.onmessage = workerTaskHandler(
  {
    run: (job: CsrJob) => generateCsr(job.options),
    error: (error) =>
      error instanceof CertificateToolError ? error.code : "operation_failed",
  },
  (message) => self.postMessage(message),
);
