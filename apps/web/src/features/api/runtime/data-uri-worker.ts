import {
  DataUriError,
  decodeChunks,
  filenameFor,
  parseDataUri,
} from "@workspace/tools/encoding/data-uri";

let iterator: Generator<Uint8Array> | undefined;
self.onmessage = (event: MessageEvent<{ input: string } | { pull: true }>) => {
  try {
    if ("pull" in event.data) {
      const next = iterator?.next();
      self.postMessage({
        data: next?.value ?? new Uint8Array(),
        done: next?.done ?? true,
      });
    } else {
      const parsed = parseDataUri(event.data.input);
      iterator = decodeChunks(parsed);
      self.postMessage({
        mimeType: parsed.mimeType,
        encoding: parsed.encoding,
        filename: filenameFor(parsed.mimeType),
      });
    }
  } catch (e) {
    self.postMessage({
      error: e instanceof DataUriError ? e.code : "read_failed",
    });
  }
};
