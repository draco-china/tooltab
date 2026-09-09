import * as z from "zod/v4";
import {
  filterLocalFonts,
  fontCss,
  normalizeLocalFonts,
} from "@workspace/tools/font/local";
import type { Operation } from "./operation-contract";

const fontSchema = z.strictObject({
  family: z.string().max(300).optional(),
  fullName: z.string().max(300).optional(),
  postscriptName: z.string().max(300).optional(),
  style: z.string().max(120).optional(),
});
export const localFontBookInputSchema = z.strictObject({
  fonts: z.array(fontSchema).max(10_000),
  query: z.string().max(300).default(""),
  style: z.enum(["all", "regular", "italic"]).default("all"),
});
const resultFont = z.strictObject({
  id: z.string(),
  family: z.string(),
  fullName: z.string(),
  postscriptName: z.string(),
  style: z.string(),
  css: z.string(),
});
export const localFontBookOutputSchema = z.strictObject({
  total: z.number().int(),
  matched: z.number().int(),
  fonts: z.array(resultFont),
  localFontAccess: z.literal(false),
});

export function runLocalFontBook(value: unknown) {
  const input = localFontBookInputSchema.parse(value);
  const normalized = normalizeLocalFonts(input.fonts);
  const fonts = filterLocalFonts(normalized, input.query, input.style).map(
    (font) => ({
      id: font.id,
      family: font.family,
      fullName: font.fullName,
      postscriptName: font.postscriptName,
      style: font.style,
      css: fontCss(font),
    }),
  );
  return {
    total: normalized.length,
    matched: fonts.length,
    fonts,
    localFontAccess: false as const,
  };
}

export const localFontBookOperation: Operation = {
  id: "local-font-book",
  name: "tooltab_local_font_catalog",
  description:
    "Normalize, search, classify and produce CSS for font descriptors supplied by the caller. A deployed API or MCP server cannot enumerate fonts installed on the caller's device; localFontAccess is always false. Use the ToolTab browser page for permission-based Local Font Access.",
  inputSchema: localFontBookInputSchema,
  outputSchema: localFontBookOutputSchema,
  bodyLimit: 2 * 1024 * 1024,
  idempotent: true,
  run: (input) => runLocalFontBook(input),
};
