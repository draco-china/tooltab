import { createWorkerSession } from "@/lib/worker-task";
import type { CrcResult } from "@workspace/tools/checksum/crc";
import { CHUNK_BYTES, MAX_BYTES, StreamHashError } from "./stream";
export type CrcOutput = { bytes: number; results: CrcResult[] };

export async function runCrcStream(
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
  progress?: (bytes: number) => void,
  createWorker?: () => Worker,
): Promise<CrcOutput> {
  signal.throwIfAborted();
  const session = createWorkerSession<object, { result?: CrcOutput }>({
    create: () =>
      createWorker
        ? createWorker()
        : new Worker(new URL("./worker.ts", import.meta.url), {
            type: "module",
          }),
    parse: (data) => {
      if (!data || typeof data !== "object")
        throw new StreamHashError("worker_failed");
      if ("error" in data)
        throw new StreamHashError(
          data.error === "too_large" ? "too_large" : "worker_failed",
        );
      if ("result" in data) return { result: data.result as CrcOutput };
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
    await session.send({ kind: "init" });
    for await (const chunk of source) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new StreamHashError("too_large");
      for (let offset = 0; offset < chunk.length; offset += CHUNK_BYTES)
        await session.send({
          kind: "chunk",
          chunk: chunk.slice(offset, offset + CHUNK_BYTES),
        });
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
