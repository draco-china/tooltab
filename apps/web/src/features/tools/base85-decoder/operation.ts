import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import { MAX_BASE85_SOURCE_CHARACTERS } from "./logic";
import { decodeBase85Path, decodeBase85Result } from "./service";

export const base85DecoderInputSchema = z.strictObject({
  input: z.string().max(MAX_BASE85_SOURCE_CHARACTERS),
  variant: z.enum(["ascii85", "z85"]).default("ascii85"),
  outputEncoding: z.enum(["utf8", "base64"]).default("utf8"),
});
export const base85DecoderPathSchema = z.strictObject({
  inputPath: z.string().min(1).max(4096),
  variant: z.enum(["ascii85", "z85"]).default("ascii85"),
  outputEncoding: z.enum(["utf8", "base64"]).default("utf8"),
});
export const base85DecoderMcpSchema = z.union([
  base85DecoderInputSchema,
  base85DecoderPathSchema,
]);

export const base85DecoderOperation: Operation = {
  id: "base85-decoder",
  name: "tooltab_base85_decoder",
  description:
    "Decode ASCII85 or Z85 text into UTF-8 or Base64-encoded raw bytes. ASCII85 accepts paired delimiters and z shorthand; Z85 requires complete five-character groups.",
  inputSchema: base85DecoderInputSchema,
  outputSchema: z.strictObject({
    output: z.string(),
    encoding: z.enum(["utf8", "base64"]),
    bytes: z.number().int().nonnegative(),
  }),
  bodyLimit: 4200000,
  idempotent: true,
  run(input, signal, context) {
    signal?.throwIfAborted();
    const schema =
      context?.transport === "mcp"
        ? base85DecoderMcpSchema
        : base85DecoderInputSchema;
    const value = schema.parse(input);
    if ("inputPath" in value) {
      return decodeBase85Path(
        value.inputPath,
        context?.inputRoots ?? [],
        value.variant,
        value.outputEncoding,
        signal,
      );
    }
    return decodeBase85Result(value.input, value.variant, value.outputEncoding);
  },
};
