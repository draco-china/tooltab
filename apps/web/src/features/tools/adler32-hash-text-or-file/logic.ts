import {
  StreamHashError,
  textBytes as encodeText,
} from "@workspace/tools/hash/input";
import { blobChunks as readBlob } from "@workspace/tools/hash/browser";

export class Adler32Error extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "too_large"
      | "worker_failed"
      | "read_failed"
      | "timeout",
  ) {
    super(code);
    this.name = "Adler32Error";
  }
}

export function textBytes(text: string): Uint8Array {
  try {
    return encodeText(text);
  } catch (error) {
    if (error instanceof StreamHashError)
      throw new Adler32Error(
        error.code === "busy" ? "worker_failed" : error.code,
      );
    throw error;
  }
}

export async function* blobChunks(blob: Blob, signal: AbortSignal) {
  try {
    yield* readBlob(blob, signal);
  } catch (error) {
    if (signal.aborted && error === signal.reason) throw error;
    if (error instanceof StreamHashError)
      throw new Adler32Error(
        error.code === "busy" ? "worker_failed" : error.code,
      );
    throw error;
  }
}
