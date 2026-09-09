import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import { COLOR_FAMILIES, findNamedColors } from "@workspace/tools/color/names";
export const namedColorsInputSchema = z.strictObject({
  query: z.string().max(1000).default(""),
  category: z.enum(COLOR_FAMILIES).default("all"),
});
export const namedColorsOperation: Operation = {
  id: "html-color-names",
  name: "tooltab_html_color_names",
  description:
    "Search all 148 CSS named colors by case-insensitive name or HEX substring, optionally filtering one visual family. Returns every matching name, HEX, RGB and category. Synonym names remain separate. Categories use visual hue/lightness heuristics, not a CSS standard classification.",
  inputSchema: namedColorsInputSchema,
  outputSchema: z.strictObject({
    total: z.number().int(),
    count: z.number().int(),
    colors: z.array(
      z.strictObject({
        name: z.string(),
        hex: z.string(),
        rgb: z.tuple([z.number(), z.number(), z.number()]),
        rgbLabel: z.string(),
        category: z.enum(COLOR_FAMILIES),
      }),
    ),
  }),
  bodyLimit: 7000,
  idempotent: true,
  run(input) {
    const value = namedColorsInputSchema.parse(input);
    return findNamedColors(value.query, value.category);
  },
};
