import { createWorkerSession } from "@/lib/worker-task";
import {
  hashTextBytes,
  MAX_HASH_FILE_BYTES,
  ShaHashError,
} from "@workspace/tools/hash/sha-input";
import { formatHash, type HashFormat } from "@workspace/tools/hash/format";

const CHUNK_BYTES = 256 * 1024;

export type ShaWorkerDigest = Record<HashFormat, string>;

async function runShaWorker(
  source: string | File,
  signal: AbortSignal,
  expectedBytes: number,
  createWorker: () => Worker,
  init: object = { kind: "init" },
): Promise<ShaWorkerDigest> {
  signal.throwIfAborted();
  if (source instanceof File && source.size > MAX_HASH_FILE_BYTES) {
    throw new ShaHashError("too-large");
  }

  const session = createWorkerSession<object, Uint8Array | undefined>({
    create: createWorker,
    parse(data) {
      if (!data || typeof data !== "object" || ("error" in data && data.error))
        throw new ShaHashError("digest-failed");
      return "digest" in data ? (data.digest as Uint8Array) : undefined;
    },
    error: () => new ShaHashError("digest-failed"),
    timeoutMs: 30000,
    signal,
  });
  const { send } = session;
  try {
    await send(init);
    if (typeof source === "string") {
      const bytes = hashTextBytes(source);
      try {
        await send({ kind: "chunk", bytes });
      } finally {
        bytes.fill(0);
      }
    } else {
      for (let offset = 0; offset < source.size; offset += CHUNK_BYTES) {
        signal.throwIfAborted();
        let bytes: Uint8Array<ArrayBuffer>;
        try {
          bytes = new Uint8Array(
            await source.slice(offset, offset + CHUNK_BYTES).arrayBuffer(),
          );
        } catch {
          signal.throwIfAborted();
          throw new ShaHashError("read-failed");
        }
        try {
          signal.throwIfAborted();
          await send({ kind: "chunk", bytes });
        } finally {
          bytes.fill(0);
        }
      }
    }
    const digest = await send({ kind: "digest" });
    if (!(digest instanceof Uint8Array) || digest.length !== expectedBytes) {
      throw new ShaHashError("digest-failed");
    }
    try {
      return {
        hex: formatHash(digest, "hex"),
        base64: formatHash(digest, "base64"),
        decimal: formatHash(digest, "decimal"),
        binary: formatHash(digest, "binary"),
      };
    } finally {
      digest.fill(0);
    }
  } finally {
    session.close();
  }
}

export function runSha1Worker(source: string | File, signal: AbortSignal) {
  return runShaWorker(
    source,
    signal,
    20,
    () =>
      new Worker(new URL("./sha1-worker.ts", import.meta.url), {
        type: "module",
      }),
  );
}

export function runSha224Worker(source: string | File, signal: AbortSignal) {
  return runShaWorker(
    source,
    signal,
    28,
    () =>
      new Worker(new URL("./sha224-worker.ts", import.meta.url), {
        type: "module",
      }),
  );
}

export function runSha384Worker(source: string | File, signal: AbortSignal) {
  return runShaWorker(
    source,
    signal,
    48,
    () =>
      new Worker(new URL("./sha384-worker.ts", import.meta.url), {
        type: "module",
      }),
  );
}

export function runSha3224Worker(source: string | File, signal: AbortSignal) {
  return runShaWorker(
    source,
    signal,
    28,
    () =>
      new Worker(new URL("./sha3-224-worker.ts", import.meta.url), {
        type: "module",
      }),
  );
}

export function runSha3256Worker(source: string | File, signal: AbortSignal) {
  return runShaWorker(
    source,
    signal,
    32,
    () =>
      new Worker(new URL("./sha3-256-worker.ts", import.meta.url), {
        type: "module",
      }),
  );
}

export function runSha3384Worker(source: string | File, signal: AbortSignal) {
  return runShaWorker(
    source,
    signal,
    48,
    () =>
      new Worker(new URL("./sha3-384-worker.ts", import.meta.url), {
        type: "module",
      }),
  );
}

export function runSha3512Worker(source: string | File, signal: AbortSignal) {
  return runShaWorker(
    source,
    signal,
    64,
    () =>
      new Worker(new URL("./sha3-512-worker.ts", import.meta.url), {
        type: "module",
      }),
  );
}

export function runShake128Worker(
  source: string | File,
  outputBits: number,
  signal: AbortSignal,
) {
  return runShaWorker(
    source,
    signal,
    outputBits / 8,
    () =>
      new Worker(new URL("./shake128-worker.ts", import.meta.url), {
        type: "module",
      }),
    { kind: "init", outputBytes: outputBits / 8 },
  );
}

export function runShake256Worker(
  source: string | File,
  outputBits: number,
  signal: AbortSignal,
) {
  return runShaWorker(
    source,
    signal,
    outputBits / 8,
    () =>
      new Worker(new URL("./shake256-worker.ts", import.meta.url), {
        type: "module",
      }),
    { kind: "init", outputBytes: outputBits / 8 },
  );
}
