import * as z from "zod/v4";
import {
  BaseEncodingError,
  type BaseEncodingOptions,
  baseBytesText,
  baseSourceText,
  baseTextBytes,
  decodeBase,
  encodeBase,
  MAX_BASE_BYTES,
  MAX_BASE_SOURCE_CHARACTERS,
} from "@workspace/tools/encoding/base";
import {
  type BaseWorkerResult,
  runBaseWorker,
} from "@/features/tools/base-encoding/worker-client";
import { rawHashBytes } from "@/features/tools/hash-text-or-file/operation";
import { serviceWorkerUrl } from "./worker-url";
export const baseEncodingDefinitions = [
  ["base16-encoder", "base16", false],
  ["base16-decoder", "base16", true],
  ["base32-encoder", "base32", false],
  ["base32-decoder", "base32", true],
  ["base58-encoder", "base58", false],
  ["base58-decoder", "base58", true],
  ["base85-encoder", "base85", false],
  ["base85-decoder", "base85", true],
] as const;
export const baseEncodingOutputSchema = z.strictObject({
  output: z.string(),
  encoding: z.enum(["base16", "base32", "base58", "base85", "utf8", "base64"]),
  bytes: z.number().int().nonnegative(),
});
export function baseEncodingSchemas(id: string) {
  const definition = baseEncodingDefinitions.find(([slug]) => slug === id);
  if (!definition) throw new Error("Unknown base-encoding tool");
  const [, kind, decode] = definition;
  const config =
    kind === "base58"
      ? z.strictObject({
          alphabet: z.enum(["bitcoin", "flickr", "ripple"]).default("bitcoin"),
        })
      : kind === "base85"
        ? z.strictObject({
            variant: z.enum(["ascii85", "z85"]).default("ascii85"),
          })
        : kind === "base32" && !decode
          ? z.strictObject({ padding: z.boolean().default(true) })
          : z.strictObject({});
  const options = decode
    ? config.extend({
        outputEncoding: z.enum(["utf8", "base64"]).default("utf8"),
      })
    : config;
  const inline = decode
    ? options.extend({ input: z.string().max(MAX_BASE_SOURCE_CHARACTERS) })
    : options.extend({
        input: z.string().max(4 * Math.ceil(MAX_BASE_BYTES / 3)),
        encoding: z.enum(["utf8", "base64"]).default("utf8"),
      });
  const path = options.extend({ inputPath: z.string().min(1).max(4096) });
  return { kind, decode, inline, path, options, mcp: z.union([inline, path]) };
}
export type BaseEncodingResult = z.infer<typeof baseEncodingOutputSchema>;
type SyncBaseId =
  | "base16-encoder"
  | "base16-decoder"
  | "base32-encoder"
  | "base32-decoder";
export function runBaseEncodingFromBytes(
  id: string,
  bytes: Uint8Array<ArrayBuffer>,
  input: unknown,
  signal?: AbortSignal,
): BaseEncodingResult | Promise<BaseEncodingResult> {
  signal?.throwIfAborted();
  const { kind, decode, options } = baseEncodingSchemas(id);
  const args = options.parse(input);
  const params: BaseEncodingOptions = {
    alphabet:
      "alphabet" in args
        ? (args.alphabet as BaseEncodingOptions["alphabet"])
        : undefined,
    variant:
      "variant" in args
        ? (args.variant as BaseEncodingOptions["variant"])
        : undefined,
  };
  const padding = "padding" in args ? (args.padding as boolean) : true;
  const finish = (result: BaseWorkerResult): BaseEncodingResult => {
    if ("encoded" in result)
      return { output: result.encoded, encoding: kind, bytes: bytes.length };
    const outputEncoding =
      "outputEncoding" in args
        ? (args.outputEncoding as "utf8" | "base64")
        : "utf8";
    try {
      return {
        output:
          outputEncoding === "utf8"
            ? baseBytesText(result.decoded)
            : Buffer.from(result.decoded).toString("base64"),
        encoding: outputEncoding,
        bytes: result.decoded.length,
      };
    } finally {
      result.decoded.fill(0);
    }
  };
  if (kind === "base58" || kind === "base85")
    return runBaseWorker(
      decode
        ? { kind, decode: true, source: baseSourceText(bytes), options: params }
        : { kind, decode: false, bytes, padding, options: params },
      signal,
      import.meta.env.PROD
        ? () =>
            new Worker(
              serviceWorkerUrl("base-encoding-worker", import.meta.url),
              { type: "module" },
            )
        : undefined,
    ).then(finish);
  return finish(
    decode
      ? { decoded: decodeBase(baseSourceText(bytes), kind, params) }
      : { encoded: encodeBase(bytes, kind, padding, params) },
  );
}
export function runBaseEncoding(
  id: SyncBaseId,
  input: unknown,
  signal?: AbortSignal,
): BaseEncodingResult;
export function runBaseEncoding(
  id: string,
  input: unknown,
  signal?: AbortSignal,
): BaseEncodingResult | Promise<BaseEncodingResult>;
export function runBaseEncoding(
  id: string,
  input: unknown,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const { decode, inline } = baseEncodingSchemas(id);
  const args = inline.parse(input);
  const { input: content, ...rest } = args;
  let bytes: Uint8Array<ArrayBuffer>;
  if (decode) bytes = new TextEncoder().encode(content);
  else if ("encoding" in rest && rest.encoding === "base64") {
    bytes = rawHashBytes(content);
    if (bytes.length > MAX_BASE_BYTES) throw new BaseEncodingError("too-large");
  } else bytes = baseTextBytes(content);
  const options = { ...rest };
  if ("encoding" in options) delete options.encoding;
  try {
    const result = runBaseEncodingFromBytes(id, bytes, options, signal);
    if (result instanceof Promise) return result.finally(() => bytes.fill(0));
    bytes.fill(0);
    return result;
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}
export async function runBaseEncodingPath(
  id: string,
  input: unknown,
  roots: readonly string[],
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const { inputPath, ...options } = baseEncodingSchemas(id).path.parse(input);
  const { readAuthorizedFile } = await import("./files");
  const bytes = await readAuthorizedFile(inputPath, roots, signal);
  try {
    signal?.throwIfAborted();
    return await runBaseEncodingFromBytes(id, bytes, options, signal);
  } finally {
    bytes.fill(0);
  }
}
