import {
  CHUNK_BYTES,
  MAX_BYTES,
  StreamHashError,
} from "@workspace/tools/hash/input";
import type { HashFormat } from "@workspace/tools/hash/format";
import { createWorkerSession } from "@/lib/worker-task";

export type HashResult = Record<HashFormat, string>;

export async function runWhirlpoolHash(
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
): Promise<HashResult> {
  signal.throwIfAborted();
  const session = createWorkerSession<
    object,
    { ready?: true; result?: HashResult }
  >({
    create: () =>
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
    signal,
    timeoutMs: 30000,
    error: (failure) =>
      new StreamHashError(failure === "timeout" ? "timeout" : "worker_failed"),
    parse(data) {
      if (!data || typeof data !== "object")
        throw new StreamHashError("worker_failed");
      if ("error" in data)
        throw new StreamHashError(
          data.error === "too_large" ? "too_large" : "worker_failed",
        );
      if ("ready" in data && data.ready === true) return { ready: true };
      const result = "result" in data ? data.result : undefined;
      if (
        result &&
        typeof result === "object" &&
        ["hex", "base64", "decimal", "binary"].every(
          (key) =>
            key in result &&
            typeof (result as Record<string, unknown>)[key] === "string",
        )
      )
        return { result: result as HashResult };
      throw new StreamHashError("worker_failed");
    },
  });
  let bytes = 0;
  async function ready(data: object) {
    if (!(await session.send(data)).ready)
      throw new StreamHashError("worker_failed");
  }
  try {
    await ready({ kind: "init" });
    for await (const chunk of source) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new StreamHashError("too_large");
      for (let offset = 0; offset < chunk.length; offset += CHUNK_BYTES)
        await ready({
          kind: "chunk",
          chunk: chunk.slice(offset, offset + CHUNK_BYTES),
        });
    }
    const result = (await session.send({ kind: "end" })).result;
    if (!result) throw new StreamHashError("worker_failed");
    return result;
  } finally {
    session.close();
  }
}
