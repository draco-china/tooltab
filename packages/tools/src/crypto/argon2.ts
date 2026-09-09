import { argon2d, argon2i, argon2id } from "@noble/hashes/argon2.js";
export type ArgonErrorCode =
  | "invalid_input"
  | "invalid_parameters"
  | "invalid_salt"
  | "invalid_hash"
  | "resource_limit"
  | "random_failed"
  | "worker_failed"
  | "timeout"
  | "busy";
export class ArgonError extends Error {
  constructor(public readonly code: ArgonErrorCode) {
    super(code);
  }
}
export type Algorithm = "argon2id" | "argon2i" | "argon2d";
export type Params = {
  algorithm: Algorithm;
  iterations: number;
  memorySize: number;
  parallelism: number;
  hashLength: number;
};
export type ArgonJob =
  | ({ kind: "hash"; password: string; secret: string; salt: string } & Params)
  | { kind: "verify"; password: string; secret: string; hash: string };
export const DEFAULTS: Params = {
  algorithm: "argon2id",
  iterations: 3,
  memorySize: 65536,
  parallelism: 1,
  hashLength: 32,
};
export function base64(bytes: Uint8Array) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/=+$/, "");
}
export function decode64(text: string, phc = false) {
  if (text.length > 100000) throw new ArgonError("resource_limit");
  const input = phc
    ? text
    : text.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input) || input.length % 4 === 1)
    throw new ArgonError(phc ? "invalid_hash" : "invalid_salt");
  try {
    const bytes = Uint8Array.from(atob(input), (c) => c.charCodeAt(0));
    if (base64(bytes) !== input.replace(/=+$/, "")) throw Error();
    return bytes;
  } catch {
    throw new ArgonError(phc ? "invalid_hash" : "invalid_salt");
  }
}
export function randomSalt() {
  try {
    return base64(crypto.getRandomValues(new Uint8Array(16)));
  } catch {
    throw new ArgonError("random_failed");
  }
}
function textBytes(input: string) {
  if (input.length > 1048576) throw new ArgonError("resource_limit");
  for (const char of input) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const c = char.codePointAt(0)!;
    if (c >= 0xd800 && c <= 0xdfff) throw new ArgonError("invalid_input");
  }
  return new TextEncoder().encode(input);
}
export function validateParams(p: Params, verify = false) {
  if (
    !["argon2id", "argon2i", "argon2d"].includes(p.algorithm) ||
    [p.iterations, p.memorySize, p.parallelism, p.hashLength].some(
      (n) => !Number.isSafeInteger(n) || n < 1,
    ) ||
    p.hashLength < 4 ||
    p.memorySize < 8 * p.parallelism
  )
    throw new ArgonError("invalid_parameters");
  if (
    p.memorySize > 262144 ||
    p.iterations > 12 ||
    p.parallelism > 16 ||
    p.hashLength > (verify ? 1024 : 64)
  )
    throw new ArgonError("resource_limit");
}
export function parsePHC(input: string) {
  if (input.length > 200000) throw new ArgonError("resource_limit");
  const hash = input.trim(),
    match =
      /^\$(argon2id|argon2i|argon2d)\$v=19\$([^$]+)\$([^$]+)\$([^$]+)$/.exec(
        hash,
      );
  if (!match?.[1] || !match[2] || !match[3] || !match[4])
    throw new ArgonError("invalid_hash");
  const fields = new Map<string, number>();
  for (const field of match[2].split(",")) {
    const part = /^(m|t|p)=([1-9]\d*)$/.exec(field);
    if (!part?.[1] || !part[2] || fields.has(part[1]))
      throw new ArgonError("invalid_hash");
    fields.set(part[1], Number(part[2]));
  }
  if (fields.size !== 3) throw new ArgonError("invalid_hash");
  const salt = decode64(match[3], true),
    digest = decode64(match[4], true);
  if (salt.length < 8 || salt.length > 65536)
    throw new ArgonError("invalid_salt");
  const params: Params = {
    algorithm: match[1] as Algorithm,
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    memorySize: fields.get("m")!,
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    iterations: fields.get("t")!,
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    parallelism: fields.get("p")!,
    hashLength: digest.length,
  };
  validateParams(params, true);
  return { hash, ...params, salt, digest };
}
export function validateJob(job: ArgonJob) {
  textBytes(job.password);
  textBytes(job.secret);
  if (job.kind === "hash") {
    if (!job.password) throw new ArgonError("invalid_input");
    validateParams(job);
    const salt = decode64(job.salt);
    if (salt.length < 8 || salt.length > 65536)
      throw new ArgonError("invalid_salt");
    return { ...job, salt };
  }
  return parsePHC(job.hash);
}
export type ArgonResult = {
  hash: string;
  algorithm: Algorithm;
  version: number;
  iterations: number;
  memorySize: number;
  parallelism: number;
  saltLength: number;
  hashLength: number;
  matches: boolean | null;
};
// Product callers execute this CPU/memory intensive primitive only in a disposable Worker.
export function executeArgon(job: ArgonJob): ArgonResult {
  const parsed = validateJob(job),
    fn = { argon2id, argon2i, argon2d }[parsed.algorithm];
  const password = textBytes(job.password),
    secret = textBytes(job.secret);
  let digest: Uint8Array;
  try {
    digest = fn(password, parsed.salt, {
      t: parsed.iterations,
      m: parsed.memorySize,
      p: parsed.parallelism,
      dkLen: parsed.hashLength,
      key: secret,
      version: 19,
      maxmem: 270 * 1024 * 1024,
    });
  } finally {
    password.fill(0);
    secret.fill(0);
  }
  const hash =
    job.kind === "verify"
      ? job.hash.trim()
      : `$${parsed.algorithm}$v=19$m=${parsed.memorySize},t=${parsed.iterations},p=${parsed.parallelism}$${base64(parsed.salt)}$${base64(digest)}`;
  let matches: boolean | null = null;
  if (job.kind === "verify") {
    const expected = parsePHC(hash).digest;
    let diff = 0;
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    for (let i = 0; i < expected.length; i++) diff |= expected[i]! ^ digest[i]!;
    matches = diff === 0;
  }
  digest.fill(0);
  return {
    hash,
    algorithm: parsed.algorithm,
    version: 19,
    iterations: parsed.iterations,
    memorySize: parsed.memorySize,
    parallelism: parsed.parallelism,
    saltLength: parsed.salt.length,
    hashLength: parsed.hashLength,
    matches,
  };
}
