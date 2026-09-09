import { JoseToolError } from "@workspace/tools/crypto/jose-common";
import { executeJose } from "./jobs";

self.onmessage = async (event) => {
  try {
    self.postMessage({ result: await executeJose(event.data) });
  } catch (e) {
    self.postMessage({
      error: e instanceof JoseToolError ? e.code : "operation_failed",
    });
  }
};
