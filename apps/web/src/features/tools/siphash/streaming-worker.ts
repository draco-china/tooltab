import { formatDigest } from "@workspace/tools/hash/format";
import { MAX_BYTES } from "@workspace/tools/hash/input";
import { type Algorithm, createHasher } from "./streaming-logic";

let hasher: Awaited<ReturnType<typeof createHasher>> | undefined;
let algorithm: Algorithm;
let bytes = 0;
self.onmessage = async (event) => {
  try {
    const p = event.data;
    if (p.kind === "init") {
      hasher = undefined;
      bytes = 0;
      algorithm = p.algorithm;
      hasher = await createHasher(algorithm, p.key);
    } else if (p.kind === "chunk") {
      if (!hasher || !(p.chunk instanceof Uint8Array))
        throw new Error("invalid_input");
      bytes += p.chunk.byteLength;
      if (bytes > MAX_BYTES) throw new Error("too_large");
      hasher.update(p.chunk);
    } else if (p.kind === "end") {
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
