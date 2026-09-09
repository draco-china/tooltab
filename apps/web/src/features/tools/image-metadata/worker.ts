import { ImageMetadataError } from "@workspace/tools/image/metadata-containers";
import { workerTaskHandler } from "@/lib/worker-task";
import { type ImageMetadataJob, runImageMetadataJob } from "./logic";

const scope = globalThis as unknown as {
  onmessage: ((e: MessageEvent<ImageMetadataJob>) => void) | null;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = workerTaskHandler(
  {
    run: runImageMetadataJob,
    error: (error) =>
      error instanceof ImageMetadataError ? error.code : "invalid_image",
    transfer: (result) =>
      result.kind === "cleaned" ? [result.bytes.buffer as ArrayBuffer] : [],
  },
  (message, transfer) => scope.postMessage(message, transfer),
);
