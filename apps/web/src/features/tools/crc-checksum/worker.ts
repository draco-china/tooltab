import { createCrcEngine } from "@workspace/tools/checksum/crc";
import { MAX_BYTES } from "./stream";

let engine: ReturnType<typeof createCrcEngine> | undefined;
let bytes = 0;
self.onmessage = (event) => {
  try {
    const p = event.data;
    if (p.kind === "init") {
      engine = createCrcEngine();
      bytes = 0;
    } else if (p.kind === "chunk") {
      if (!engine || !(p.chunk instanceof Uint8Array))
        throw Error("invalid_input");
      bytes += p.chunk.length;
      if (bytes > MAX_BYTES) throw Error("too_large");
      engine.update(p.chunk);
    } else if (p.kind === "end") {
      if (!engine) throw Error("invalid_input");
      self.postMessage({ result: { bytes, results: engine.results() } });
      return;
    } else throw Error("invalid_input");
    self.postMessage({ ready: true });
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "worker_failed",
    });
  }
};
