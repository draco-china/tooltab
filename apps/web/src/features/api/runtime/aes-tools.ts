import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import * as z from "zod/v4";
import {
  type AesResult,
  aesDownloadName,
} from "@/features/tools/aes-tools/jobs";
import {
  AES_MODES,
  AesToolError,
  fromBase64,
  MAX_AES_BYTES,
  MAX_AES_ENVELOPE,
  PBKDF_HASHES,
  toBase64,
  utf8,
} from "@workspace/tools/crypto/aes";
import { runAesWorker } from "@/features/tools/aes-tools/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const text = z.string().max(MAX_AES_ENVELOPE),
  upload = z.string().min(1),
  path = z.string().min(1).max(4096),
  secret = z.string().max(1048576),
  delivery = z.enum(["inline", "artifact"]).default("inline");
const sources = { input: text.optional(), inputUploadId: upload.optional() },
  sourcePath = { inputPath: path.optional() };
const exactly = (p: {
  input?: string;
  inputUploadId?: string;
  inputPath?: string;
}) =>
  [p.input, p.inputUploadId, p.inputPath].filter((x) => x !== undefined)
    .length === 1;
const encryptShape = {
  ...sources,
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
  fileName: z.string().max(4096).optional(),
  mimeType: z.string().max(1024).optional(),
  mode: z.enum(AES_MODES).default("GCM"),
  keyLengthBits: z
    .union([z.literal(128), z.literal(192), z.literal(256)])
    .default(256),
  keySource: z.enum(["password", "raw"]).default("password"),
  password: secret.optional(),
  rawKeyHex: secret.optional(),
  pbkdf2Hash: z.enum(PBKDF_HASHES).default("SHA-256"),
  pbkdf2Iterations: z.number().int().min(1000).max(10000000).default(210000),
  delivery,
};
const decryptShape = {
  ...sources,
  password: secret.optional(),
  rawKeyHex: secret.optional(),
  delivery,
};
const material = (p: { password?: string; rawKeyHex?: string }) =>
  [p.password, p.rawKeyHex].filter((x) => x !== undefined).length === 1;
const encryptMaterial = (p: {
  keySource: "password" | "raw";
  password?: string;
  rawKeyHex?: string;
}) =>
  material(p) &&
  (p.keySource === "password"
    ? p.password !== undefined
    : p.rawKeyHex !== undefined);
export const aesEncryptInputSchema = z
  .strictObject(encryptShape)
  .refine(exactly)
  .refine(encryptMaterial);
export const aesEncryptMcpInputSchema = z
  .strictObject({ ...encryptShape, ...sourcePath })
  .refine(exactly)
  .refine(encryptMaterial);
export const aesDecryptInputSchema = z
  .strictObject(decryptShape)
  .refine(exactly)
  .refine(material);
export const aesDecryptMcpInputSchema = z
  .strictObject({ ...decryptShape, ...sourcePath })
  .refine(exactly)
  .refine(material);
