export const SHA_ALGORITHMS = [
  "SHA-1",
  "SHA-256",
  "SHA-384",
  "SHA-512",
  "SHA-224",
  "SHA-512/224",
  "SHA-512/256",
  "SHA3-224",
  "SHA3-256",
  "SHA3-384",
  "SHA3-512",
  "SHAKE128",
  "SHAKE256",
] as const;
export type ShaAlgorithm = (typeof SHA_ALGORITHMS)[number];
export const MAX_HASH_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_HASH_TEXT_BYTES = 4 * 1024 * 1024;
export class ShaHashError extends Error {
  constructor(
    public readonly code:
      | "too-large"
      | "invalid-text"
      | "unsupported"
      | "read-failed"
      | "digest-failed"
      | "invalid-length",
  ) {
    super(code);
    this.name = "ShaHashError";
  }
}
export function hashTextBytes(text: string): Uint8Array<ArrayBuffer> {
  if (text.length > MAX_HASH_TEXT_BYTES) throw new ShaHashError("too-large");
  if (/[\uD800-\uDFFF]/u.test(text)) throw new ShaHashError("invalid-text");
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_HASH_TEXT_BYTES) throw new ShaHashError("too-large");
  return bytes;
}
export function decodeHashTextFile(bytes: Uint8Array): string {
  if (bytes.length > MAX_HASH_TEXT_BYTES) throw new ShaHashError("too-large");
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new ShaHashError("invalid-text");
  }
}
export function isShakeAlgorithm(algorithm: ShaAlgorithm): boolean {
  return algorithm === "SHAKE128" || algorithm === "SHAKE256";
}
export function validateShakeOutputBits(bits: number): number {
  if (!Number.isInteger(bits) || bits < 8 || bits > 65536 || bits % 8 !== 0) {
    throw new ShaHashError("invalid-length");
  }
  return bits;
}
