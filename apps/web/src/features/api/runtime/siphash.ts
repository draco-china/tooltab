import * as z from "zod/v4";
import { StreamHashError } from "@workspace/tools/hash/input";
import {
  parseSipHashKey,
  SIPHASH_ALGORITHMS,
} from "@workspace/tools/hash/siphash";
import {
  resolveSource,
  runServiceStreamHash,
  streamHashHttpSchema,
  streamHashSchema,
} from "./legacy-hashes";
import type { Operation } from "./operation-contract";

const keyField = z.string().min(1).max(4096);
export const sipHashSchema = z.union(
  streamHashSchema.options.map((o) => o.extend({ key: keyField })),
);
export const sipHashHttpSchema = z.union(
  streamHashHttpSchema.options.map((o) => o.extend({ key: keyField })),
);
let active = 0;
export const sipHashOperations: Operation[] = SIPHASH_ALGORITHMS.map(
  (algorithm) => ({
    id: `${algorithm.toLowerCase()}-hash-text-or-file`,
    name: `tooltab_${algorithm.toLowerCase().replaceAll("-", "_")}_hash_text_or_file`,
    description: `${algorithm} keyed streaming hash. Required 16-byte hex key (optional 0x/separators), UTF8 text16MiB or raw uploaded/authorized file1TiB. Four encodings in big-endian word display order; standard128 initialization. Keys are never returned or saved.`,
    inputSchema: sipHashSchema,
    outputSchema: z.strictObject({
      algorithm: z.enum(SIPHASH_ALGORITHMS),
      bytes: z.number().int().nonnegative(),
      outputBits: z.number().int(),
      hex: z.string(),
      base64: z.string(),
      decimal: z.string(),
      binary: z.string(),
    }),
    bodyLimit: 110000000,
    idempotent: true,
    async run(value, signal, context) {
      const p = sipHashSchema.parse(value);
      const key = parseSipHashKey(p.key);
      if (active >= 2) throw new StreamHashError("busy");
      const abort = signal ?? new AbortController().signal;
      abort.throwIfAborted();
      active++;
      try {
        return await runServiceStreamHash(
          algorithm,
          resolveSource(p, abort, context),
          abort,
          undefined,
          0n,
          key,
        );
      } finally {
        key.fill(0);
        active--;
      }
    },
  }),
);
