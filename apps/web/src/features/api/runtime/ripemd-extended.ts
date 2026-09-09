import * as z from "zod/v4";
import { StreamHashError } from "@workspace/tools/hash/input";
import { RIPEMD_ALGORITHMS } from "@workspace/tools/hash/ripemd";
import {
  resolveSource,
  runServiceStreamHash,
  streamHashHttpSchema,
  streamHashSchema,
} from "./legacy-hashes";
import type { Operation } from "./operation-contract";
export const ripemdSchema = streamHashSchema;
export const ripemdHttpSchema = streamHashHttpSchema;
let active = 0;
export const ripemdOperations: Operation[] = RIPEMD_ALGORITHMS.map(
  (algorithm) => ({
    id: `${algorithm.toLowerCase().replace("-", "")}-hash-text-or-file`,
    name: `tooltab_${algorithm.toLowerCase().replace("-", "")}_hash_text_or_file`,
    description: `${algorithm} incremental hash: UTF8text16MiB or rawupload/authorizedMCPfile1TiB, cancellable Worker. Four digest-byte encodings; standard little-endian stateword serialization. No seed/key. RIPEMD256/320 extensions are not truncation/padding and do not increase relative security level.`,
    inputSchema: ripemdSchema,
    outputSchema: z.strictObject({
      algorithm: z.enum(RIPEMD_ALGORITHMS),
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
      const p = ripemdSchema.parse(value);
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
