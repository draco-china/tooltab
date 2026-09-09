import { createRIPEMD160 } from "hash-wasm";
import { validateHashByteLength } from "./input";
import { formatDigest, type DigestResult } from "./format";

export class Ripemd160HashError extends Error {
  constructor(
    public code:
      | "invalid_input"
      | "too_large"
      | "worker_failed"
      | "read_failed"
      | "timeout",
  ) {
    super(code);
    this.name = "Ripemd160HashError";
  }
}

export type HashResult = DigestResult<"RIPEMD-160">;

export async function hashRipemd160Source(
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
): Promise<HashResult> {
  signal.throwIfAborted();
  const hasher = await createRIPEMD160();
  signal.throwIfAborted();
  let bytes = 0;
  for await (const chunk of source) {
    signal.throwIfAborted();
    bytes = validateHashByteLength(bytes + chunk.length, Ripemd160HashError);
    hasher.update(chunk);
  }
  signal.throwIfAborted();
  return formatDigest("RIPEMD-160", bytes, hasher.digest("binary"));
}

// Keep the fixed-algorithm Worker separate from other RIPEMD implementations.
export { createRIPEMD160 };
