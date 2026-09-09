import { workerTaskHandler } from "@/lib/worker-task";
import { generatePgp } from "@workspace/tools/crypto/pgp";
import { PgpToolError } from "@workspace/tools/crypto/pgp-contract";

self.onmessage = workerTaskHandler(
  {
    run: generatePgp,
    error: (error) =>
      error instanceof PgpToolError ? error.code : "generation_failed",
  },
  (message, transfer) => self.postMessage(message, transfer),
);
