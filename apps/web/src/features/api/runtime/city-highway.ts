import * as z from "zod/v4";
import { StreamHashError, textBytes } from "@workspace/tools/hash/input";
import { parseCitySeed } from "@workspace/tools/hash/city";
import { runCityBlob } from "@/features/tools/city-highway/city-client";
import { parseHighwayKey } from "@workspace/tools/hash/highway";
import { runCityFile } from "./city-source";
import {
  resolveSource,
  runServiceStreamHash,
  streamHashHttpSchema,
  streamHashSchema,
} from "./legacy-hashes";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const seed = z.string().max(4096).default("");
const key = z.string().max(4096).default("");
const outputSize = z
  .union([z.literal(64), z.literal(128), z.literal(256)])
  .default(64);
export const citySchema = z.union(
  streamHashSchema.options.map((o) => o.extend({ seed })),
);
export const cityHttpSchema = z.union(
  streamHashHttpSchema.options.map((o) => o.extend({ seed })),
);
export const highwaySchema = z.union(
  streamHashSchema.options.map((o) => o.extend({ key, outputSize })),
);
export const highwayHttpSchema = z.union(
  streamHashHttpSchema.options.map((o) => o.extend({ key, outputSize })),
);
const resultSchema = z.strictObject({
  algorithm: z.enum([
    "CityHash64",
    "HighwayHash-64",
    "HighwayHash-128",
    "HighwayHash-256",
  ]),
  bytes: z.number().int().nonnegative(),
  outputBits: z.number().int(),
  hex: z.string(),
  base64: z.string(),
  decimal: z.string(),
  binary: z.string(),
});
let active = 0;
export const cityOperation: Operation = {
  id: "cityhash64-hash-text-or-file",
  name: "tooltab_cityhash64_hash_text_or_file",
  description:
    "Standard CityHash64 or optional unsigned decimal/0x seed, modulo64bits. Text16MiB or rawfile1TiB using stable source suffix initialization and bounded worker processing. Noncryptographic. HTTPupload or MCP authorizedfile. Returns four encodings.",
  inputSchema: citySchema,
  outputSchema: resultSchema,
  bodyLimit: 110000000,
  idempotent: true,
  async run(value, signal, context) {
    const p = citySchema.parse(value),
      parsed = parseCitySeed(p.seed),
      abort = signal ?? new AbortController().signal;
    abort.throwIfAborted();
    if (active >= 2) throw new StreamHashError("busy");
    active++;
    try {
      if ("text" in p)
        return await runCityBlob(
          new Blob([textBytes(p.text)]),
          parsed,
          abort,
          undefined,
          import.meta.env.PROD
            ? () =>
                new Worker(
                  serviceWorkerUrl("legacy-hashes-worker", import.meta.url),
                  { type: "module" },
                )
            : undefined,
        );
      if (!context) throw new StreamHashError("invalid_input");
      if ("inputPath" in p) {
        if (context.transport !== "mcp")
          throw new StreamHashError("invalid_input");
        return await runCityFile(
          p.inputPath,
          parsed,
          abort,
          context.inputRoots ?? [],
        );
      }
      const record = await context.artifacts.get(p.uploadId, "upload");
      return await runCityFile(record.path, parsed, abort, null);
    } finally {
      active--;
    }
  },
};
export const highwayOperation: Operation = {
  id: "highwayhash-hash-text-or-file",
  name: "tooltab_highwayhash_hash_text_or_file",
  description:
    "HighwayHash64/128/256, optional32bytehexkey; blank uses public all-zero default. Text16MiB or streamingrawfile1TiB in cancellable local WASM Worker. Four digest encodings; no keys returned or saved.",
  inputSchema: highwaySchema,
  outputSchema: resultSchema,
  bodyLimit: 110000000,
  idempotent: true,
  async run(value, signal, context) {
    const p = highwaySchema.parse(value),
      parsed = parseHighwayKey(p.key),
      abort = signal ?? new AbortController().signal;
    abort.throwIfAborted();
    if (active >= 2) throw new StreamHashError("busy");
    active++;
    try {
      return await runServiceStreamHash(
        `HighwayHash-${p.outputSize}`,
        resolveSource(p, abort, context),
        abort,
        undefined,
        0n,
        parsed,
      );
    } finally {
      parsed?.fill(0);
      active--;
    }
  },
};
export const cityHighwayOperations = [cityOperation, highwayOperation];
