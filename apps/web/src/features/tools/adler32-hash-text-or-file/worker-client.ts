import { createWorkerSession } from "@/lib/worker-task";
import type { Adler32Result } from "@workspace/tools/checksum/adler32";
import { Adler32Error } from "./logic";
import { CHUNK_BYTES, MAX_BYTES } from "@workspace/tools/hash/input";

export async function runAdler32Worker(
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
): Promise<Adler32Result> {
  signal.throwIfAborted();
  const session = createWorkerSession<object, { result?: Adler32Result }>({
    create: createWorker,
    signal,
    timeoutMs: 30_000,
    parse: (data) => {
      if (!data || typeof data !== "object")
        throw new Adler32Error("worker_failed");
      if ("error" in data)
        throw new Adler32Error(
          data.error === "too_large" ? "too_large" : "worker_failed",
        );
      if ("result" in data) return { result: data.result as Adler32Result };
      if ("ready" in data && data.ready === true) return {};
      throw new Adler32Error("worker_failed");
    },
    error: (failure) =>
      new Adler32Error(failure === "timeout" ? "timeout" : "worker_failed"),
  });

  let bytes = 0;
  try {
    await session.send({ kind: "init" });
    for await (const chunk of source) {
      signal.throwIfAborted();
      bytes += chunk.byteLength;
      if (bytes > MAX_BYTES) throw new Adler32Error("too_large");
      for (let offset = 0; offset < chunk.length; offset += CHUNK_BYTES) {
        await session.send({
          kind: "chunk",
          chunk: chunk.slice(offset, offset + CHUNK_BYTES),
        });
      }
    }
    signal.throwIfAborted();
    const result = (await session.send({ kind: "end" })).result;
    if (!result) throw new Adler32Error("worker_failed");
    return result;
  } finally {
    session.close();
  }
}
