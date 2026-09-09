import { workerTaskHandler } from "@/lib/worker-task";
import { convertDocker } from "@workspace/tools/project/docker";

// Register immediately, before the standard parser awaits its local WASM assets.
const parser = import("curlconverter/dist/src/shell/webParser.js");
self.onmessage = workerTaskHandler(
  {
    run: async (input: string) => convertDocker(input, (await parser).default),
    error: (error) =>
      error instanceof Error ? error.message : "conversion_failed",
  },
  (message) => self.postMessage(message),
);
