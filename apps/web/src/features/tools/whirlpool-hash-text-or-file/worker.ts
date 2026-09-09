import { createWhirlpool } from "@workspace/tools/hash/streaming";
import { formatHash } from "@workspace/tools/hash/format";
import { MAX_BYTES } from "@workspace/tools/hash/input";

let hasher: Awaited<ReturnType<typeof createWhirlpool>> | undefined;
let bytes = 0;
self.onmessage = async (event) => {
  try {
    const payload = event.data;
    if (payload.kind === "init") {
      hasher = await createWhirlpool();
      bytes = 0;
    } else if (payload.kind === "chunk") {
      if (!hasher || !(payload.chunk instanceof Uint8Array))
        throw new Error("invalid_input");
      bytes += payload.chunk.byteLength;
      if (bytes > MAX_BYTES) throw new Error("too_large");
      hasher.update(payload.chunk);
    } else if (payload.kind === "end") {
      if (!hasher) throw new Error("invalid_input");
      const digest = hasher.digest("binary");
      self.postMessage({
        result: {
          hex: formatHash(digest, "hex"),
          base64: formatHash(digest, "base64"),
          decimal: formatHash(digest, "decimal"),
          binary: formatHash(digest, "binary"),
        },
      });
      return;
    } else throw new Error("invalid_input");
    self.postMessage({ ready: true });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "worker_failed",
    });
  }
};
