import { createReadStream } from "node:fs";
import * as z from "zod/v4";
import {
  KdfError,
  MAX_SALT,
  randomSalt,
  validateJob,
} from "@workspace/tools/crypto/kdf";
import { runKdf } from "@/features/tools/kdf-tools/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const source = z.union([
  z.strictObject({
    text: z.string().max(MAX_SALT * 2),
    format: z.enum(["utf-8", "hex", "base64"]).default("utf-8"),
  }),
  z.strictObject({ uploadId: z.uuid() }),
  z.strictObject({ inputPath: z.string().min(1).max(4096) }),
]);
const common = {
  password: z.string().max(1048576),
  salt: source.optional(),
  lengthBytes: z.number().int().min(16).max(256).default(32),
};
export const pbkdf2Schema = z.strictObject({
  ...common,
  hash: z.enum(["SHA-1", "SHA-256", "SHA-384", "SHA-512"]).default("SHA-256"),
  iterations: z.number().int().min(1).max(1000000).default(100000),
});
export const scryptSchema = z.strictObject({
  ...common,
  costFactor: z.number().int().min(2).max(524288).default(16384),
  blockSize: z.number().int().min(1).max(64).default(8),
  parallelism: z.number().int().min(1).max(32).default(1),
});
export const pbkdf2HttpSchema = pbkdf2Schema.extend({
  salt: z.union([source.options[0], source.options[1]]).optional(),
});
export const scryptHttpSchema = scryptSchema.extend({
  salt: z.union([source.options[0], source.options[1]]).optional(),
});
async function resolveSalt(
  input: z.infer<typeof source> | undefined,
  signal: AbortSignal,
  context?: WebpContext,
) {
  if (!input) {
    const generated = randomSalt("base64");
    return {
      salt: generated,
      saltFormat: "base64" as const,
      randomSaltBase64: generated,
    };
  }
  if ("text" in input)
    return {
      salt: input.text,
      saltFormat: input.format,
      randomSaltBase64: null,
    };
  if (!context) throw new KdfError("invalid_input");
  let stream: AsyncIterable<Uint8Array>;
  if ("inputPath" in input) {
    if (context.transport !== "mcp") throw new KdfError("invalid_input");
    stream = streamAuthorizedFile(
      input.inputPath,
      context.inputRoots ?? [],
      signal,
      MAX_SALT,
    );
  } else {
    const record = await context.artifacts.get(input.uploadId, "upload");
    if (record.bytes > MAX_SALT) throw new KdfError("resource_limit");
    stream = createReadStream(record.path, { highWaterMark: 65536, signal });
  }
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  for await (const chunk of stream) {
    signal.throwIfAborted();
    length += chunk.length;
    if (length > MAX_SALT) throw new KdfError("resource_limit");
    chunks.push(new Uint8Array(chunk));
  }
  return {
    salt: new Blob(chunks),
    saltFormat: "base64" as const,
    randomSaltBase64: null,
  };
}
const output = z.strictObject({
  hex: z.string(),
  base64: z.string(),
  saltBytes: z.number().int(),
  lengthBytes: z.number().int(),
  memoryBytes: z.number().int().nullable(),
  randomSaltBase64: z.string().nullable(),
});
let active = false;
export const kdfToolOperations: Operation[] = [
  {
    id: "pbkdf2-key-derivation",
    name: "tooltab_pbkdf2_key_derivation",
    description:
      "PBKDF2 SHA1/256/384/512, iterations1..1M,key16..256bytes. Salt UTF8/hex/Base64, raw upload or authorized MCP file; omit for secure random16bytes. Cancellable Worker120s. Returns hex/Base64.",
    inputSchema: pbkdf2Schema,
    outputSchema: output,
    bodyLimit: 200000000,
    idempotent: false,
    async run(value, signal, context) {
      if (active) throw new KdfError("busy");
      const p = pbkdf2Schema.parse(value);
      validateJob({ ...p, kind: "pbkdf2", salt: "", saltFormat: "utf-8" });
      active = true;
      try {
        const abort = signal ?? new AbortController().signal;
        const salt = await resolveSalt(p.salt, abort, context);
        return {
          ...(await runKdf(
            { ...p, ...salt, kind: "pbkdf2" },
            abort,
            import.meta.env.PROD
              ? () =>
                  new Worker(
                    serviceWorkerUrl("kdf-tools-worker", import.meta.url),
                    { type: "module" },
                  )
              : undefined,
          )),
          randomSaltBase64: salt.randomSaltBase64,
        };
      } finally {
        active = false;
      }
    },
  },
  {
    id: "scrypt-key-derivation",
    name: "tooltab_scrypt_key_derivation",
    description:
      "scrypt Npower2(2..524288),r1..64,p1..32,key16..256bytes;128*N*r<=64MiB. Salt text or raw upload/authorized MCPfile, omitted=random16bytes. Cancellable Worker120s.",
    inputSchema: scryptSchema,
    outputSchema: output,
    bodyLimit: 200000000,
    idempotent: false,
    async run(value, signal, context) {
      if (active) throw new KdfError("busy");
      const p = scryptSchema.parse(value);
      validateJob({ ...p, kind: "scrypt", salt: "", saltFormat: "utf-8" });
      active = true;
      try {
        const abort = signal ?? new AbortController().signal;
        const salt = await resolveSalt(p.salt, abort, context);
        return {
          ...(await runKdf(
            { ...p, ...salt, kind: "scrypt" },
            abort,
            import.meta.env.PROD
              ? () =>
                  new Worker(
                    serviceWorkerUrl("kdf-tools-worker", import.meta.url),
                    { type: "module" },
                  )
              : undefined,
          )),
          randomSaltBase64: salt.randomSaltBase64,
        };
      } finally {
        active = false;
      }
    },
  },
];
