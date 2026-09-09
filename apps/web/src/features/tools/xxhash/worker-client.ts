import type { XxAlgorithm as Algorithm } from "@workspace/tools/hash/xxhash";
import type { DigestResult } from "@workspace/tools/hash/format";
import { createWorkerSession } from "@/lib/worker-task";
import {
  CHUNK_BYTES,
  MAX_BYTES,
  StreamHashError,
} from "@workspace/tools/hash/input";

export async function runStreamHash(
  algorithm: Algorithm,
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
  progress?: (bytes: number) => void,
  seed = 0n,
  _hashKey?: Uint8Array | null,
): Promise<DigestResult<Algorithm>> {
  signal.throwIfAborted();
  const session = createWorkerSession<
    object,
    { result?: DigestResult<Algorithm> }
  >({
    create: () =>
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
    parse: (data) => {
      if (!data || typeof data !== "object")
        throw new StreamHashError("worker_failed");
      if ("error" in data)
        throw new StreamHashError(
          data.error === "too_large" ? "too_large" : "worker_failed",
        );
      if ("result" in data)
        return { result: data.result as DigestResult<Algorithm> };
      if ("ready" in data && data.ready === true) return {};
      throw new StreamHashError("worker_failed");
    },
    error: (failure) =>
      new StreamHashError(failure === "timeout" ? "timeout" : "worker_failed"),
    timeoutMs: 30000,
    signal,
  });
  let bytes = 0;
  try {
    await session.send({ kind: "init", algorithm, seed });
    for await (const chunk of source) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new StreamHashError("too_large");
      for (let offset = 0; offset < chunk.length; offset += CHUNK_BYTES)
        await session.send({
          kind: "chunk",
          chunk: chunk.slice(offset, offset + CHUNK_BYTES),
        });
      progress?.(bytes);
    }
    const result = (await session.send({ kind: "end" })).result;
    if (!result) throw new StreamHashError("worker_failed");
    return result;
  } finally {
    session.close();
  }
}
