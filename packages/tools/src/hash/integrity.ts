import { hmac } from "@noble/hashes/hmac.js";
import { sha1 } from "@noble/hashes/legacy.js";
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import { formatHash } from "./format";

export const HMAC_ALGORITHMS = [
  "SHA-256",
  "SHA-384",
  "SHA-512",
  "SHA-1",
] as const;
export type HmacAlgorithm = (typeof HMAC_ALGORITHMS)[number];
export const SRI_ALGORITHMS = ["sha256", "sha384", "sha512"] as const;

export class IntegrityError extends Error {
  constructor(
    public readonly code:
      | "invalid_algorithm"
      | "invalid_key"
      | "invalid_metadata"
      | "read_failed",
  ) {
    super(code);
  }
}

export type IntegritySource = Uint8Array | Blob | AsyncIterable<Uint8Array>;

const hashes = {
  "SHA-256": sha256,
  "SHA-384": sha384,
  "SHA-512": sha512,
  "SHA-1": sha1,
};

export function integrityText(text: string) {
  if (/[\uD800-\uDFFF]/u.test(text)) throw new IntegrityError("read_failed");
  return new TextEncoder().encode(text);
}

export function integrityKey(
  value: string,
  encoding: "utf8" | "hex" | "base64" = "utf8",
) {
  if (value.length > 2 * 1024 * 1024) throw new IntegrityError("invalid_key");
  let bytes: Uint8Array;
  if (encoding === "utf8") {
    if (/[\uD800-\uDFFF]/u.test(value)) throw new IntegrityError("invalid_key");
    bytes = new TextEncoder().encode(value);
  } else if (encoding === "hex") {
    if (value.length % 2 || /[^0-9a-f]/i.test(value))
      throw new IntegrityError("invalid_key");
    bytes = Uint8Array.from(value.match(/../g) ?? [], (v) =>
      Number.parseInt(v, 16),
    );
  } else {
    try {
      const raw = atob(value);
      if (btoa(raw) !== value) throw Error();
      bytes = Uint8Array.from(raw, (v) => v.charCodeAt(0));
    } catch {
      throw new IntegrityError("invalid_key");
    }
  }
  if (bytes.length > 1024 * 1024) throw new IntegrityError("invalid_key");
  return bytes;
}

function sourceChunks(source: IntegritySource, signal?: AbortSignal) {
  const snapshot = ArrayBuffer.isView(source)
    ? new Uint8Array(
        source.buffer,
        source.byteOffset,
        source.byteLength,
      ).slice()
    : source;
  return (async function* () {
    try {
      if (snapshot instanceof Uint8Array || snapshot instanceof Blob) {
        const size = snapshot instanceof Blob ? snapshot.size : snapshot.length;
        for (let offset = 0; offset < size; offset += 65536) {
          signal?.throwIfAborted();
          yield snapshot instanceof Blob
            ? new Uint8Array(
                await snapshot.slice(offset, offset + 65536).arrayBuffer(),
              )
            : snapshot.subarray(offset, offset + 65536);
        }
      } else {
        for await (const chunk of snapshot) {
          signal?.throwIfAborted();
          yield chunk;
        }
      }
    } finally {
      if (snapshot instanceof Uint8Array) snapshot.fill(0);
    }
  })();
}

export async function generateHmac(
  source: IntegritySource,
  key: Uint8Array,
  algorithm: HmacAlgorithm = "SHA-256",
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!HMAC_ALGORITHMS.includes(algorithm))
    throw new IntegrityError("invalid_algorithm");
  if (key.length > 1024 * 1024) throw new IntegrityError("invalid_key");
  const secret = key.slice();
  let state: ReturnType<typeof hmac.create>;
  try {
    state = hmac.create(hashes[algorithm], secret);
  } finally {
    secret.fill(0);
  }
  let bytes = 0;
  try {
    const input = sourceChunks(source, signal);
    for await (const chunk of input) {
      signal?.throwIfAborted();
      state.update(chunk);
      bytes += chunk.length;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    const digest = state.digest();
    return {
      algorithm,
      bytes,
      hex: formatHash(digest, "hex"),
      base64: formatHash(digest, "base64"),
    };
  } finally {
    state.destroy();
  }
}

export async function generateSri(
  source: IntegritySource,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const states = [sha256.create(), sha384.create(), sha512.create()];
  let bytes = 0;
  try {
    const input = sourceChunks(source, signal);
    for await (const chunk of input) {
      signal?.throwIfAborted();
      for (const state of states) state.update(chunk);
      bytes += chunk.length;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    const tokens = states.map(
      (state, i) =>
        `${SRI_ALGORITHMS[i]}-${formatHash(state.digest(), "base64")}`,
    );
    return { bytes, sha256: tokens[0], sha384: tokens[1], sha512: tokens[2] };
  } finally {
    for (const state of states) state.destroy();
  }
}

export function verifySri(
  digests: Awaited<ReturnType<typeof generateSri>>,
  metadata: string,
) {
  if (metadata.length > 65536) throw new IntegrityError("invalid_metadata");
  const tokens = metadata.trim().split(/[\t\n\f\r ]+/);
  const accepted: {
    algorithm: (typeof SRI_ALGORITHMS)[number];
    digest: string;
  }[] = [];
  for (const token of tokens) {
    const match =
      /^(sha256|sha384|sha512)-([A-Za-z0-9+/_-]+={0,2})(?:\?[\x21-\x7e]*)?$/i.exec(
        token,
      );
    if (!match) continue;
    const algorithm = match[1].toLowerCase() as (typeof SRI_ALGORITHMS)[number];
    const normalized = match[2].replaceAll("-", "+").replaceAll("_", "/");
    let digest = "!invalid";
    try {
      const binary = atob(normalized);
      if (btoa(binary).replace(/=+$/, "") === normalized.replace(/=+$/, ""))
        digest = btoa(binary);
    } catch {}
    accepted.push({ algorithm, digest });
  }
  const algorithm = [...SRI_ALGORITHMS]
    .reverse()
    .find((a) => accepted.some((t) => t.algorithm === a));
  if (!algorithm) throw new IntegrityError("invalid_metadata");
  const expected = digests[algorithm].slice(algorithm.length + 1);
  const valid = accepted
    .filter((t) => t.algorithm === algorithm)
    .some((t) => t.digest === expected);
  return { valid, algorithm };
}
