const SIGBITS = 5;
const MULT = 1 << (8 - SIGBITS);
const HISTOMASK = (1 << SIGBITS) - 1;
const HISTOSIZE = 1 << (3 * SIGBITS);
const RSHIFT = 8 - SIGBITS;

export type PaletteColor = Readonly<{
  r: number;
  g: number;
  b: number;
  count: number;
}>;
export type PaletteSort = "dominance" | "hue" | "lightness";
export type PaletteQuality = "fast" | "balanced" | "precise";
export type PaletteExportFormat = "hex" | "css" | "json";
export type PaletteSwatch = Readonly<{
  hex: string;
  rgb: string;
  hsl: string;
  count: number;
  ratio: number;
  hue: number;
  lightness: number;
  textColor: string;
}>;
export type PaletteQuantizeOptions = Readonly<{
  colorCount: number;
  sampleStride?: number;
  ignoreTransparent?: boolean;
  alphaThreshold?: number;
}>;
export type PaletteQuantizeResult = Readonly<{
  colors: PaletteColor[];
  totalPixels: number;
}>;
export type PaletteOptions = Readonly<{
  colorCount: number;
  quality: PaletteQuality;
  sortBy: PaletteSort;
  ignoreTransparent: boolean;
}>;
export const QUALITY_PRESETS = {
  fast: { maxDimension: 360, targetSamples: 20000 },
  balanced: { maxDimension: 720, targetSamples: 60000 },
  precise: { maxDimension: 1200, targetSamples: 140000 },
} as const;
export const DEFAULT_PALETTE_OPTIONS: PaletteOptions = {
  colorCount: 8,
  quality: "balanced",
  sortBy: "dominance",
  ignoreTransparent: true,
};

// Internal channels stay in 0..31, so every index belongs to the fixed histogram.
function colorIndex(r: number, g: number, b: number) {
  return (r << (2 * SIGBITS)) + (g << SIGBITS) + b;
}

class VBox {
  private cachedCount: number | null = null;
  constructor(
    public r1: number,
    public r2: number,
    public g1: number,
    public g2: number,
    public b1: number,
    public b2: number,
    public readonly histo: Uint32Array,
  ) {}
  count() {
    if (this.cachedCount !== null) return this.cachedCount;
    let count = 0;
    for (let r = this.r1; r <= this.r2; r++)
      for (let g = this.g1; g <= this.g2; g++)
        for (let b = this.b1; b <= this.b2; b++)
          count += this.histo[colorIndex(r, g, b)];
    this.cachedCount = count;
    return count;
  }
  volume() {
    return (
      (this.r2 - this.r1 + 1) *
      (this.g2 - this.g1 + 1) *
      (this.b2 - this.b1 + 1)
    );
  }
  avg(): PaletteColor {
    let total = 0,
      rsum = 0,
      gsum = 0,
      bsum = 0;
    for (let r = this.r1; r <= this.r2; r++)
      for (let g = this.g1; g <= this.g2; g++)
        for (let b = this.b1; b <= this.b2; b++) {
          const count = this.histo[colorIndex(r, g, b)];
          if (!count) continue;
          total += count;
          rsum += count * (r + 0.5) * MULT;
          gsum += count * (g + 0.5) * MULT;
          bsum += count * (b + 0.5) * MULT;
        }
    return {
      r: Math.round(rsum / total),
      g: Math.round(gsum / total),
      b: Math.round(bsum / total),
      count: total,
    };
  }
  copy() {
    return new VBox(
      this.r1,
      this.r2,
      this.g1,
      this.g2,
      this.b1,
      this.b2,
      this.histo,
    );
  }
}

class PQueue {
  contents: VBox[] = [];
  constructor(private readonly compare: (a: VBox, b: VBox) => number) {}
  push(item: VBox) {
    this.contents.push(item);
    this.contents.sort(this.compare);
  }
  pop() {
    this.contents.sort(this.compare);
    return this.contents.pop();
  }
  size() {
    return this.contents.length;
  }
}

