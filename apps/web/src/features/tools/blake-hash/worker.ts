import { BlakeHashError, hashBlakeBytes } from "@workspace/tools/hash/blake";
import type { BlakeWorkerJob } from "./worker-client";

self.onmessage = async (event: MessageEvent<BlakeWorkerJob>) => {
  try {
    const result = await hashBlakeBytes(
      event.data.algorithm,
      event.data.bytes,
      event.data.options,
    );
    self.postMessage({ result }, [result.buffer]);
  } catch (error) {
    self.postMessage({
      error: error instanceof BlakeHashError ? error.code : "digest-failed",
    });
  }
};
