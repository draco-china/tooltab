import { AesToolError } from "@workspace/tools/crypto/aes";
import { type AesJob, runAesJob } from "./jobs";

self.onmessage = async (event: MessageEvent<AesJob>) => {
  try {
    const result = await runAesJob(event.data);
    if (result.kind === "decrypted")
      self.postMessage({ result }, { transfer: [result.bytes.buffer] });
    else self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: error instanceof AesToolError ? error.code : "invalid_input",
    });
  }
};
