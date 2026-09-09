import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import {
  CATEGORIES,
  CATEGORY_IDS,
  convertUnit,
} from "@workspace/tools/number/units";

const precision = z.enum(["4", "6", "10", "max"]);
const locale = z.enum(["en-US", "zh-CN"]);

export const unitConverterInputSchema = z
  .strictObject({
    category: z.enum(CATEGORY_IDS),
    value: z.string().min(1).max(128),
    from: z.string().min(1).max(32),
    to: z.string().min(1).max(32),
    precision: precision.default("6"),
    locale: locale.default("en-US"),
  })
  .superRefine((input, context) => {
    const units = CATEGORIES[input.category].units;
    const fromValid = units.some((unit) => unit.id === input.from);
    const toValid = units.some((unit) => unit.id === input.to);
    if (!fromValid)
      context.addIssue({
        code: "custom",
        path: ["from"],
        message: `Unknown ${input.category} source unit`,
      });
    if (!toValid)
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: `Unknown ${input.category} target unit`,
      });
    if (fromValid && toValid) {
      try {
        convertUnit(input);
      } catch {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: "Value is invalid or the selected result is out of range",
        });
      }
    }
  });

const conversionSchema = z.strictObject({
  id: z.string(),
  symbol: z.string(),
  raw: z.number().nullable(),
  formatted: z.string(),
});

export const unitConverterOutputSchema = z.strictObject({
  category: z.enum(CATEGORY_IDS),
  input: z.number(),
  from: z.string(),
  to: z.string(),
  raw: z.number(),
  formatted: z.string(),
  conversions: z.array(conversionSchema),
});

export const unitConverterOperation: Operation = {
  id: "unit-converter",
  name: "tooltab_unit_converter",
  description:
    "Convert a locale-aware decimal value between 75 fixed units in 8 categories: length, mass, temperature, area, volume, speed, decimal/binary digital storage and fixed-duration time. Returns the selected result plus every unit in the category. Time months and years use average Gregorian durations (2629746 and 31556952 seconds). No currency or live rates.",
  inputSchema: unitConverterInputSchema,
  outputSchema: unitConverterOutputSchema,
  bodyLimit: 7_000,
  idempotent: true,
  run(input, signal) {
    signal?.throwIfAborted();
    return convertUnit(unitConverterInputSchema.parse(input));
  },
};
