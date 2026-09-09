import { zipSync } from "fflate";
import type { ImageFile } from "./types";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ImageFile[]>) => void) | null;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = ({ data: files }) => {
  try {
    const archive = zipSync(
      Object.fromEntries(files.map((file) => [file.name, file.bytes])),
      { level: 0 },
    );
    scope.postMessage({ files, archive }, [
      ...files.map((file) => file.bytes.buffer as ArrayBuffer),
      archive.buffer as ArrayBuffer,
    ]);
  } catch {
    scope.postMessage({ error: true });
  }
};
