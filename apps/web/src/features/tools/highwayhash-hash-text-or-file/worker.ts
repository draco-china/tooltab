import {
  createHighway,
  HIGHWAY_SIZES,
  type HighwaySize,
} from "@workspace/tools/hash/highway";
import { MAX_BYTES } from "@workspace/tools/hash/input";
import { formatHash } from "@workspace/tools/hash/format";

let hasher: Awaited<ReturnType<typeof createHighway>> | undefined;
let size: HighwaySize = 64;
let bytes = 0;
self.onmessage = async (event) => {
  try {
    const payload = event.data;
    if (payload.kind === "init") {
      const requested = HIGHWAY_SIZES.find(
        (value) => payload.algorithm === `HighwayHash-${value}`,
      );
      if (requested === undefined) throw new Error("invalid_input");
      size = requested;
      bytes = 0;
      hasher = await createHighway(size, payload.key);
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
          algorithm: `HighwayHash-${size}`,
          bytes,
          outputBits: size,
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
