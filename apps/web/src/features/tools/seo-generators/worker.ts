import hljs from "highlight.js/lib/core";
import xml from "highlight.js/lib/languages/xml";
import { workerTaskHandler } from "@/lib/worker-task";
import { executeSeo } from "@workspace/tools/project/seo";
import { SeoError, type SeoJob } from "@workspace/tools/project/seo";

hljs.registerLanguage("xml", xml);

self.onmessage = workerTaskHandler(
  {
    run: (job: SeoJob) => {
      const result = executeSeo(job);
      if (job.kind === "sitemap")
        return {
          ...result,
          highlighted: hljs.highlight(result.output.slice(0, 100000), {
            language: "xml",
            ignoreIllegals: true,
          }).value,
        };
      return result;
    },
    error: (cause) => ({
      code: cause instanceof SeoError ? cause.code : "invalid_input",
      index: cause instanceof SeoError ? cause.index : undefined,
    }),
  },
  (message) => self.postMessage(message),
);
