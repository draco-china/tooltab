import * as z from "zod/v4";
import { StreamHashError } from "@workspace/tools/hash/input";
import {
  parseSeed,
  usesSeed,
  XXHASH_ALGORITHMS,
  type XxAlgorithm,
} from "@workspace/tools/hash/xxhash";
import {
  resolveSource,
  runServiceStreamHash,
  streamHashHttpSchema,
  streamHashSchema,
} from "./legacy-hashes";
import type { Operation } from "./operation-contract";
export function xxHashSchemas(algorithm: XxAlgorithm) {
  const seed = { seed: z.string().max(4096).default("0") };
  const source = streamHashSchema.options;
  return usesSeed(algorithm)
    ? {
        input: z.union([
          source[0].extend(seed),
          source[1].extend(seed),
          source[2].extend(seed),
        ]),
        http: z.union([source[0].extend(seed), source[1].extend(seed)]),
      }
    : { input: streamHashSchema, http: streamHashHttpSchema };
}
let active = 0;
export const xxHashOperations: Operation[] = XXHASH_ALGORITHMS.map(
  (algorithm) => ({
    id: `xxhash-${algorithm.toLowerCase()}-hash-text-or-file`,
    name: `tooltab_xxhash_${algorithm.toLowerCase().replaceAll("-", "_")}_hash_text_or_file`,
    description: `${algorithm} non-cryptographic streaming hash; UTF8text16MiB/rawupload or authorizedMCPfile1TiB. Four big-endian encodings. ${usesSeed(algorithm) ? "Unsigned decimal/0x seed string defaults0, wraps modulo2^64 without precision loss." : "Fixed seed0."}`,
    inputSchema: xxHashSchemas(algorithm).input,
    outputSchema: z.strictObject({
      algorithm: z.enum(XXHASH_ALGORITHMS),
      seed: z.string(),
      bytes: z.number().int(),
      outputBits: z.number().int(),
      hex: z.string(),
      base64: z.string(),
      decimal: z.string(),
      binary: z.string(),
    }),
    bodyLimit: 110000000,
    idempotent: true,
    async run(value, signal, context) {
      const p = xxHashSchemas(algorithm).input.parse(value);
      const seed =
        "seed" in p && typeof p.seed === "string" ? parseSeed(p.seed) : 0n;
      if (active >= 2) throw new StreamHashError("busy");
      const abort = signal ?? new AbortController().signal;
      abort.throwIfAborted();
      active++;
      try {
        return {
          ...(await runServiceStreamHash(
            algorithm,
            resolveSource(p, abort, context),
            abort,
            undefined,
            seed,
          )),
          seed: seed.toString(),
        };
      } finally {
        active--;
      }
    },
  }),
);
