import {
  CidrError,
  mergeLines,
  prepareMerge,
} from "@workspace/tools/network/cidr";

self.onmessage = (event: MessageEvent<{ merge: string; exclude: string }>) => {
  try {
    const result = prepareMerge(event.data.merge, event.data.exclude),
      parts: string[] = [],
      chunks: BlobPart[] = [];
    let preview = "",
      blockCount = 0,
      length = 0;
    for (const line of mergeLines(result)) {
      const text = `${blockCount ? "\n" : ""}${line}`;
      blockCount++;
      if (preview.length < 100000)
        preview += text.slice(0, 100000 - preview.length);
      parts.push(text);
      length += text.length;
      if (length >= 65536) {
        chunks.push(parts.join(""));
        parts.length = 0;
        length = 0;
      }
    }
    if (parts.length) chunks.push(parts.join(""));
    const { ranges: _, ...summary } = result;
    self.postMessage({
      summary: { ...summary, blockCount },
      preview,
      blob: new Blob(chunks, { type: "text/plain;charset=utf-8" }),
    });
  } catch (e) {
    self.postMessage({
      error: e instanceof CidrError ? e.code : "unsupported",
      issues: e instanceof CidrError ? e.issues : [],
    });
  }
};
