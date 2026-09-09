export type PaletteSort = "dominance" | "hue" | "lightness";

/** HTTP palette extraction: 4-bit RGB bins with a perceptual-distance pass. */
export function extractPalette(
  pixels: Uint8ClampedArray,
  count: number,
  ignoreTransparent = true,
): string[] {
  if (!Number.isInteger(count) || count < 2 || count > 12)
    throw new Error("invalidDimensions");
  const bins = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();
  for (let i = 0; i < pixels.length; i += 4) {
    if (ignoreTransparent && pixels[i + 3] < 128) continue;
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2];
    const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bin.count++;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  }
  const selected: number[][] = [];
  for (const bin of [...bins.values()].sort((a, b) => b.count - a.count)) {
    const color = [bin.r / bin.count, bin.g / bin.count, bin.b / bin.count];
    if (
      selected.every(
        (c) =>
          Math.hypot(c[0] - color[0], c[1] - color[1], c[2] - color[2]) > 35,
      )
    )
      selected.push(color);
    if (selected.length === count) break;
  }
  return selected.map(
    (color) =>
      `#${color.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`,
  );
}

export function colorValues(hex: string) {
  const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const [r, g, b] = rgb.map((value) => value / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min,
    lightness = (max + min) / 2;
  let hue = 0;
  if (delta)
    hue =
      (max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4) * 60;
  hue = (hue + 360) % 360;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return {
    hex,
    rgb: `rgb(${rgb.join(", ")})`,
    hsl: `hsl(${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`,
  };
}

export function sortPalette(colors: string[], sort: PaletteSort): string[] {
  if (sort === "dominance") return [...colors];
  return [...colors].sort((a, b) => {
    // colorValues always emits a numeric hue (including 0 for invalid RGB),
    // so these generated HSL strings always contain at least one number.
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const left = colorValues(a)
      .hsl.match(/[\d.]+/g)!
      .map(Number);
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const right = colorValues(b)
      .hsl.match(/[\d.]+/g)!
      .map(Number);
    return (
      (left[sort === "hue" ? 0 : 2] ?? 0) - (right[sort === "hue" ? 0 : 2] ?? 0)
    );
  });
}
