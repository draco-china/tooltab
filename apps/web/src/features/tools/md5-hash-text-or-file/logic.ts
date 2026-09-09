import { Md5HashError } from "@workspace/tools/hash/md5";
import {
  StreamHashError,
  textBytes as encodeText,
} from "@workspace/tools/hash/input";
import { blobChunks as readBlob } from "@workspace/tools/hash/browser";

export function textBytes(text: string) {
  try {
    return encodeText(text);
  } catch (error) {
    if (error instanceof StreamHashError)
      throw new Md5HashError(
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
      throw new Md5HashError(
        error.code === "busy" ? "worker_failed" : error.code,
      );
    throw error;
  }
}