const metadata = z.union([
  z.strictObject({ type: z.literal("text") }),
  z.strictObject({
    type: z.literal("file"),
    name: z.string(),
    mimeType: z.string(),
    size: z.number(),
  }),
]);
const artifact = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  path: z.string().optional(),
  downloadUrl: z.string().optional(),
});
const summary = {
  algorithm: z.enum(["AES-GCM", "AES-CBC", "AES-CTR"]),
  metadata,
  authenticated: z.boolean(),
  metadataAuthenticated: z.literal(false),
  bytes: z.number(),
};
export const aesOutputSchema = z.union([
  z.strictObject({
    kind: z.literal("encrypted"),
    ...summary,
    delivery: z.literal("inline"),
    json: z.string(),
  }),
  z.strictObject({
    kind: z.literal("encrypted"),
    ...summary,
    delivery: z.literal("artifact"),
    artifact,
  }),
  z.strictObject({
    kind: z.literal("decrypted"),
    ...summary,
    delivery: z.literal("inline"),
    sizeMatches: z.boolean().nullable(),
    encoding: z.enum(["utf8", "base64"]),
    output: z.string(),
  }),
  z.strictObject({
    kind: z.literal("decrypted"),
    ...summary,
    delivery: z.literal("artifact"),
    sizeMatches: z.boolean().nullable(),
    artifact,
  }),
]);
async function fileSource(
  uploadId: string | undefined,
  inputPath: string | undefined,
  limit: number,
  signal: AbortSignal | undefined,
  roots: readonly string[],
  context?: WebpContext,
) {
  if (inputPath) {
    if (context?.transport === "http") throw new AesToolError("invalid_input");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const part of streamAuthorizedFile(
      inputPath,
      roots,
      signal,
      limit,
    )) {
      size += part.length;
      chunks.push(part);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return {
      bytes,
      name: basename(inputPath),
      mimeType: "application/octet-stream",
    };
  }
  if (!uploadId || !context) throw new AesToolError("invalid_input");
  const record = await context.artifacts.get(uploadId, "upload");
  if (record.bytes > limit) throw new AesToolError("too_large");
  const bytes = new Uint8Array(await readFile(record.path, { signal }));
  if (bytes.length > limit) throw new AesToolError("too_large");
  return { bytes, name: record.filename, mimeType: record.mimeType };
}
let active = false;
export async function runAesTool(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (active) throw new AesToolError("busy");
  active = true;
  let saved: string | undefined;
  try {
    let result: AesResult, requested: "inline" | "artifact";
    if (id === "aes-encryptor") {
      const p = aesEncryptMcpInputSchema.parse(input);
      requested = p.delivery;
      const source =
        p.input !== undefined
          ? {
              bytes:
                p.encoding === "utf8"
                  ? utf8(p.input)
                  : fromBase64(p.input, MAX_AES_BYTES),
              name: p.fileName ?? "input.bin",
              mimeType: p.mimeType ?? "application/octet-stream",
            }
          : await fileSource(
              p.inputUploadId,
              p.inputPath,
              MAX_AES_BYTES,
              signal,
              roots,
              context,
            );
      if (source.bytes.length > MAX_AES_BYTES)
        throw new AesToolError("too_large");
      const isFile =
        p.input === undefined ||
        p.encoding === "base64" ||
        p.fileName !== undefined;
      result = await runAesWorker(
        {
          kind: "encrypt",
          input: source.bytes,
          options: p,
          metadata: isFile
            ? {
                type: "file",
                name: p.fileName ?? source.name,
                mimeType: p.mimeType ?? source.mimeType,
                size: source.bytes.length,
              }
            : { type: "text" },
        },
        signal,
        undefined,
        import.meta.env.PROD
          ? () =>
              new Worker(serviceWorkerUrl("aes-worker", import.meta.url), {
                type: "module",
              })
          : undefined,
      );
    } else if (id === "aes-decryptor") {
      const p = aesDecryptMcpInputSchema.parse(input);
      requested = p.delivery;
      let source = p.input;
      if (source === undefined) {
        const file = await fileSource(
          p.inputUploadId,
          p.inputPath,
          MAX_AES_ENVELOPE,
          signal,
          roots,
          context,
        );
        try {
          source = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
        } catch {
          throw new AesToolError("read_failed");
        }
      }
      result = await runAesWorker(
        { kind: "decrypt", input: source, material: p },
        signal,
        undefined,
        import.meta.env.PROD
          ? () =>
              new Worker(serviceWorkerUrl("aes-worker", import.meta.url), {
                type: "module",
              })
          : undefined,
      );
    } else throw new AesToolError("invalid_options");
    signal?.throwIfAborted();
    if (result.kind === "inspected") throw new AesToolError("invalid_input");
    const completed = result;
    const byteCount =
        completed.kind === "encrypted"
          ? completed.outputBytes
          : completed.bytes.length,
      meta = {
        algorithm: completed.algorithm,
        metadata: completed.metadata,
        authenticated: completed.algorithm === "AES-GCM",
        metadataAuthenticated: false as const,
        bytes: byteCount,
      };
    if (requested === "inline") {
      if (byteCount > 16384) throw new AesToolError("artifact_required");
      const output =
        completed.kind === "encrypted"
          ? {
              kind: "encrypted" as const,
              ...meta,
              delivery: "inline" as const,
              json: completed.json,
            }
          : {
              kind: "decrypted" as const,
              ...meta,
              delivery: "inline" as const,
              sizeMatches: completed.sizeMatches,
              encoding:
                completed.text === null
                  ? ("base64" as const)
                  : ("utf8" as const),
              output: completed.text ?? toBase64(completed.bytes),
            };
      if (utf8(JSON.stringify(output)).length > 65536)
        throw new AesToolError("artifact_required");
      return output;
    }
    if (!context) throw new AesToolError("artifact_required");
    const filename =
        completed.kind === "encrypted"
          ? "encrypted.aes.json"
          : completed.metadata.type === "file"
            ? aesDownloadName(completed.metadata.name)
            : completed.text === null
              ? "decrypted.bin"
              : "decrypted.txt",
      mimeType =
        completed.kind === "encrypted"
          ? "application/json"
          : completed.metadata.type === "file" || completed.text === null
            ? "application/octet-stream"
            : "text/plain;charset=utf-8";
    const record = await context.artifacts.write(
      (async function* () {
        if (completed.kind === "encrypted") {
          for (let i = 0; i < completed.json.length; ) {
            signal?.throwIfAborted();
            let end = Math.min(i + 65536, completed.json.length);
            if (
              end < completed.json.length &&
              /[\uD800-\uDBFF]/.test(completed.json[end - 1] ?? "")
            )
              end--;
            yield utf8(completed.json.slice(i, end));
            i = end;
          }
        } else
          for (let i = 0; i < completed.bytes.length; i += 65536) {
            signal?.throwIfAborted();
            yield completed.bytes.subarray(i, i + 65536);
          }
      })(),
      {
        limit:
          completed.kind === "encrypted" ? MAX_AES_ENVELOPE : MAX_AES_BYTES,
        filename,
        mimeType,
      },
      signal,
    );
    saved = record.id;
    signal?.throwIfAborted();
    const { id: artifactId, bytes: size, expiresAt } = record;
    const out = {
      id: artifactId,
      bytes: size,
      filename,
      mimeType,
      expiresAt,
      ...(context.transport === "mcp"
        ? { path: record.path }
        : { downloadUrl: `/api/v1/artifacts/${artifactId}` }),
    };
    return completed.kind === "encrypted"
      ? {
          kind: "encrypted" as const,
          ...meta,
          delivery: "artifact" as const,
          artifact: out,
        }
      : {
          kind: "decrypted" as const,
          ...meta,
          delivery: "artifact" as const,
          sizeMatches: completed.sizeMatches,
          artifact: out,
        };
  } catch (e) {
    if (saved && context) await context.artifacts.remove(saved).catch(() => {});
    throw e;
  } finally {
    active = false;
  }
}
export const aesOperations: Operation[] = [
  {
    id: "aes-encryptor",
    name: "tooltab_aes_encryptor",
    description:
      "Encrypt UTF-8 text or raw file bytes as an interoperable inbrowser-aes-v1 JSON envelope. GCM/CBC/CTR; 128/192/256-bit raw hex or PBKDF2 passwords with SHA256/384/512 and 1000–10000000 iterations. Fresh random salt/IV, no secret persistence. GCM authenticates ciphertext only; metadata is unbound and CBC/CTR lack authentication. 32MiB input/48MiB envelope, 60-second terminable Worker; explicit artifact delivery for large output.",
    inputSchema: aesEncryptInputSchema,
    outputSchema: aesOutputSchema,
    bodyLimit: MAX_AES_ENVELOPE * 6 + 7 * 1048576,
    idempotent: false,
    run(input, signal, context) {
      return runAesTool(
        "aes-encryptor",
        aesEncryptInputSchema.parse(input),
        signal,
        [],
        context,
      );
    },
  },
  {
    id: "aes-decryptor",
    name: "tooltab_aes_decryptor",
    description:
      "Decrypt compatible inbrowser-aes-v1 envelopes with original password or raw key. No plaintext on GCM authentication failure. CBC/CTR success does not prove key correctness/integrity; filename/type/size metadata is not authenticated. Up to48MiB JSON and32MiB restored bytes; explicit artifact delivery required above16KiB, no automatic plaintext files. Metadata filenames are sanitized and file downloads use octet-stream.",
    inputSchema: aesDecryptInputSchema,
    outputSchema: aesOutputSchema,
    bodyLimit: MAX_AES_ENVELOPE * 6 + 7 * 1048576,
    idempotent: false,
    run(input, signal, context) {
      return runAesTool(
        "aes-decryptor",
        aesDecryptInputSchema.parse(input),
        signal,
        [],
        context,
      );
    },
  },
];
