import * as z from "zod/v4";
import { StreamHashError } from "@workspace/tools/hash/input";
import {
  resolveSource,
  streamHashSchema,
} from "../../api/runtime/legacy-hashes";
import type { Operation } from "../../api/runtime/operation-contract";
import { serviceWorkerUrl } from "../../api/runtime/worker-url";
import {
  FILTERS,
  filterResults,
  resultText,
} from "@workspace/tools/checksum/crc";
import { StreamHashError as CrcStreamError } from "./stream";
import { runCrcStream } from "./worker-client";

const options = { filter: z.enum(FILTERS).default("all") };
const source = streamHashSchema.options;
export const crcSchema = z.union([
  source[0].extend(options),
  source[1].extend(options),
  source[2].extend(options),
]);
export const crcHttpSchema = z.union([
  source[0].extend(options),
  source[1].extend(options),
]);
let active = 0;
export const crcOperation: Operation = {
  id: "crc-checksum-calculator",
  name: "tooltab_crc_checksum_calculator",
  description:
    "Compute all20 fixed CRC checksums across1/8/16/24/32/64bits, including sevenCRC64 models. UTF8text16MiB or complete rawupload/authorizedMCPfile1TiB. Filter all/8/16/32/64/other(1+24), paddedhex and visiblecopytext. CRC1 is byte-sum modulo2, notbitparity. No customparameters. CancellableWorker.",
  inputSchema: crcSchema,
  outputSchema: z.strictObject({
    bytes: z.number().int().nonnegative(),
    results: z
      .array(
        z.strictObject({
          id: z.string(),
          name: z.string(),
          width: z.number().int(),
          hex: z.string(),
        }),
      )
      .max(20),
    text: z.string(),
  }),
  bodyLimit: 110000000,
  idempotent: true,
  async run(value, signal, context) {
    const p = crcSchema.parse(value);
    if (active >= 2) throw new StreamHashError("busy");
    const abort = signal ?? new AbortController().signal;
    abort.throwIfAborted();
    active++;
    try {
      const result = await runCrcStream(
        resolveSource(p, abort, context),
        abort,
        undefined,
        import.meta.env.PROD
          ? () =>
              new Worker(
                serviceWorkerUrl("crc-checksum-worker", import.meta.url),
                { type: "module" },
              )
          : undefined,
      );
      const results = filterResults(result.results, p.filter);
      return { bytes: result.bytes, results, text: resultText(results) };
    } catch (cause) {
      if (cause instanceof CrcStreamError)
        throw new StreamHashError(cause.code);
      throw cause;
    } finally {
      active--;
    }
  },
};
