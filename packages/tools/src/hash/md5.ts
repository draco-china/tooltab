import { createMD5 } from "hash-wasm";
import { validateHashByteLength } from "./input";
import { formatDigest, type DigestResult } from "./format";

export class Md5HashError extends Error {
  constructor(
    public code:
      | "invalid_input"
      | "too_large"
      | "worker_failed"
      | "read_failed"
      | "timeout",
  ) {
    super(code);
    this.name = "Md5HashError";
  }
}

export type HashResult = DigestResult<"MD5">;

export async function hashMd5Source(
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
): Promise<HashResult> {
  signal.throwIfAborted();
  const hasher = await createMD5();
  signal.throwIfAborted();
  let bytes = 0;
  for await (const chunk of source) {
    signal.throwIfAborted();
    bytes = validateHashByteLength(bytes + chunk.length, Md5HashError);
    hasher.update(chunk);
  }
  signal.throwIfAborted();
  return formatDigest("MD5", bytes, hasher.digest("binary"));
}

// Fixed-algorithm Workers need no multi-algorithm dispatcher.
export { createMD5 };
