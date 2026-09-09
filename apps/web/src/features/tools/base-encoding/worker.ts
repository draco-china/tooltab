import {
  BaseEncodingError,
  decodeBase,
  encodeBase,
} from "@workspace/tools/encoding/base";
import type { BaseWorkerJob } from "./worker-client";

const scope = self as unknown as {
  onmessage: (event: MessageEvent<BaseWorkerJob>) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = async (event: MessageEvent<BaseWorkerJob>) => {
  const job = event.data;
  try {
    if (job.decode) {
      const decoded = await decodeBase(job.source, job.kind, job.options);
      scope.postMessage({ decoded }, [decoded.buffer]);
    } else
      scope.postMessage({
        encoded: await encodeBase(
          job.bytes,
          job.kind,
          job.padding,
          job.options,
        ),
      });
  } catch (error) {
    scope.postMessage({
      error:
        error instanceof BaseEncodingError ? error.code : "invalid-encoding",
    });
  }
};
