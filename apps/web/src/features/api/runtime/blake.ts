import { hashTextBytes } from "@workspace/tools/hash/sha-input";
import { formatHash } from "@workspace/tools/hash/format";
import * as z from "zod/v4";
import { decodeBlakeKey, hashBlakeBytes } from "@workspace/tools/hash/blake";

import {
  rawHashBytes,
  shaInputSchema,
} from "@/features/tools/hash-text-or-file/operation";
export const blakeDefinitions = [
  ["blake2b-hash-text-or-file", "BLAKE2b"],
  ["blake2s-hash-text-or-file", "BLAKE2s"],
  ["blake3-hash-text-or-file", "BLAKE3"],
  ["keccak-hash-text-or-file", "Keccak"],
] as const;
export const blakeOutputSchema = z.strictObject({
  algorithm: z.enum(["BLAKE2b", "BLAKE2s", "BLAKE3", "Keccak"]),
  format: z.enum(["hex", "base64", "decimal", "binary"]),
  bytes: z.number().int().nonnegative(),
  outputBits: z.number().int().positive(),
  output: z.string(),
});
export function blakeSchemas(id: string) {
  const definition = blakeDefinitions.find(([key]) => key === id);
  if (!definition) throw new Error("Unknown BLAKE/Keccak tool");
  const algorithm = definition[1];
  const outputBits =
    algorithm === "Keccak"
      ? z
          .union([
            z.literal(224),
            z.literal(256),
            z.literal(384),
            z.literal(512),
          ])
          .default(256)
      : z
          .number()
          .int()
          .min(8)
          .max(algorithm === "BLAKE2b" ? 512 : 256)
          .multipleOf(8)
          .default(algorithm === "BLAKE2b" ? 512 : 256);
  const inline =
    algorithm === "Keccak"
      ? shaInputSchema.extend({ outputBits })
      : shaInputSchema.extend({
          outputBits,
          keyBase64: z.string().max(88).default(""),
        });
  const options = inline.omit({ input: true, encoding: true });
  const path = options.extend({ inputPath: z.string().min(1).max(4096) });
  return { algorithm, inline, options, path, mcp: z.union([inline, path]) };
}
export async function runBlakeFromBytes(
  id: string,
  bytes: Uint8Array<ArrayBuffer>,
  input: unknown,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const schemas = blakeSchemas(id);
  const args = schemas.options.parse(input);
  const key = decodeBlakeKey(
    "keyBase64" in args && typeof args.keyBase64 === "string"
      ? args.keyBase64
      : "",
  );
  try {
    const digest = await hashBlakeBytes(
      schemas.algorithm,
      bytes,
      { outputBits: args.outputBits, key },
      signal,
    );
    return {
      algorithm: schemas.algorithm,
      format: args.format,
      bytes: bytes.length,
      outputBits: digest.length * 8,
      output: formatHash(digest, args.format),
    };
  } finally {
    key.fill(0);
  }
}
export async function runBlake(
  id: string,
  input: unknown,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const {
    input: content,
    encoding,
    ...options
  } = blakeSchemas(id).inline.parse(input);
  const bytes =
    encoding === "utf8" ? hashTextBytes(content) : rawHashBytes(content);
  try {
    return await runBlakeFromBytes(id, bytes, options, signal);
  } finally {
    bytes.fill(0);
  }
}
/** Only explicit roots authorize local-file access; HTTP continues using inline. */
export async function runBlakePath(
  id: string,
  input: unknown,
  roots: readonly string[],
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const { inputPath, ...options } = blakeSchemas(id).path.parse(input);
  const { readAuthorizedFile } = await import("./files");
  const bytes = await readAuthorizedFile(inputPath, roots, signal);
  try {
    return await runBlakeFromBytes(id, bytes, options, signal);
  } finally {
    bytes.fill(0);
  }
}
