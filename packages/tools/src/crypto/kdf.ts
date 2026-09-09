import { sha1 } from "@noble/hashes/legacy.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { scrypt } from "@noble/hashes/scrypt.js";
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
export type KdfErrorCode =
  | "invalid_input"
  | "invalid_parameters"
  | "invalid_salt"
  | "resource_limit"
  | "random_failed"
  | "worker_failed"
  | "timeout"
  | "busy";
export class KdfError extends Error {
  constructor(public readonly code: KdfErrorCode) {
    super(code);
  }
}
export const MAX_SALT = 64 * 1024 * 1024;
export type SaltFormat = "utf-8" | "hex" | "base64";
export type Hash = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";
type Common = {
  password: string;
  salt: string | Blob;
  saltFormat: SaltFormat;
  lengthBytes: number;
};
export type KdfJob = Common &
  (
    | { kind: "pbkdf2"; hash: Hash; iterations: number }
    | {
        kind: "scrypt";
        costFactor: number;
        blockSize: number;
        parallelism: number;
      }
  );
export function utf8(input: string) {
  for (const char of input) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const c = char.codePointAt(0)!;
    if (c >= 0xd800 && c <= 0xdfff) throw new KdfError("invalid_input");
  }
  return new TextEncoder().encode(input);
}
export function encode64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function randomSalt(format: SaltFormat) {
  let bytes: Uint8Array;
  try {
    bytes = crypto.getRandomValues(new Uint8Array(16));
  } catch {
    throw new KdfError("random_failed");
  }
  if (format === "hex")
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return format === "base64"
    ? encode64(bytes)
    : encode64(bytes).replace(/=+$/, "");
}
export function validateJob(job: KdfJob) {
  if (job.password.length > 1048576) throw new KdfError("resource_limit");
  if (!["utf-8", "hex", "base64"].includes(job.saltFormat))
    throw new KdfError("invalid_salt");
  const integer = (v: number, min: number, max: number) =>
    Number.isSafeInteger(v) && v >= min && v <= max;
  if (!integer(job.lengthBytes, 16, 256))
    throw new KdfError("invalid_parameters");
  if (job.kind === "pbkdf2") {
    if (
      !["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(job.hash) ||
      !integer(job.iterations, 1, 1000000)
    )
      throw new KdfError("invalid_parameters");
  } else {
    if (
      !integer(job.costFactor, 2, 524288) ||
      (job.costFactor & (job.costFactor - 1)) !== 0 ||
      !integer(job.blockSize, 1, 64) ||
      !integer(job.parallelism, 1, 32)
    )
      throw new KdfError("invalid_parameters");
    if (job.blockSize === 1 && job.costFactor >= 65536)
      throw new KdfError("invalid_parameters");
    if (128 * job.costFactor * job.blockSize > 64 * 1024 * 1024)
      throw new KdfError("resource_limit");
  }
  if (
    typeof job.salt === "string"
      ? job.salt.length > MAX_SALT * 2
      : job.salt.size > MAX_SALT
  )
    throw new KdfError("resource_limit");
}
export async function saltBytes(salt: string | Blob, format: SaltFormat) {
  if (salt instanceof Blob) {
    if (salt.size > MAX_SALT) throw new KdfError("resource_limit");
    return new Uint8Array(await salt.arrayBuffer());
  }
  let bytes: Uint8Array;
  if (salt.length > MAX_SALT * 2) throw new KdfError("resource_limit");
  if (format === "utf-8") bytes = utf8(salt);
  else if (format === "hex") {
    if (salt.length % 2 || !/^[a-fA-F0-9]*$/.test(salt))
      throw new KdfError("invalid_salt");
    bytes = new Uint8Array(salt.length / 2);
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Number.parseInt(salt.slice(i * 2, i * 2 + 2), 16);
  } else {
    const input = salt.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
    let decoded: Uint8Array | undefined;
    try {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input) || input.length % 4 === 1)
        throw Error();
      decoded = Uint8Array.from(atob(input), (c) => c.charCodeAt(0));
      if (encode64(decoded).replace(/=+$/, "") !== input.replace(/=+$/, ""))
        throw Error();
      bytes = decoded;
    } catch {
      decoded?.fill(0);
      throw new KdfError("invalid_salt");
    }
  }
  if (bytes.length > MAX_SALT) {
    bytes.fill(0);
    throw new KdfError("resource_limit");
  }
  return bytes;
}
export type KdfResult = {
  hex: string;
  base64: string;
  saltBytes: number;
  lengthBytes: number;
  memoryBytes: number | null;
};
export async function executeKdf(job: KdfJob): Promise<KdfResult> {
  validateJob(job);
  const salt = await saltBytes(job.salt, job.saltFormat);
  let password: Uint8Array | undefined;
  let bytes: Uint8Array | undefined;
  try {
    password = utf8(job.password);
    bytes =
      job.kind === "pbkdf2"
        ? pbkdf2(
            {
              "SHA-1": sha1,
              "SHA-256": sha256,
              "SHA-384": sha384,
              "SHA-512": sha512,
            }[job.hash],
            password,
            salt,
            { c: job.iterations, dkLen: job.lengthBytes },
          )
        : scrypt(password, salt, {
            N: job.costFactor,
            r: job.blockSize,
            p: job.parallelism,
            dkLen: job.lengthBytes,
            maxmem: 72 * 1024 * 1024,
          });
    return {
      hex: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
      base64: encode64(bytes),
      saltBytes: salt.length,
      lengthBytes: bytes.length,
      memoryBytes:
        job.kind === "scrypt" ? 128 * job.costFactor * job.blockSize : null,
    };
  } finally {
    password?.fill(0);
    salt.fill(0);
    bytes?.fill(0);
  }
}
