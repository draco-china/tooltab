import * as z from "zod/v4";
import {
  ColorPickerError,
  convertPickerColor,
  PICKER_INPUT_FORMATS,
} from "@workspace/tools/color/picker";
import type { Operation } from "./operation-contract";

export const colorPickerInputSchema = z.strictObject({
  input: z.string().min(1).max(500),
  format: z.enum(PICKER_INPUT_FORMATS).optional(),
  showAlpha: z.boolean().default(true),
});

const rgba = z.strictObject({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255),
  a: z.number().min(0).max(1),
});
export const colorPickerOutputSchema = z.strictObject({
  capability: z.literal("color-conversion"),
  screenAccess: z.literal(false),
  color: rgba,
  values: z.strictObject({
    hex: z.string(),
    rgb: z.string(),
    hsl: z.string(),
    hsv: z.string(),
    cmyk: z.string(),
    oklch: z.string(),
    alpha: z.string(),
  }),
  gamutClipped: z.boolean(),
});

export const colorPickerOperation: Operation = {
  id: "color-picker",
  name: "tooltab_color_picker",
  description:
    "Parse and convert a caller-supplied HEX, RGB, HSL, HSV, HWB, D65 LAB/LCH, unprofiled CMYK, CSS keyword, or OKLCH color. Returns HEX, RGB, HSL, HSV, CMYK, OKLCH and alpha values. This service cannot sample the caller's screen or image pixels; use the browser tool for interactive picking.",
  inputSchema: colorPickerInputSchema,
  outputSchema: colorPickerOutputSchema,
  bodyLimit: 4_096,
  idempotent: true,
  run(input, signal) {
    signal?.throwIfAborted();
    const parsed = colorPickerInputSchema.safeParse(input);
    if (!parsed.success) throw new ColorPickerError("invalid_color");
    return convertPickerColor(
      parsed.data.input,
      parsed.data.format,
      parsed.data.showAlpha,
    );
  },
};
