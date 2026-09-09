import { createSHA1 } from "hash-wasm";

let hasher: Awaited<ReturnType<typeof createSHA1>> | undefined;

self.onmessage = async (event) => {
  try {
    if (event.data?.kind === "init") {
      hasher = await createSHA1();
      self.postMessage({ ready: true });
      return;
    }
    if (event.data?.kind === "chunk") {
      if (!hasher || !(event.data.bytes instanceof Uint8Array)) {
        throw new Error("invalid-input");
      }
      hasher.update(event.data.bytes);
      self.postMessage({ ready: true });
      return;
    }
    if (event.data?.kind === "digest") {
      if (!hasher) throw new Error("invalid-input");
      const digest = hasher.digest("binary");
      hasher = undefined;
      self.postMessage({ digest }, [digest.buffer]);
      return;
    }
    throw new Error("invalid-input");
  } catch {
    hasher = undefined;
    self.postMessage({ error: "digest-failed" });
  }
};
