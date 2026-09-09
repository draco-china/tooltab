import { sha3_224 } from "@noble/hashes/sha3.js";

let hasher: ReturnType<typeof sha3_224.create> | undefined;

self.onmessage = (event) => {
  try {
    if (event.data?.kind === "init") {
      hasher?.destroy();
      hasher = undefined;
      hasher = sha3_224.create();
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
      const digest = hasher.digest();
      hasher.destroy();
      hasher = undefined;
      self.postMessage({ digest }, [digest.buffer]);
      return;
    }
    throw new Error("invalid-input");
  } catch {
    hasher?.destroy();
    hasher = undefined;
    self.postMessage({ error: "digest-failed" });
  }
};
