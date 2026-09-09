import { formatDigest } from "@workspace/tools/hash/format";
import { createRIPEMD160 } from "@workspace/tools/hash/ripemd160";
import { MAX_BYTES } from "@workspace/tools/hash/input";

let hasher: Awaited<ReturnType<typeof createRIPEMD160>> | undefined;
let bytes = 0;

self.onmessage = async (event) => {
  try {
    const payload = event.data;
    if (payload.kind === "init") {
      hasher = undefined;
      bytes = 0;
      hasher = await createRIPEMD160();
    } else if (payload.kind === "chunk") {
      if (!hasher || !(payload.chunk instanceof Uint8Array)) {
        throw new Error("invalid_input");
      }
      bytes += payload.chunk.byteLength;
      if (bytes > MAX_BYTES) throw new Error("too_large");
      hasher.update(payload.chunk);
    } else if (payload.kind === "end") {
      if (!hasher) throw new Error("invalid_input");
      const result = formatDigest("RIPEMD-160", bytes, hasher.digest("binary"));
      hasher = undefined;
      bytes = 0;
      self.postMessage({ result });
      return;
    } else {
      throw new Error("invalid_input");
    }
    self.postMessage({ ready: true });
  } catch (error) {
    hasher = undefined;
    bytes = 0;
    self.postMessage({
      error: error instanceof Error ? error.message : "worker_failed",
    });
  }
};
