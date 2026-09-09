import { workerTaskHandler } from "@/lib/worker-task";
import { generateOpenapi } from "@workspace/tools/project/openapi";
import {
  type OpenapiJob,
  ProjectConfigError,
} from "@workspace/tools/project/openapi-contract";

self.onmessage = workerTaskHandler(
  {
    run: (job: OpenapiJob) => generateOpenapi(job.input, job.options),
    error: (cause) => ({
      code:
        cause instanceof ProjectConfigError ? cause.code : "generation_failed",
      refs: cause instanceof ProjectConfigError ? cause.refs : [],
    }),
  },
  (message) => self.postMessage(message),
);
