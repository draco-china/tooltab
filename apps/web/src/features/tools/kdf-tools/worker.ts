import { executeKdf, KdfError, type KdfJob } from "@workspace/tools/crypto/kdf";

self.onmessage = async (event: MessageEvent<KdfJob>) => {
  try {
    self.postMessage({ result: await executeKdf(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof KdfError ? error.code : "worker_failed",
    });
  }
};
