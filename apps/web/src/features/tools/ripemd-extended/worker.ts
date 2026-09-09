import {
  createRipemd,
  type RipemdAlgorithm,
} from "@workspace/tools/hash/ripemd";
import { MAX_BYTES } from "@workspace/tools/hash/input";
import { formatDigest } from "@workspace/tools/hash/format";

let hasher: ReturnType<typeof createRipemd> | undefined;
let algorithm: RipemdAlgorithm;
let bytes = 0;

self.onmessage = (event) => {
  try {
    const payload = event.data;
    if (payload.kind === "init") {
      hasher = undefined;
      bytes = 0;
      algorithm = payload.algorithm;
      hasher = createRipemd(algorithm);
    } else if (payload.kind === "chunk") {
      if (!hasher || !(payload.chunk instanceof Uint8Array))
        throw new Error("invalid_input");
      bytes += payload.chunk.byteLength;
      if (bytes > MAX_BYTES) throw new Error("too_large");
      hasher.update(payload.chunk);
    } else if (payload.kind === "end") {
      if (!hasher) throw new Error("invalid_input");
      const result = formatDigest(algorithm, bytes, hasher.digest("binary"));
      hasher = undefined;
      bytes = 0;
      self.postMessage({ result });
      return;
    } else throw new Error("invalid_input");
    self.postMessage({ ready: true });
  } catch (error) {
    hasher = undefined;
    bytes = 0;
    self.postMessage({
      error: error instanceof Error ? error.message : "worker_failed",
    });
  }
};
