import { createWorkerSession } from "@/lib/worker-task";
import {
  CHUNK_BYTES,
  MAX_BYTES,
  StreamHashError,
} from "@workspace/tools/hash/input";
import {
  type Algorithm,
  type HashResult,
  MURMUR_128_ALGORITHMS,
} from "./streaming-logic";

export async function runStreamHash(
  algorithm: Algorithm,
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
  progress?: (bytes: number) => void,
  seed = 0n,
): Promise<HashResult> {
  signal.throwIfAborted();
  if (!MURMUR_128_ALGORITHMS.includes(algorithm)) {
    throw new StreamHashError("invalid_input");
  }
  const session = createWorkerSession<object, { result?: HashResult }>({
    create: () =>
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
    parse: (data) => {
      if (!data || typeof data !== "object")
        throw new StreamHashError("worker_failed");
      if ("error" in data)
        throw new StreamHashError(
          data.error === "too_large"
            ? "too_large"
            : data.error === "invalid_input"
              ? "invalid_input"
              : "worker_failed",
        );
      if ("result" in data) return { result: data.result as HashResult };
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
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new StreamHashError("too_large");
      for (let index = 0; index < chunk.length; index += CHUNK_BYTES) {
        await session.send({
          kind: "chunk",
          chunk: chunk.slice(index, index + CHUNK_BYTES),
        });
      }
      progress?.(bytes);
    }
    signal.throwIfAborted();
    const result = (await session.send({ kind: "end" })).result;
    if (!result) throw new StreamHashError("worker_failed");
    return result;
  } finally {
    session.close();
  }
}
