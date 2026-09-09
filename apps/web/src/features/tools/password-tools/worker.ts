import { type PasswordJob, PasswordToolError, runPasswordJob } from "./logic";

self.onmessage = async (event: MessageEvent<PasswordJob>) => {
  try {
    self.postMessage({ result: await runPasswordJob(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof PasswordToolError ? error.code : "invalid_input",
    });
  }
};
