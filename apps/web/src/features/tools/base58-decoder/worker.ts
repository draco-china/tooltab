import { BASE58_ALPHABETS } from "@workspace/tools/encoding/base";
import { workerTaskHandler } from "@/lib/worker-task";
import { decodeBase58Preview } from "./logic";
import type { Base58DecodeInput } from "./worker-client";

self.onmessage = workerTaskHandler(
  {
    run: ({ input, alphabet }: Base58DecodeInput) =>
      decodeBase58Preview(input, { alphabet: BASE58_ALPHABETS[alphabet] }),
    error: () => "worker_failed",
    transfer: (result) =>
      result.state === "decoded" ? [result.bytes.buffer] : [],
  },
  (message, transfer) => self.postMessage(message, { transfer }),
);
