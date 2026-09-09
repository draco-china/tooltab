import { createWorkerSession } from "@/lib/worker-task";
import { CHUNK_BYTES, MAX_BYTES } from "@workspace/tools/hash/input";
import {
  type HashResult,
  Ripemd160HashError,
} from "@workspace/tools/hash/ripemd160";

/** Backpressure keeps a single bounded chunk in flight while hashing files. */
export async function runRipemd160Hash(
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
  createWorker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
): Promise<HashResult> {
  signal.throwIfAborted();
  const session = createWorkerSession<object, { result?: HashResult }>({
    create: createWorker,
    parse(data) {
      if (!data || typeof data !== "object")
        throw new Ripemd160HashError("worker_failed");
      if ("error" in data)
        throw new Ripemd160HashError(
          data.error === "too_large" ? "too_large" : "worker_failed",
        );
      if ("result" in data) return { result: data.result as HashResult };
      if ("ready" in data && data.ready === true) return {};
      throw new Ripemd160HashError("worker_failed");
    },
    error: (failure) =>
      new Ripemd160HashError(
        failure === "timeout" ? "timeout" : "worker_failed",
      ),
    timeoutMs: 30000,
    signal,
  });
  let bytes = 0;
  try {
    await session.send({ kind: "init" });
    for await (const chunk of source) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new Ripemd160HashError("too_large");
      for (let offset = 0; offset < chunk.length; offset += CHUNK_BYTES)
        await session.send({
          kind: "chunk",
          chunk: chunk.slice(offset, offset + CHUNK_BYTES),
        });
    }
    signal.throwIfAborted();
    const result = (await session.send({ kind: "end" })).result;
    if (!result) throw new Ripemd160HashError("worker_failed");
    return result;
  } finally {
    session.close();
  }
}
