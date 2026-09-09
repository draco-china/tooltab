import { executeSsh } from "./jobs";
import { SshError } from "@workspace/tools/crypto/ssh";

self.onmessage = async (event) => {
  try {
    self.postMessage({ result: await executeSsh(event.data) });
  } catch (e) {
    self.postMessage({
      error: e instanceof SshError ? e.code : "operation_failed",
    });
  }
};
