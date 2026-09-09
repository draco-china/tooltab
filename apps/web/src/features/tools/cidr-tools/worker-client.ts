import { runWorkerTask } from "@/lib/worker-task";
import { CidrError } from "@workspace/tools/network/cidr";
export type MergeOutput = {
  summary: {
    mergeInputCount: number;
    excludeInputCount: number;
    familyLabels: string[];
    addressCount: string;
    blockCount: number;
  };
  preview: string;
  blob: Blob;
};
export function runMerge(
  { merge, exclude }: { merge: string; exclude: string },
  signal: AbortSignal,
): Promise<MergeOutput> {
  signal.throwIfAborted();
  if (typeof Worker !== "function") throw new CidrError("unsupported");
  return runWorkerTask(
    { merge, exclude },
    {
      create: () =>
        new Worker(new URL("./worker.ts", import.meta.url), {
          type: "module",
        }),
      parse: (data) => {
        if (!data || typeof data !== "object")
          throw new CidrError("unsupported");
        const reply = data as MergeOutput & {
          error?: CidrError["code"];
          issues?: CidrError["issues"];
        };
        if (reply.error) throw new CidrError(reply.error, reply.issues);
        if (
          !reply.summary ||
          typeof reply.preview !== "string" ||
          !(reply.blob instanceof Blob)
        )
          throw new CidrError("unsupported");
        return reply;
      },
      error: () => new CidrError("unsupported"),
      timeoutMs: 120000,
      signal,
    },
  );
}
