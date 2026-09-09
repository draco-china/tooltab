import { zipSync } from "fflate";

self.onmessage = (event: MessageEvent<{ bytes: Uint8Array; name: string }>) => {
  try {
    const archive = zipSync(
      { [event.data.name]: event.data.bytes },
      { level: 0 },
    );
    self.postMessage({ archive }, { transfer: [archive.buffer] });
  } catch {
    self.postMessage({ error: "zip_failed" });
  }
};
