import {
  CidrError,
  mergeLines,
  prepareMerge,
} from "@workspace/tools/network/cidr";

let iterator: Generator<string> | undefined;
self.onmessage = (
  event: MessageEvent<{ merge: string; exclude: string } | { pull: true }>,
) => {
  try {
    if ("pull" in event.data) {
      let text = "";
      while (text.length < 65536) {
        const next = iterator?.next();
        if (!next || next.done) {
          self.postMessage({
            data: new TextEncoder().encode(text),
            done: true,
          });
          return;
        }
        text += `${next.value}\n`;
      }
      self.postMessage({ data: new TextEncoder().encode(text), done: false });
      return;
    }
    const prepared = prepareMerge(event.data.merge, event.data.exclude),
      inline: string[] = [];
    let blockCount = 0,
      bytes = 0;
    for (const line of mergeLines(prepared)) {
      blockCount++;
      bytes += line.length + 1;
      if (bytes <= 65536) inline.push(line);
    }
    const { ranges: _, ...rest } = prepared,
      summary = { ...rest, blockCount };
    if (bytes <= 65536)
      self.postMessage({ inline: { ...summary, cidrs: inline } });
    else {
      iterator = mergeLines(prepared);
      self.postMessage({ summary });
    }
  } catch (e) {
    self.postMessage({
      error: e instanceof CidrError ? e.code : "unsupported",
      issues: e instanceof CidrError ? e.issues : [],
    });
  }
};
