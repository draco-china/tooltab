import {
  compareLists,
  generateSlug,
  ListSlugError,
} from "@workspace/tools/text/lists";
import type { ListSlugJob } from "./worker-client";

self.onmessage = (event: MessageEvent<ListSlugJob>) => {
  try {
    const job = event.data;
    self.postMessage(
      job.kind === "list"
        ? compareLists(job.left, job.right, job.options)
        : generateSlug(job.input, job.separator, job.caseMode),
    );
  } catch (e) {
    self.postMessage({
      error: e instanceof ListSlugError ? e.code : "invalid_options",
    });
  }
};
