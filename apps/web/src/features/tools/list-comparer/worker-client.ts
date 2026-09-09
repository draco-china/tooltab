import { runWorkerTask } from "@/lib/worker-task";
import {
  type ListComparison,
  type ListOptions,
  ListSlugError,
} from "@workspace/tools/text/lists";
export type ListSlugJob =
  | { kind: "list"; left: string; right: string; options: ListOptions }
  | {
      kind: "slug";
      input: string;
      separator: "-" | "_" | ".";
      caseMode: "lower" | "preserve";
    };
export function runListSlug(
  job: ListSlugJob,
  signal: AbortSignal,
): Promise<ListComparison | string> {
  signal.throwIfAborted();
  if (typeof Worker !== "function") throw new ListSlugError("unsupported");
  return runWorkerTask(job, {
    create: () =>
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
    parse: (data) => {
      if (typeof data === "string") return data;
      if (!data || typeof data !== "object")
        throw new ListSlugError("unsupported");
      if ("error" in data)
        throw new ListSlugError(data.error as ListSlugError["code"]);
      return data as ListComparison;
    },
    error: () => new ListSlugError("unsupported"),
    timeoutMs: 30000,
    signal,
  });
}
