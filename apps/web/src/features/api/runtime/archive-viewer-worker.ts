import type { ArchiveJob } from "@workspace/tools/archive";
import { processArchive } from "@workspace/tools/archive/runtime";
import { ArchiveError } from "@workspace/tools/archive";

const scope = self as unknown as {
  onmessage: (event: MessageEvent<ArchiveJob>) => void;
  postMessage(data: unknown, transfer?: Transferable[]): void;
};
scope.onmessage = async (e) => {
  try {
    const result = await processArchive(e.data);
    scope.postMessage({ result }, result.bytes ? [result.bytes.buffer] : []);
  } catch (error) {
    scope.postMessage({
      error: error instanceof ArchiveError ? error.code : "read_failed",
    });
  }
};
