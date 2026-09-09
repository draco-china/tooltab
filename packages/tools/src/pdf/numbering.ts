import { PdfEditingError } from "./core";

export const NUMBER_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export const numberDefaults = {
  pages: "",
  startNumber: 1,
  format: "number" as "number" | "number-total",
  position: "bottom-center" as (typeof NUMBER_POSITIONS)[number],
  fontFamily: "serif" as "serif" | "sans-serif",
  fontSize: 12,
  marginX: 24,
  marginY: 24,
};
export type NumberOptions = typeof numberDefaults;
export function numberOptions(value: NumberOptions) {
  for (const [n, min, max] of [
    [value.startNumber, 1, 999999],
    [value.fontSize, 6, 72],
    [value.marginX, 0, 144],
    [value.marginY, 0, 144],
  ])
    if (!Number.isInteger(n) || n < min || n > max)
      throw new PdfEditingError("invalid_options");
  if (
    !NUMBER_POSITIONS.includes(value.position) ||
    !["number", "number-total"].includes(value.format) ||
    !["serif", "sans-serif"].includes(value.fontFamily)
  )
    throw new PdfEditingError("invalid_options");
  return value;
}

export function numberPlacement(
  width: number,
  height: number,
  textWidth: number,
  o: NumberOptions,
) {
  const x = o.position.endsWith("center")
    ? (width - textWidth) / 2
    : o.position.endsWith("right")
      ? width - o.marginX - textWidth
      : o.marginX;
  const y = o.position.startsWith("top")
    ? height - o.marginY - o.fontSize
    : o.marginY;
  return {
    x: Math.max(0, Math.min(x, Math.max(0, width - textWidth))),
    y: Math.max(0, Math.min(y, Math.max(0, height - o.fontSize))),
  };
}
