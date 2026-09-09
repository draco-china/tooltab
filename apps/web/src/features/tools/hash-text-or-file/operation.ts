import {
  hashTextBytes,
  MAX_HASH_FILE_BYTES,
  ShaHashError,
} from "@workspace/tools/hash/sha-input";
import { formatHash } from "@workspace/tools/hash/format";
import * as z from "zod/v4";
import { automationToolNames } from "../../../lib/automation-catalog";
import type { Operation } from "../../api/runtime/operation-contract";
import { hashBytes } from "@workspace/tools/hash/sha";
export const MAX_HASH_BASE64 = 4 * Math.ceil(MAX_HASH_FILE_BYTES / 3);
export const shaInputSchema = z.strictObject({
  input: z.string().max(MAX_HASH_BASE64),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
  format: z.enum(["hex", "base64", "decimal", "binary"]).default("hex"),
});
export class HashBytesEncodingError extends Error {}
export function rawHashBytes(input: string): Uint8Array<ArrayBuffer> {
  if (input.length > MAX_HASH_BASE64) throw new ShaHashError("too-large");
  // Buffer's decoder is permissive; enforce canonical alphabet, padding and pad bits.
  if (input.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(input))
    throw new HashBytesEncodingError();
  const bytes = Buffer.from(input, "base64");
  if (bytes.toString("base64") !== input) throw new HashBytesEncodingError();
  if (bytes.length > MAX_HASH_FILE_BYTES) throw new ShaHashError("too-large");
  return new Uint8Array(bytes);
}
export const shaDefinitions = [
  ["sha1-hash-text-or-file", "SHA-1"],
  ["sha256-hash-text-or-file", "SHA-256"],
  ["sha384-hash-text-or-file", "SHA-384"],
  ["sha512-hash-text-or-file", "SHA-512"],
  ["sha224-hash-text-or-file", "SHA-224"],
  ["sha512-224-hash-text-or-file", "SHA-512/224"],
  ["sha512-256-hash-text-or-file", "SHA-512/256"],
  ["sha3-224-hash-text-or-file", "SHA3-224"],
  ["sha3-256-hash-text-or-file", "SHA3-256"],
  ["sha3-384-hash-text-or-file", "SHA3-384"],
  ["sha3-512-hash-text-or-file", "SHA3-512"],
  ["shake128-hash-text-or-file", "SHAKE128"],
  ["shake256-hash-text-or-file", "SHAKE256"],
] as const;
export const shaPathSchema = z.strictObject({
  inputPath: z.string().min(1).max(4096),
  format: z.enum(["hex", "base64", "decimal", "binary"]).default("hex"),
});
export function shaSchemas(id: string) {
  const definition = shaDefinitions.find(([key]) => key === id);
  if (!definition) throw Error("Unknown SHA tool");
  const algorithm = definition[1];
  const shake = algorithm === "SHAKE128" || algorithm === "SHAKE256";
  const outputBits = z
    .number()
    .int()
    .min(8)
    .max(65536)
    .multipleOf(8)
    .default(algorithm === "SHAKE128" ? 256 : 512);
  const inline = shake ? shaInputSchema.extend({ outputBits }) : shaInputSchema;
  const path = shake ? shaPathSchema.extend({ outputBits }) : shaPathSchema;
  return { algorithm, inline, path, mcp: z.union([inline, path]) };
}
export const shaOperations: Operation[] = shaDefinitions.map(
  ([id, algorithm]) => {
    const schemas = shaSchemas(id);
    return {
      id,
      name: automationToolNames[id],
      description: `Compute ${algorithm} locally from UTF-8 text (4 MiB) or canonical Base64 carrying raw bytes (32 MiB). No file path access. Supports hex, Base64, big-endian unsigned decimal and padded binary output.${algorithm.startsWith("SHAKE") ? " outputBits is 8–65536 in multiples of 8; default SHAKE128=256, SHAKE256=512." : ""}${algorithm === "SHA-1" ? " SHA-1 is unsuitable for collision-resistant security uses." : ""}`,
      inputSchema: schemas.inline,
      outputSchema: z.strictObject({
        algorithm: z.string(),
        format: z.string(),
        bytes: z.number().int().nonnegative(),
        output: z.string(),
        outputBits: z.number().int().positive(),
      }),
      bodyLimit: MAX_HASH_BASE64 + 1024,
      idempotent: true,
      async run(input, signal) {
        const args = schemas.inline.parse(input);
        const bytes =
          args.encoding === "utf8"
            ? hashTextBytes(args.input)
            : rawHashBytes(args.input);
        const digest = await hashBytes(
          algorithm,
          bytes,
          signal,
          "outputBits" in args ? (args.outputBits as number) : undefined,
        );
        return {
          algorithm,
          format: args.format,
          bytes: bytes.length,
          output: formatHash(digest, args.format),
          outputBits: digest.length * 8,
        };
      },
    };
  },
);
export async function hashAuthorizedPath(
  id: string,
  input: unknown,
  roots: readonly string[],
  signal?: AbortSignal,
) {
  const schemas = shaSchemas(id);
  const args = schemas.path.parse(input);
  const { readAuthorizedFile } = await import("../../api/runtime/files");
  const bytes = await readAuthorizedFile(args.inputPath, roots, signal);
  const digest = await hashBytes(
    schemas.algorithm,
    bytes,
    signal,
    "outputBits" in args ? (args.outputBits as number) : undefined,
  );
  return {
    algorithm: schemas.algorithm,
    format: args.format,
    bytes: bytes.length,
    output: formatHash(digest, args.format),
    outputBits: digest.length * 8,
  };
}
