import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import { MAX_INLINE_BASE64, runRipemd160Request } from "./service";

const format = z.enum(["hex", "base64", "decimal", "binary"]).default("hex");
export const ripemd160InlineSchema = z.strictObject({
  input: z.string().max(MAX_INLINE_BASE64),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
  format,
});
const upload = z.strictObject({ uploadId: z.uuid(), format });
const path = z.strictObject({ inputPath: z.string().min(1).max(4096), format });
export const ripemd160HttpSchema = z.union([ripemd160InlineSchema, upload]);
export const ripemd160McpSchema = z.union([
  ripemd160InlineSchema,
  upload,
  path,
]);

export const ripemd160Operation: Operation = {
  id: "ripemd160-hash-text-or-file",
  name: "tooltab_ripemd160_hash_text_or_file",
  description:
    "Compute RIPEMD-160 from UTF-8 text, Base64 bytes, uploads, or authorized MCP files and return hexadecimal, Base64, decimal, or binary output.",
  inputSchema: ripemd160HttpSchema,
  outputSchema: z.strictObject({
    algorithm: z.literal("RIPEMD-160"),
    format: z.enum(["hex", "base64", "decimal", "binary"]),
    bytes: z.number().int().nonnegative(),
    outputBits: z.literal(160),
    output: z.string(),
  }),
  bodyLimit: MAX_INLINE_BASE64 + 2048,
  idempotent: true,
  async run(input, signal, context) {
    const schema =
      context?.transport === "mcp" ? ripemd160McpSchema : ripemd160HttpSchema;
    const value = schema.parse(input);
    const { format: outputFormat, ...source } = value;
    return runRipemd160Request(source, outputFormat, signal, context);
  },
};
