import { createCityHash } from "@workspace/tools/hash/city";
import { formatHash } from "@workspace/tools/hash/format";

let hasher: ReturnType<typeof createCityHash> | undefined;
let bytes = 0;
self.onmessage = (event) => {
  try {
    const data = event.data;
    if (data.kind === "init") {
      if (data.algorithm !== "CityHash64" || !data.city)
        throw new Error("invalid_input");
      hasher = createCityHash(data.city, data.city.seed);
      bytes = 0;
    } else if (data.kind === "chunk") {
      if (!hasher || !(data.chunk instanceof Uint8Array))
        throw new Error("invalid_input");
      hasher.update(data.chunk);
      bytes += data.chunk.length;
    } else if (data.kind === "end") {
      if (!hasher) throw new Error("invalid_input");
      const out = hasher.digest("binary");
      self.postMessage({
        result: {
          algorithm: "CityHash64",
          bytes,
          outputBits: 64,
          hex: formatHash(out, "hex"),
          base64: formatHash(out, "base64"),
          decimal: formatHash(out, "decimal"),
          binary: formatHash(out, "binary"),
        },
      });
      return;
    } else throw new Error("invalid_input");
    self.postMessage({ ready: true });
  } catch {
    self.postMessage({ error: "worker_failed" });
  }
};
