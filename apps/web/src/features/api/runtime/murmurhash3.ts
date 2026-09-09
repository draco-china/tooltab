import * as z from "zod/v4";
import { StreamHashError } from "@workspace/tools/hash/input";
import {
  MURMUR_ALGORITHMS,
  parseMurmurSeed,
} from "@workspace/tools/hash/murmur";
import {
  resolveSource,
  runServiceStreamHash,
  streamHashSchema,
} from "./legacy-hashes";
import type { Operation } from "./operation-contract";

const source = streamHashSchema.options,
  seed = { seed: z.string().max(4096).default("0") };
export const murmurSchema = z.union([
  source[0].extend(seed),
  source[1].extend(seed),
  source[2].extend(seed),
]);
export const murmurHttpSchema = z.union([
  source[0].extend(seed),
  source[1].extend(seed),
]);
let active = 0;
export const murmurOperations: Operation[] = MURMUR_ALGORITHMS.map(
  (algorithm) => ({
    id: `murmurhash3-${algorithm.slice(8)}-hash-text-or-file`,
    name: `tooltab_murmurhash3_${algorithm.slice(8).replaceAll("-", "_")}_hash_text_or_file`,
    description: `MurmurHash3 ${algorithm.slice(8)} non-cryptographic incremental hash. UTF8text16MiB or rawupload/authorizedMCPfile1TiB. Unsigneddecimal/0x seed string wrapsmodulo2^32. Four big-endian word encodings. TrueWorker cancellation.`,
    inputSchema: murmurSchema,
    outputSchema: z.strictObject({
      algorithm: z.enum(MURMUR_ALGORITHMS),
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
      const p = murmurSchema.parse(value),
        seed = parseMurmurSeed(p.seed);
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
            BigInt(seed),
          )),
          seed: String(seed),
        };
      } finally {
        active--;
      }
    },
  }),
);
