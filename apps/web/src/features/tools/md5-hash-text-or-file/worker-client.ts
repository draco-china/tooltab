import { createWorkerSession } from "@/lib/worker-task";
import { type HashResult, Md5HashError } from "@workspace/tools/hash/md5";
import { CHUNK_BYTES, MAX_BYTES } from "@workspace/tools/hash/input";

/** Backpressure keeps a single bounded chunk in flight while hashing files. */
export async function runMd5Hash(
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
): Promise<HashResult> {
  signal.throwIfAborted();
  const session = createWorkerSession<object, { result?: HashResult }>({
    create: createWorker,
    parse: (data) => {
      if (!data || typeof data !== "object")
        throw new Md5HashError("worker_failed");
      if ("error" in data)
        throw new Md5HashError(
          data.error === "too_large" ? "too_large" : "worker_failed",
        );
      if ("result" in data) return { result: data.result as HashResult };
      if ("ready" in data && data.ready === true) return {};
      throw new Md5HashError("worker_failed");
    },
    error: (failure) =>
      new Md5HashError(failure === "timeout" ? "timeout" : "worker_failed"),
    timeoutMs: 30000,
    signal,
  });

  let bytes = 0;
  try {
    await session.send({ kind: "init" });
    for await (const chunk of source) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new Md5HashError("too_large");
      for (let offset = 0; offset < chunk.length; offset += CHUNK_BYTES) {
        await session.send({
          kind: "chunk",
          chunk: chunk.slice(offset, offset + CHUNK_BYTES),
        });
      }
    }
    signal.throwIfAborted();
    const result = (await session.send({ kind: "end" })).result;
    if (!result) throw new Md5HashError("worker_failed");
    return result;
  } finally {
    session.close();
  }
}
