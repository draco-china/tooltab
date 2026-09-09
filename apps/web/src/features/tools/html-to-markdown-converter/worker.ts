import { executeMarkdown } from "./logic";
import { MarkdownError } from "@workspace/tools/text/markdown-contract";
import type { MarkdownJob } from "../markdown-tools/types";

self.onmessage = (event: MessageEvent<MarkdownJob>) => {
  try {
    self.postMessage({ result: executeMarkdown(event.data) });
  } catch (error) {
    self.postMessage({
      error: {
        code: error instanceof MarkdownError ? error.code : "invalid_input",
      },
    });
  }
};
