import { createShake256 } from "@workspace/tools/hash/shake";

let hasher: ReturnType<typeof createShake256> | undefined;

self.onmessage = (event) => {
  try {
    if (event.data?.kind === "init") {
      const outputBytes = Number(event.data.outputBytes);
      hasher?.destroy();
      hasher = undefined;
      hasher = createShake256(outputBytes);
      self.postMessage({ ready: true });
      return;
    }
    if (event.data?.kind === "chunk") {
      if (!hasher || !(event.data.bytes instanceof Uint8Array))
        throw new Error("invalid-input");
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
