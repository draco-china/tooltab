import type { DigestResult } from "@workspace/tools/hash/format";
import type { Algorithm } from "@workspace/tools/hash/streaming";
export const ALGORITHMS = ["MD4", "SM3", "Whirlpool"] as const;
export type HashResult = DigestResult<Algorithm>;
