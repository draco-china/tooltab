import { workerTaskHandler } from "@/lib/worker-task";
import { convertDocker } from "@workspace/tools/project/docker";

const parser = import("./curl-wasm-parser");
self.onmessage = workerTaskHandler(
  {
    run: async (input: string) => convertDocker(input, (await parser).default),
    error: (error) =>
      error instanceof Error ? error.message : "conversion_failed",
  },
  (message) => self.postMessage(message),
);
