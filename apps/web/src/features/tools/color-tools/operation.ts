import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import {
  COLOR_FORMATS,
  checkContrast,
  convertColor,
} from "@workspace/tools/color/convert";

const input = z.string().max(500);
const converter = z.strictObject({
  input,
  format: z.enum(COLOR_FORMATS).optional(),
  showAlpha: z.boolean().default(true),
});
const contrast = z.strictObject({ foreground: input, background: input });
const rgba = z.strictObject({
  r: z.number(),
  g: z.number(),
  b: z.number(),
  a: z.number(),
});
export const colorToolOperations: Operation[] = [
  {
    id: "color-converter",
    name: "tooltab_color_converter",
    description:
      "Convert HEX/RGB/HSL/HSV/HWB/D65 LAB/LCH/CMYK/CSS keyword colors. Keyword output is nearest RGB keyword; CMYK is unprofiled. No input storage.",
    inputSchema: converter,
    outputSchema: z.strictObject({
      color: rgba,
      values: z.record(z.enum(COLOR_FORMATS), z.string()),
    }),
    bodyLimit: 10000,
    idempotent: true,
    run(input) {
      const p = converter.parse(input);
      return convertColor(p.input, p.format, p.showAlpha);
    },
  },
  {
    id: "color-contrast-checker",
    name: "tooltab_color_contrast_checker",
    description:
      "Compute WCAG2.2 text contrast with unrounded threshold checks. Background composited over white, foreground over resolved background; no input storage.",
    inputSchema: contrast,
    outputSchema: z.strictObject({
      ratio: z.number(),
      foreground: rgba,
      background: rgba,
      aaNormal: z.boolean(),
      aaLarge: z.boolean(),
      aaaNormal: z.boolean(),
      aaaLarge: z.boolean(),
    }),
    bodyLimit: 10000,
    idempotent: true,
    run(input) {
      const p = contrast.parse(input);
      return checkContrast(p.foreground, p.background);
    },
  },
];
