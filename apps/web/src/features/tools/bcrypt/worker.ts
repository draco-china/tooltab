import {
  BcryptError,
  type BcryptJob,
  executeBcrypt,
} from "@workspace/tools/crypto/bcrypt";

self.onmessage = (event: MessageEvent<BcryptJob>) => {
  try {
    self.postMessage({ result: executeBcrypt(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof BcryptError ? error.code : "worker_failed",
    });
  }
};
