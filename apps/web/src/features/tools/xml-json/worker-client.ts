import { runWorkerTask } from "@/lib/worker-task";
import {
  MAX_XML_INPUT,
  XmlJsonError,
  type XmlJsonJob,
} from "@workspace/tools/encoding/xml-json";

type Result = { output: string; bytes: number };
type Reply = {
  result?: Result;
  error?: { code: XmlJsonError["code"]; line?: number; column?: number };
};

let active = 0;
export function runXmlJsonWorker(
  job: XmlJsonJob,
  signal?: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
) {
  signal?.throwIfAborted();
  if (job.input.length > MAX_XML_INPUT) throw new XmlJsonError("too_large");
  if (typeof Worker !== "function") throw new XmlJsonError("unsupported");
  if (active >= 1) throw new XmlJsonError("busy");
  const snapshot = structuredClone(job);
  return runWorkerTask(snapshot, {
    create: () => {
      const worker = createWorker();
      active++;
      const terminate = worker.terminate.bind(worker);
      worker.terminate = () => {
        active--;
        terminate();
      };
      return worker;
    },
    parse: (data) => {
      if (!data || typeof data !== "object")
        throw new XmlJsonError("invalid_input");
      const reply = data as Reply;
      if (reply.error) {
        const { code, line, column } = reply.error;
        throw new XmlJsonError(code, line, column);
      }
      if (!reply.result) throw new XmlJsonError("invalid_input");
      return reply.result;
    },
    error: (failure) =>
      new XmlJsonError(
        failure === "create"
          ? "unsupported"
          : failure === "timeout"
            ? "timeout"
            : "invalid_input",
      ),
    timeoutMs: 30000,
    signal,
  });
}
