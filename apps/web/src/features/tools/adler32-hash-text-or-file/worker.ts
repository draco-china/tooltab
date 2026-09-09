import {
  type Adler32State,
  createAdler32State,
  formatAdler32,
  updateAdler32,
} from "@workspace/tools/checksum/adler32";
import { MAX_BYTES } from "@workspace/tools/hash/input";

let state: Adler32State | undefined;

self.onmessage = (event: MessageEvent) => {
  try {
    const payload = event.data;
    if (payload.kind === "init") {
      state = createAdler32State();
    } else if (payload.kind === "chunk") {
      if (!state || !(payload.chunk instanceof Uint8Array)) {
        throw new Error("invalid_input");
      }
      state = updateAdler32(state, payload.chunk);
      if (state.bytes > MAX_BYTES) throw new Error("too_large");
    } else if (payload.kind === "end") {
      if (!state) throw new Error("invalid_input");
      const result = formatAdler32(state);
      state = undefined;
      self.postMessage({ result });
      return;
    } else {
      throw new Error("invalid_input");
    }
    self.postMessage({ ready: true });
  } catch (error) {
    state = undefined;
    self.postMessage({
      error: error instanceof Error ? error.message : "worker_failed",
    });
  }
};
