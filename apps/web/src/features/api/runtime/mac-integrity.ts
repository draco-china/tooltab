import { hashTextBytes } from "@workspace/tools/hash/sha-input";

import * as z from "zod/v4";
import {
  MAX_HASH_BASE64,
  rawHashBytes,
} from "@/features/tools/hash-text-or-file/operation";
import {
  generateHmac,
  HMAC_ALGORITHMS,
  integrityKey,
} from "@workspace/tools/hash/integrity";
import {
  generateSri,
  type IntegritySource,
  verifySri,
} from "@workspace/tools/hash/integrity";
import { streamAuthorizedFile } from "./files";

const carrier = {
  input: z.string().max(MAX_HASH_BASE64),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
};
const path = { inputPath: z.string().min(1).max(4096) };
const hmacOptions = {
  key: z.string().max(2 * 1024 * 1024),
  keyEncoding: z.enum(["utf8", "hex", "base64"]).default("utf8"),
  algorithm: z.enum(HMAC_ALGORITHMS).default("SHA-256"),
};
const sriOptions = { metadata: z.string().max(65536).optional() };
export const integrityDefinitions = [
  "hmac-generator",
  "sri-hash-generator",
] as const;
export function integritySchemas(id: string) {
  const options = id === "hmac-generator" ? hmacOptions : sriOptions;
  const inline = z.strictObject({ ...carrier, ...options }),
    file = z.strictObject({ ...path, ...options });
  return { inline, path: file, mcp: z.union([inline, file]) };
}
export const hmacOutputSchema = z.strictObject({
  algorithm: z.enum(HMAC_ALGORITHMS),
  bytes: z.number(),
  hex: z.string(),
  base64: z.string(),
});
export const sriOutputSchema = z.strictObject({
  bytes: z.number(),
  sha256: z.string(),
  sha384: z.string(),
  sha512: z.string(),
  verification: z
    .strictObject({
      valid: z.boolean(),
      algorithm: z.enum(["sha256", "sha384", "sha512"]),
    })
    .optional(),
});
export async function runIntegrity(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  roots?: readonly string[],
) {
  signal = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(300000),
  ]);
  signal.throwIfAborted();
  const schema = integritySchemas(id);
  const params = (roots === undefined ? schema.inline : schema.mcp).parse(
    input,
  );
  const source: IntegritySource =
    "inputPath" in params
      ? streamAuthorizedFile(params.inputPath, roots ?? [], signal)
      : params.encoding === "base64"
        ? rawHashBytes(params.input)
        : hashTextBytes(params.input);
  if (id === "hmac-generator") {
    const options = z.object(hmacOptions).parse(params);
    const key = integrityKey(options.key, options.keyEncoding);
    try {
      return await generateHmac(source, key, options.algorithm, signal);
    } finally {
      key.fill(0);
    }
  }
  const { metadata } = z.object(sriOptions).parse(params);
  const data = await generateSri(source, signal);
  return {
    ...data,
    ...(metadata !== undefined
      ? { verification: verifySri(data, metadata) }
      : {}),
  };
}
