import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import { MAX_INLINE_BASE64, runMd5Request } from "./service";

const format = z.enum(["hex", "base64", "decimal", "binary"]).default("hex");
export const md5InlineSchema = z.strictObject({
  input: z.string().max(MAX_INLINE_BASE64),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
  format,
});
const md5UploadSchema = z.strictObject({ uploadId: z.uuid(), format });
const md5PathSchema = z.strictObject({
  inputPath: z.string().min(1).max(4096),
  format,
});

export const md5HttpSchema = z.union([md5InlineSchema, md5UploadSchema]);
export const md5McpSchema = z.union([
  md5InlineSchema,
  md5UploadSchema,
  md5PathSchema,
]);

export const md5Operation: Operation = {
  id: "md5-hash-text-or-file",
  name: "tooltab_md5_hash_text_or_file",
  description:
    "Compute MD5 from UTF-8 text or Base64 bytes with hexadecimal, Base64, unsigned decimal, or padded binary output. Supports HTTP uploads and authorized MCP file paths. MD5 is for legacy compatibility and non-security-critical checks only.",
  inputSchema: md5HttpSchema,
  outputSchema: z.strictObject({
    algorithm: z.literal("MD5"),
    format: z.enum(["hex", "base64", "decimal", "binary"]),
    bytes: z.number().int().nonnegative(),
    outputBits: z.literal(128),
    output: z.string(),
  }),
  bodyLimit: MAX_INLINE_BASE64 + 2048,
  idempotent: true,
  async run(input, signal, context) {
    const schema = context?.transport === "mcp" ? md5McpSchema : md5HttpSchema;
    const value = schema.parse(input);
    const { format: outputFormat, ...source } = value;
    return runMd5Request(source, outputFormat, signal, context);
  },
};
