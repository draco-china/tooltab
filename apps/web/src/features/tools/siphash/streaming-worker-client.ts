import { createWorkerSession } from "@/lib/worker-task";
import {
  CHUNK_BYTES,
  MAX_BYTES,
  StreamHashError,
} from "@workspace/tools/hash/input";
import {
  type Algorithm,
  type HashResult,
  STREAM_ALGORITHMS,
} from "./streaming-logic";
/** Backpressure permits only one bounded chunk in flight. Source is never collected. */
export async function runStreamHash(
  algorithm: Algorithm,
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
  progress?: (bytes: number) => void,
  _seed = 0n,
  key?: Uint8Array,
  createWorker?: () => Worker,
): Promise<HashResult> {
  signal.throwIfAborted();
  if (!STREAM_ALGORITHMS.includes(algorithm))
    throw new StreamHashError("invalid_input");
  const session = createWorkerSession<object, { result?: HashResult }>({
    create:
      createWorker ??
      (() =>
        new Worker(new URL("./streaming-worker.ts", import.meta.url), {
          type: "module",
        })),
    parse(data) {
      if (!data || typeof data !== "object")
        throw new StreamHashError("worker_failed");
      if ("error" in data && data.error)
        throw new StreamHashError(
          data.error === "too_large" ? "too_large" : "worker_failed",
        );
      return data as { result?: HashResult };
    },
    error: (failure) =>
      new StreamHashError(failure === "timeout" ? "timeout" : "worker_failed"),
    timeoutMs: 30000,
    signal,
  });
  const { send } = session;
  let bytes = 0;
  try {
    await send({ kind: "init", algorithm, key });
    for await (const chunk of source) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new StreamHashError("too_large");
      for (let i = 0; i < chunk.length; i += CHUNK_BYTES)
        await send({
          kind: "chunk",
          chunk: chunk.slice(i, i + CHUNK_BYTES),
        });
      progress?.(bytes);
    }
    signal.throwIfAborted();
    const result = (await send({ kind: "end" })).result;
    if (!result) throw new StreamHashError("worker_failed");
    return result;
  } finally {
    session.close();
  }
}