function initialBox(histo: Uint32Array) {
  let rmin = Infinity,
    gmin = Infinity,
    bmin = Infinity,
    rmax = 0,
    gmax = 0,
    bmax = 0,
    found = false;
  for (let index = 0; index < histo.length; index++) {
    if (!histo[index]) continue;
    found = true;
    const r = (index >> (2 * SIGBITS)) & HISTOMASK,
      g = (index >> SIGBITS) & HISTOMASK,
      b = index & HISTOMASK;
    rmin = Math.min(rmin, r);
    rmax = Math.max(rmax, r);
    gmin = Math.min(gmin, g);
    gmax = Math.max(gmax, g);
    bmin = Math.min(bmin, b);
    bmax = Math.max(bmax, b);
  }
  return found ? new VBox(rmin, rmax, gmin, gmax, bmin, bmax, histo) : null;
}

function axis(box: VBox): "r" | "g" | "b" {
  const r = box.r2 - box.r1,
    g = box.g2 - box.g1,
    b = box.b2 - box.b1;
  return b >= r && b >= g ? "b" : g >= r && g >= b ? "g" : "r";
}

function split(box: VBox): [VBox, VBox | null] {
  if (box.count() === 1) return [box.copy(), null];
  const major = axis(box);
  const min = major === "r" ? box.r1 : major === "g" ? box.g1 : box.b1;
  const max = major === "r" ? box.r2 : major === "g" ? box.g2 : box.b2;
  const sums: number[] = [];
  let total = 0;
  for (let value = min; value <= max; value++) {
    let sum = 0;
    for (let minor = 0; minor < 1 << (2 * SIGBITS); minor++) {
      const first = minor >> SIGBITS,
        second = minor & HISTOMASK;
      const r = major === "r" ? value : first;
      const g = major === "g" ? value : major === "r" ? first : second;
      const b = major === "b" ? value : second;
      if (
        r >= box.r1 &&
        r <= box.r2 &&
        g >= box.g1 &&
        g <= box.g2 &&
        b >= box.b1 &&
        b <= box.b2
      )
        sum += box.histo[colorIndex(r, g, b)];
    }
    total += sum;
    sums[value] = total;
  }
  let cut = min;
  for (let value = min; value <= max; value++)
    if (sums[value] >= total / 2) {
      cut = value;
      break;
    }
  if (cut <= min) cut = Math.min(max - 1, min);
  if (cut >= max) cut = Math.max(min, max - 1);
  if (cut < min || cut >= max) return [box.copy(), null];
  const before = box.copy(),
    after = box.copy();
  if (major === "r") {
    before.r2 = cut;
    after.r1 = cut + 1;
  } else if (major === "g") {
    before.g2 = cut;
    after.g1 = cut + 1;
  } else {
    before.b2 = cut;
    after.b1 = cut + 1;
  }
  return [before, after];
}

function splitTo(queue: PQueue, target: number) {
  const finished: VBox[] = [];
  let iterations = 0;
  while (queue.size() + finished.length < target && iterations < 1000) {
    const box = queue.pop();
    if (!box) break;
    const [first, second] = split(box);
    if (second) {
      queue.push(first);
      queue.push(second);
    } else finished.push(first);
    iterations++;
  }
  for (const box of finished) queue.push(box);
}

