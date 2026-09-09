import { workerTaskHandler } from "@/lib/worker-task";
import { executeQuery } from "@workspace/tools/json/query";
import { QueryError, type QueryJob } from "@workspace/tools/json/value";

self.onmessage = workerTaskHandler(
  {
    run: (job: QueryJob) => executeQuery(job),
    error: (cause) => ({
      code: cause instanceof QueryError ? cause.code : "invalid_query",
    }),
  },
  (message) => self.postMessage(message),
);
