import type { FontName } from "figlet";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ansiCompact from "figlet/importable-fonts/ANSI-Compact.js";
import babyfaceLame from "figlet/importable-fonts/babyface-lame.js";
import babyfaceLeet from "figlet/importable-fonts/babyface-leet.js";
import tmplr from "figlet/importable-fonts/tmplr.js";
import figlet from "figlet/node";
import * as z from "zod/v4";
import { generateAsciiArt } from "@workspace/tools/text/ascii";
import {
  ASCII_INPUT_LIMIT,
  ASCII_OUTPUT_LIMIT,
  AsciiError,
  asciiOptionsSchema,
} from "@workspace/tools/text/ascii";
import type { Operation } from "./operation-contract";

const require = createRequire(import.meta.url);
figlet.defaults({
  fontPath: resolve(dirname(require.resolve("figlet/node")), "../fonts"),
});

export const asciiArtSchema = z.strictObject({
  ...asciiOptionsSchema.shape,
  delivery: z.enum(["inline", "artifact"]).default("inline"),
});

const summary = {
  filename: z.string(),
  bytes: z.number().int().min(0),
  lines: z.number().int().min(0),
  font: z.string(),
  align: z.enum(["left", "center", "right"]),
  width: z.number().int(),
};
export const asciiArtOutputSchema = z.union([
  z.strictObject({ ...summary, mode: z.literal("inline"), output: z.string() }),
  z.strictObject({
    ...summary,
    mode: z.literal("artifact"),
    artifact: z.strictObject({
      id: z.string(),
      bytes: z.number(),
      mimeType: z.string(),
      filename: z.string(),
      expiresAt: z.number(),
      path: z.string().optional(),
      downloadUrl: z.string().optional(),
    }),
  }),
]);

const importableAliases = new Map([
  ["ANSI-Compact", ansiCompact],
  ["babyface-lame", babyfaceLame],
  ["babyface-leet", babyfaceLeet],
  ["tmplr", tmplr],
]);
const fontNames = new Set([
  ...figlet.fontsSync().filter((font) => font !== "Tmplr"),
  ...importableAliases.keys(),
]);
let active = 0;

export async function runAsciiArt(
  value: unknown,
  signal?: AbortSignal,
  context?: Parameters<Operation["run"]>[2],
) {
  let input: z.infer<typeof asciiArtSchema>;
  try {
    input = asciiArtSchema.parse(value);
  } catch {
    throw new AsciiError("invalid_input");
  }
  const abort = signal ?? new AbortController().signal;
  abort.throwIfAborted();
  if (!fontNames.has(input.font)) throw new AsciiError("font_not_found");
  if (active >= 2) throw new AsciiError("busy");
  active++;
  let saved: string | undefined;
  try {
    const imported = importableAliases.get(input.font);
    if (imported) figlet.parseFont(input.font, imported);
    else figlet.loadFontSync(input.font);
    const { delivery: _, ...generation } = input;
    const result = generateAsciiArt(generation, (text, options) =>
      figlet.textSync(text, { ...options, font: options.font as FontName }),
    );
    abort.throwIfAborted();
    const { output, ...details } = result;
    if (input.delivery === "inline") {
      if (result.bytes > 64 * 1024) throw new AsciiError("artifact_required");
      return { mode: "inline" as const, output, ...details };
    }
    if (!context) throw new AsciiError("unsupported");
    const record = await context.artifacts.write(
      [new TextEncoder().encode(output)],
      {
        filename: result.filename,
        mimeType: "text/plain;charset=utf-8",
        limit: ASCII_OUTPUT_LIMIT,
      },
      abort,
    );
    saved = record.id;
    abort.throwIfAborted();
    const { id, bytes, mimeType, filename, expiresAt } = record;
    return {
      mode: "artifact" as const,
      ...details,
      filename,
      artifact: {
        id,
        bytes,
        mimeType,
        filename,
        expiresAt,
        ...(context.transport === "mcp"
          ? { path: record.path }
          : { downloadUrl: `/api/v1/artifacts/${id}` }),
      },
    };
  } catch (error) {
    if (saved && context) await context.artifacts.remove(saved);
    throw error;
  } finally {
    active--;
  }
}

export const asciiArtOperation: Operation = {
  id: "ascii-art-generator",
  name: "tooltab_ascii_art_generator",
  description:
    "Generate multiline ASCII art with any bundled FIGlet font, left/center/right alignment and a 40–160 column width. Each input line is rendered independently. Input 16 KiB/128 lines, output 1 MiB; inline responses are limited to 64 KiB and larger output requires explicit artifact delivery. Processing is local and does not persist input.",
  inputSchema: asciiArtSchema,
  outputSchema: asciiArtOutputSchema,
  bodyLimit: ASCII_INPUT_LIMIT * 6 + 4096,
  idempotent: false,
  run: (input, signal, context) => runAsciiArt(input, signal, context),
};
