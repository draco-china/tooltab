import { workerTaskHandler } from "@/lib/worker-task";
import {
  type CurlOptions,
  CurlToolError,
} from "@workspace/tools/network/curl-contract";

// Install the listener before the standard parser's async WASM initialization.
// Module Worker messages can arrive while a dependency is awaiting WASM load.
const core = import("./core");
self.onmessage = workerTaskHandler(
  {
    run: async (input: CurlOptions) => (await core).convertCurl(input),
    error: (cause) =>
      cause instanceof CurlToolError ? cause.code : "conversion_failed",
  },
  (message) => self.postMessage(message),
);
