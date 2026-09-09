import * as z from "zod/v4";
import { decodeHtmlText, encodeHtmlText } from "@workspace/tools/encoding/html";
import {
  escapeUnicode,
  unescapeUnicode,
  UNICODE_FORMATS,
  MAX_CODEC_TEXT,
  MAX_CODEC_ENCODED,
} from "@workspace/tools/encoding/unicode";
import { rotateText } from "@workspace/tools/encoding/rot";
import type { Operation } from "./operation-contract";

const html = z.strictObject({
  input: z.string().max(MAX_CODEC_ENCODED),
  direction: z.enum(["encode", "decode"]),
  format: z.enum(["named", "decimal", "hex"]).default("named"),
  range: z.enum(["minimal", "non-ascii", "all-special"]).default("minimal"),
});
const unicode = z.strictObject({
  input: z.string().max(MAX_CODEC_ENCODED),
  direction: z.enum(["escape", "unescape"]),
  format: z.enum(UNICODE_FORMATS).default("utf16"),
});
const rot = z.strictObject({
  input: z.string().max(MAX_CODEC_TEXT),
  type: z
    .union([z.literal(13), z.literal(5), z.literal(18), z.literal(47)])
    .default(13),
});
const output = z.strictObject({ output: z.string() });
export const textCodecOperations: Operation[] = [
  {
    id: "html-entity-encoder-decoder",
    name: "tooltab_html_entity_encoder_decoder",
    description:
      "Encode full-table named or numeric HTML entities and decode semicolon-terminated references without rendering HTML. Unknown/invalid entities remain unchanged.",
    inputSchema: html,
    outputSchema: output,
    bodyLimit: 20000000,
    idempotent: true,
    run(input) {
      const a = html.parse(input);
      return {
        output:
          a.direction === "encode"
            ? encodeHtmlText(a.input, a.format, a.range)
            : decodeHtmlText(a.input),
      };
    },
  },
  {
    id: "unicode-escape-unescape",
    name: "tooltab_unicode_escape_unescape",
    description:
      "Escape Unicode in nine formats; unescape mixed notation strictly without executing code. U+/0x formats are complete code-point lists.",
    inputSchema: unicode,
    outputSchema: output,
    bodyLimit: 20000000,
    idempotent: true,
    run(input) {
      const a = unicode.parse(input);
      return {
        output:
          a.direction === "escape"
            ? escapeUnicode(a.input, a.format)
            : unescapeUnicode(a.input),
      };
    },
  },
  {
    id: "rot-cipher",
    name: "tooltab_rot_cipher",
    description:
      "Apply self-reversing ROT13/5/18/47 to ASCII; leaves other Unicode unchanged. Obfuscation only, not secure encryption.",
    inputSchema: rot,
    outputSchema: output,
    bodyLimit: 700000,
    idempotent: true,
    run(input) {
      const a = rot.parse(input);
      return { output: rotateText(a.input, a.type) };
    },
  },
];
