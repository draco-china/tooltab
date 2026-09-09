import { createWorkerSession } from "@/lib/worker-task";
import type { DigestResult } from "@workspace/tools/hash/format";
import type { RipemdAlgorithm } from "@workspace/tools/hash/ripemd";
import {
  CHUNK_BYTES,
  MAX_BYTES,
  StreamHashError,
} from "@workspace/tools/hash/input";

export async function runStreamHash(
  algorithm: RipemdAlgorithm,
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
  createWorker?: () => Worker,
): Promise<DigestResult<RipemdAlgorithm>> {
  signal.throwIfAborted();
  const session = createWorkerSession<
    object,
    { result?: DigestResult<RipemdAlgorithm> }
  >({
    create:
      createWorker ??
      (() =>
        new Worker(new URL("./worker.ts", import.meta.url), {
          type: "module",
        })),
    parse(data) {
      if (!data || typeof data !== "object")
        throw new StreamHashError("worker_failed");
      if ("error" in data && data.error)
        throw new StreamHashError(
          data.error === "too_large" ? "too_large" : "worker_failed",
        );
      return data as { result?: DigestResult<RipemdAlgorithm> };
    },
    error: (failure) =>
      new StreamHashError(failure === "timeout" ? "timeout" : "worker_failed"),
    timeoutMs: 30000,
    signal,
  });
  const { send } = session;
  let bytes = 0;
  try {
    await send({ kind: "init", algorithm });
    for await (const chunk of source) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new StreamHashError("too_large");
      for (let offset = 0; offset < chunk.length; offset += CHUNK_BYTES)
        await send({
          kind: "chunk",
          chunk: chunk.slice(offset, offset + CHUNK_BYTES),
        });
    }
    signal.throwIfAborted();
    const result = (await send({ kind: "end" })).result;
    if (!result) throw new StreamHashError("worker_failed");
    return result;
  } finally {
    session.close();
  }
}
