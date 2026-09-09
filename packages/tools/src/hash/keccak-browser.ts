import { MAX_HASH_FILE_BYTES } from "./sha-input";

export const KECCAK_OUTPUT_LENGTHS = [224, 256, 384, 512] as const;
export type KeccakOutputLength = (typeof KECCAK_OUTPUT_LENGTHS)[number];
export type KeccakJob =
  | { source: "text"; bytes: Uint8Array<ArrayBuffer>; outputBits: number }
  | { source: "file"; file: File; outputBits: number };
export type KeccakErrorCode =
  | "too-large"
  | "read-failed"
  | "unsupported"
  | "invalid-length"
  | "digest-failed"
  | "timeout";

export class KeccakPageError extends Error {
  constructor(public readonly code: KeccakErrorCode) {
    super(code);
    this.name = "KeccakPageError";
  }
}

export async function hashKeccakSource(job: KeccakJob) {
  if (!KECCAK_OUTPUT_LENGTHS.includes(job.outputBits as KeccakOutputLength))
    throw new KeccakPageError("invalid-length");
  if (job.source === "file" && job.file.size > MAX_HASH_FILE_BYTES)
    throw new KeccakPageError("too-large");

  let hasher:
    | {
        update(data: Uint8Array): unknown;
        digest(): Uint8Array;
        destroy(): void;
      }
    | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const { keccak_224, keccak_256, keccak_384, keccak_512 } = await import(
      "@noble/hashes/sha3.js"
    );
    hasher = (
      job.outputBits === 224
        ? keccak_224
        : job.outputBits === 256
          ? keccak_256
          : job.outputBits === 384
            ? keccak_384
            : keccak_512
    ).create();
    if (job.source === "text") {
      hasher.update(job.bytes);
      job.bytes.fill(0);
    } else {
      reader = job.file.stream().getReader();
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_HASH_FILE_BYTES) throw new KeccakPageError("too-large");
        hasher.update(value);
        value.fill(0);
      }
    }
    return new Uint8Array(hasher.digest());
  } catch (error) {
    if (error instanceof KeccakPageError) throw error;
    throw new KeccakPageError(
      job.source === "file" ? "read-failed" : "digest-failed",
    );
  } finally {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // An errored stream may reject cancellation; retain the original error.
      } finally {
        reader.releaseLock();
      }
    }
    hasher?.destroy();
    if (job.source === "text" && job.bytes.byteLength) job.bytes.fill(0);
  }
}
