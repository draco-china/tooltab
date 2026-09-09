import { workerTaskHandler } from "@/lib/worker-task";
import { executeMarkdown } from "./logic";
import { MarkdownError } from "@workspace/tools/text/markdown-contract";
import type { MarkdownJob } from "./types";

self.onmessage = workerTaskHandler(
  {
    run: (job: MarkdownJob) => executeMarkdown(job),
    error: (cause) => ({
      code: cause instanceof MarkdownError ? cause.code : "invalid_input",
    }),
  },
  (message) => self.postMessage(message),
);