function quantizeHistogram(
  histo: Uint32Array,
  maxColors: number,
): PaletteColor[] {
  const first = initialBox(histo);
  if (!first) return [];
  const dominant = new PQueue((a, b) => a.count() - b.count());
  dominant.push(first);
  splitTo(dominant, Math.max(1, Math.round(maxColors * 0.75)));
  const mixed = new PQueue(
    (a, b) => a.count() * a.volume() - b.count() * b.volume(),
  );
  mixed.contents = dominant.contents.slice();
  splitTo(mixed, maxColors);
  return mixed.contents
    .map((box) => box.avg())
    .filter((color) => color.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Page palette extraction: 5-bit histogram median-cut. `data` is the portable ImageData payload. */
export function quantizePalette(
  { data }: { data: Uint8ClampedArray },
  options: PaletteQuantizeOptions,
): PaletteQuantizeResult {
  if (
    Number.isNaN(options.colorCount) ||
    Number.isNaN(options.sampleStride) ||
    Number.isNaN(options.alphaThreshold)
  )
    throw new RangeError("invalidDimensions");
  const colorCount = Math.max(1, Math.min(256, Math.floor(options.colorCount)));
  const sampleStride = Math.max(1, Math.floor(options.sampleStride ?? 1));
  const ignoreTransparent = options.ignoreTransparent ?? true;
  const alphaThreshold = Math.max(
    0,
    Math.min(255, Math.floor(options.alphaThreshold ?? 8)),
  );
  const histo = new Uint32Array(HISTOSIZE);
  let totalPixels = 0;
  for (let index = 0; index < data.length; index += 4 * sampleStride) {
    const alpha = data[index + 3] ?? 255;
    if (ignoreTransparent && alpha <= alphaThreshold) continue;
    // The loop bounds guarantee the current byte; partial trailing G/B/A stay padded.
    const r = (data[index] >> RSHIFT) & HISTOMASK;
    const g = ((data[index + 1] ?? 0) >> RSHIFT) & HISTOMASK;
    const b = ((data[index + 2] ?? 0) >> RSHIFT) & HISTOMASK;
    histo[colorIndex(r, g, b)] = histo[colorIndex(r, g, b)] + 1;
    totalPixels++;
  }
  return { colors: quantizeHistogram(histo, colorCount), totalPixels };
}

function clamp(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}
function hex(value: number) {
  return clamp(value).toString(16).padStart(2, "0").toUpperCase();
}
function rgbToHex(r: number, g: number, b: number) {
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
function formatRgb(r: number, g: number, b: number) {
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}
function rgbToHsl(r: number, g: number, b: number) {
  const red = clamp(r) / 255,
    green = clamp(g) / 255,
    blue = clamp(b) / 255;
  const max = Math.max(red, green, blue),
    min = Math.min(red, green, blue),
    delta = max - min,
    l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (delta) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    h =
      max === red
        ? (green - blue) / delta + (green < blue ? 6 : 0)
        : max === green
          ? (blue - red) / delta + 2
          : (red - green) / delta + 4;
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}
export function createSwatches(
  colors: readonly PaletteColor[],
  totalPixels: number,
): PaletteSwatch[] {
  if (totalPixels <= 0) return [];
  return colors.map((color) => {
    const hsl = rgbToHsl(color.r, color.g, color.b);
    return {
      hex: rgbToHex(color.r, color.g, color.b),
      rgb: formatRgb(color.r, color.g, color.b),
      hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
      count: color.count,
      ratio: color.count / totalPixels,
      hue: hsl.h,
      lightness: hsl.l,
      textColor:
        (clamp(color.r) * 299 + clamp(color.g) * 587 + clamp(color.b) * 114) /
          1000 >=
        140
          ? "#111111"
          : "#ffffff",
    };
  });
}
export function sortSwatches(
  swatches: readonly PaletteSwatch[],
  sortBy: PaletteSort,
): PaletteSwatch[] {
  const sorted = [...swatches];
  if (sortBy === "hue")
    return sorted.sort((a, b) => a.hue - b.hue || b.count - a.count);
  if (sortBy === "lightness")
    return sorted.sort(
      (a, b) => a.lightness - b.lightness || a.hue - b.hue || b.count - a.count,
    );
  return sorted.sort((a, b) => b.count - a.count);
}
export function formatPaletteExport(
  colors: readonly PaletteSwatch[],
  format: PaletteExportFormat,
): string {
  if (format === "css")
    return [
      ":root {",
      ...colors.map((color, i) => `  --palette-${i + 1}: ${color.hex};`),
      "}",
    ].join("\n");
  if (format === "json")
    return JSON.stringify(
      colors.map((color, i) => ({
        index: i + 1,
        hex: color.hex,
        rgb: color.rgb,
        hsl: color.hsl,
        ratio: Number(color.ratio.toFixed(4)),
      })),
      null,
      2,
    );
  return colors.map((color) => color.hex).join("\n");
}
export function getExportFileName(
  baseName: string,
  format: PaletteExportFormat,
) {
  const safeName = baseName.replace(/\.[^.]+$/, "").trim() || "palette";
  const extension =
    format === "css" ? "css" : format === "json" ? "json" : "txt";
  return safeName === "palette"
    ? `${safeName}.${extension}`
    : `${safeName}-palette.${extension}`;
}
export function getExportMimeType(format: PaletteExportFormat) {
  return format === "css"
    ? "text/css"
    : format === "json"
      ? "application/json"
      : "text/plain";
}
export function getSampleStride(
  width: number,
  height: number,
  targetSamples: number,
) {
  return Math.max(
    1,
    Math.floor(
      Math.max(0, Math.floor(width) * Math.floor(height)) /
        Math.max(1, Math.floor(targetSamples)),
    ),
  );
}
