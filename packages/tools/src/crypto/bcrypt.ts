import { compareSync, encodeBase64, hashSync } from "bcryptjs";

export const DEFAULT_COST = 12;
export const MIN_COST = 4;
export const MAX_COST = 15;

export type BcryptErrorCode =
  | "invalid_password"
  | "password_too_long"
  | "invalid_cost"
  | "invalid_hash"
  | "random_failed"
  | "worker_failed"
  | "timeout"
  | "busy";

export class BcryptError extends Error {
  constructor(public readonly code: BcryptErrorCode) {
    super(code);
  }
}

export type BcryptJob =
  | { kind: "hash"; password: string; cost: number; truncate: boolean }
  | { kind: "verify"; password: string; hash: string; truncate: boolean };

export function parseCostInput(value: string, fallback = DEFAULT_COST) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return { value: fallback, isValid: false };
  const parsed = Number.parseInt(trimmed, 10);
  return {
    value: Number.isSafeInteger(parsed) ? parsed : fallback,
    isValid:
      Number.isSafeInteger(parsed) && parsed >= MIN_COST && parsed <= MAX_COST,
  };
}

export function passwordInfo(password: string, truncate: boolean) {
  if (password.length > 1_048_576) throw new BcryptError("invalid_password");
  for (const character of password) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      throw new BcryptError("invalid_password");
    }
  }
  const passwordBytes = new TextEncoder().encode(password).length;
  if (passwordBytes > 72 && !truncate) {
    throw new BcryptError("password_too_long");
  }
  return { passwordBytes, truncated: passwordBytes > 72 };
}

export function parseBcryptHash(input: string) {
  if (input.length > 256) throw new BcryptError("invalid_hash");
  const hash = input.trim();
  const match =
    /^\$(2[aby])\$(0[4-9]|[12]\d|3[01])\$([./A-Za-z0-9]{22})([./A-Za-z0-9]{31})$/.exec(
      hash,
    );
  if (!match?.[1] || !match[3] || !match[4]) {
    throw new BcryptError("invalid_hash");
  }
  return {
    hash,
    version: match[1],
    cost: Number(match[2]),
    salt: match[3],
    checksum: match[4],
  };
}

// Keep the established API/MCP import names while feature pages use explicit names.
export const parseHash = parseBcryptHash;

export function validateBcryptJob(job: BcryptJob) {
  const info = passwordInfo(job.password, job.truncate);
  if (job.kind === "hash") {
    if (!job.password) throw new BcryptError("invalid_password");
    if (
      !Number.isInteger(job.cost) ||
      job.cost < MIN_COST ||
      job.cost > MAX_COST
    ) {
      throw new BcryptError("invalid_cost");
    }
  } else {
    parseBcryptHash(job.hash);
  }
  return info;
}

export const validateJob = validateBcryptJob;

export type BcryptResult = ReturnType<typeof parseBcryptHash> & {
  passwordBytes: number;
  truncated: boolean;
  matches: boolean | null;
};

// CPU-heavy bcrypt only calls this synchronous primitive inside a disposable Worker.
export function executeBcrypt(job: BcryptJob): BcryptResult {
  const info = validateBcryptJob(job);
  if (job.kind === "verify") {
    const parts = parseBcryptHash(job.hash);
    return {
      ...parts,
      ...info,
      matches: compareSync(job.password, parts.hash),
    };
  }
  let salt: Uint8Array;
  try {
    salt = crypto.getRandomValues(new Uint8Array(16));
  } catch {
    throw new BcryptError("random_failed");
  }
  const encodedSalt = `$2b$${String(job.cost).padStart(2, "0")}$${encodeBase64(salt, 16)}`;
  const hash = hashSync(job.password, encodedSalt);
  return { ...parseBcryptHash(hash), ...info, matches: null };
}
