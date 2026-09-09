import { blobChunks as coreBlobChunks } from "@workspace/tools/hash/browser";
import {
  StreamHashError,
  textBytes as coreTextBytes,
} from "@workspace/tools/hash/input";
import { Ripemd160HashError } from "@workspace/tools/hash/ripemd160";

export function textBytes(text: string) {
  try {
    return coreTextBytes(text);
  } catch (error) {
    if (error instanceof StreamHashError) {
      const code = error.code === "busy" ? "worker_failed" : error.code;
      throw new Ripemd160HashError(code);
    }
    throw error;
  }
}

export async function* blobChunks(blob: Blob, signal: AbortSignal) {
  try {
    yield* coreBlobChunks(blob, signal);
  } catch (error) {
    if (signal.aborted && error === signal.reason) throw error;
    if (error instanceof StreamHashError) {
      const code = error.code === "busy" ? "worker_failed" : error.code;
      throw new Ripemd160HashError(code);
    }
    throw error;
  }
}
