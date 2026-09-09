import type { DigestResult } from "@workspace/tools/hash/format";
import { StreamHashError } from "@workspace/tools/hash/input";

import { createSipHash } from "@workspace/tools/hash/siphash";

export const STREAM_ALGORITHMS = ["SipHash-2-4", "SipHash-128-2-4"] as const;
export type Algorithm = (typeof STREAM_ALGORITHMS)[number];
export async function createHasher(algorithm: Algorithm, key?: Uint8Array) {
  switch (algorithm) {
    case "SipHash-2-4":
    case "SipHash-128-2-4":
      if (key?.length !== 16) throw new StreamHashError("invalid_input");
      return createSipHash(algorithm, key);
    default:
      throw new StreamHashError("invalid_input");
  }
}
export type HashResult = DigestResult<Algorithm>;
