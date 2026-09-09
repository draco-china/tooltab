import { shake128, shake256 } from "@noble/hashes/sha3.js";
import { validateShakeOutputBits } from "./sha-input";

/** Incremental SHAKE uses bytes for output length, matching the digest buffer. */
export function createShake128(outputBytes: number) {
  validateShakeOutputBits(outputBytes * 8);
  return shake128.create({ dkLen: outputBytes });
}

export function createShake256(outputBytes: number) {
  validateShakeOutputBits(outputBytes * 8);
  return shake256.create({ dkLen: outputBytes });
}
