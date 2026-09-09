import {
  ArgonError,
  type ArgonJob,
  executeArgon,
} from "@workspace/tools/crypto/argon2";

self.onmessage = (event: MessageEvent<ArgonJob>) => {
  try {
    self.postMessage({ result: executeArgon(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof ArgonError ? error.code : "worker_failed",
    });
  }
};
