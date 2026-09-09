import {
  generateCsr,
  parseCertificates,
} from "@workspace/tools/crypto/certificate";
import type { CertificateJob } from "./jobs";
import { CertificateToolError } from "@workspace/tools/crypto/certificate-contract";

self.onmessage = async (event: MessageEvent<CertificateJob>) => {
  try {
    const p = event.data;
    self.postMessage({
      result:
        p.mode === "generate"
          ? await generateCsr(p.options)
          : await parseCertificates(p.input),
    });
  } catch (e) {
    self.postMessage({
      error: e instanceof CertificateToolError ? e.code : "operation_failed",
    });
  }
};
