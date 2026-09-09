import {
  DataUriError,
  decodeChunks,
  encodeChunk,
  filenameFor,
  MAX_DATA_FILE,
  mediaType,
  parseDataUri,
  previewKind,
  textPreview,
  uriMediaType,
} from "@workspace/tools/encoding/data-uri";

self.onmessage = async (
  event: MessageEvent<
    { kind: "decode"; input: string } | { kind: "encode"; file: Blob }
  >,
) => {
  try {
    const job = event.data;
    if (job.kind === "decode") {
      const parsed = parseDataUri(job.input),
        chunks: BlobPart[] = [];
      let size = 0,
        preview = new Uint8Array(0);
      for (const chunk of decodeChunks(parsed)) {
        size += chunk.length;
        chunks.push(chunk.buffer as ArrayBuffer);
        if (preview.length < 100004) {
          const next = new Uint8Array(
            Math.min(100004, preview.length + chunk.length),
          );
          next.set(preview);
          next.set(
            chunk.subarray(0, next.length - preview.length),
            preview.length,
          );
          preview = next;
        }
      }
      const kind = previewKind(parsed.mediaType);
      self.postMessage({
        kind: "decode",
        blob: new Blob(chunks, { type: parsed.mimeType }),
        size,
        mimeType: parsed.mimeType,
        encoding: parsed.encoding,
        filename: filenameFor(parsed.mimeType),
        previewKind: kind,
        ...textPreview(preview, parsed.mimeType, size > preview.length),
      });
    } else {
      if (job.file.size > MAX_DATA_FILE) throw new DataUriError("too_large");
      const mime = mediaType(
          job.file.type || "application/octet-stream",
        ).mimeType,
        chunks: string[] = [`data:${uriMediaType(mime)};base64,`];
      let preview = chunks[0] ?? "";
      for (let i = 0; i < job.file.size; i += 49152) {
        const encoded = encodeChunk(
          new Uint8Array(await job.file.slice(i, i + 49152).arrayBuffer()),
        );
        chunks.push(encoded);
        if (preview.length < 100000)
          preview += encoded.slice(0, 100000 - preview.length);
      }
      self.postMessage({
        kind: "encode",
        blob: new Blob(chunks, { type: "text/plain;charset=utf-8" }),
        preview,
        size: job.file.size,
        mimeType: mime,
      });
    }
  } catch (e) {
    self.postMessage({
      error: e instanceof DataUriError ? e.code : "read_failed",
    });
  }
};
