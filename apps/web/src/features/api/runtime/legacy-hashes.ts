import { createReadStream } from "node:fs";
import * as z from "zod/v4";
import {
  MAX_BYTES,
  MAX_TEXT,
  StreamHashError,
  textBytes,
} from "@workspace/tools/hash/input";
import { ALGORITHMS } from "@/features/tools/legacy-hashes/logic";
import { runStreamHash } from "@/features/tools/legacy-hashes/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

/** API execution uses an emitted Worker; browser callers retain their static entry. */
export function runServiceStreamHash(
  ...[algorithm, source, signal, progress, seed, key, city]: Parameters<
    typeof runStreamHash
  >
) {
  return runStreamHash(
    algorithm,
    source,
    signal,
    progress,
    seed,
    key,
    city,
    import.meta.env.PROD
      ? () =>
          new Worker(
            serviceWorkerUrl("legacy-hashes-worker", import.meta.url),
            { type: "module" },
          )
      : undefined,
  );
}

const text = z.strictObject({ text: z.string().max(MAX_TEXT) });
const upload = z.strictObject({ uploadId: z.uuid() });
const path = z.strictObject({ inputPath: z.string().min(1).max(4096) });
export const streamHashSchema = z.union([text, upload, path]);
export const streamHashHttpSchema = z.union([text, upload]);
export async function* resolveSource(
  p: z.infer<typeof streamHashSchema>,
  signal: AbortSignal,
  context?: WebpContext,
): AsyncGenerator<Uint8Array> {
  if ("text" in p) {
    yield textBytes(p.text);
    return;
  }
  if (!context) throw new StreamHashError("invalid_input");
  if ("inputPath" in p) {
    if (context.transport !== "mcp") throw new StreamHashError("invalid_input");
    yield* streamAuthorizedFile(
      p.inputPath,
      context.inputRoots ?? [],
      signal,
      MAX_BYTES,
    );
  } else {
    const record = await context.artifacts.get(p.uploadId, "upload");
    if (record.bytes > MAX_BYTES) throw new StreamHashError("too_large");
    yield* createReadStream(record.path, { highWaterMark: 262144, signal });
  }
}
const output = z.strictObject({
  algorithm: z.enum(ALGORITHMS),
  bytes: z.number().int().nonnegative(),
  outputBits: z.number().int(),
  hex: z.string(),
  base64: z.string(),
  decimal: z.string(),
  binary: z.string(),
});
let active = 0;
export const streamHashOperations: Operation[] = ALGORITHMS.map(
  (algorithm) => ({
    id: `${algorithm.toLowerCase()}-hash-text-or-file`,
    name: `tooltab_${algorithm.toLowerCase()}_hash_text_or_file`,
    description: `${algorithm} streaming hash of UTF8 text (16MiB) or raw upload/authorized MCP file (1TiB). Cancellable WASM Worker; returns hex/Base64/decimal/binary. MD4 is cryptographically broken; these are not password KDFs.`,
    inputSchema: streamHashSchema,
    outputSchema: output,
    bodyLimit: 110000000,
    idempotent: true,
    async run(value, signal, context) {
      const p = streamHashSchema.parse(value);
      if (active >= 2) throw new StreamHashError("busy");
      const abort = signal ?? new AbortController().signal;
      abort.throwIfAborted();
      active++;
      try {
        return await runServiceStreamHash(
          algorithm,
          resolveSource(p, abort, context),
          abort,
        );
      } finally {
        active--;
      }
    },
  }),
);
