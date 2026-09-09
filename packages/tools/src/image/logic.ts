export const MAX_FORMAT_INPUT = 64 * 1024 * 1024;
export const MAX_FORMAT_OUTPUT = 256 * 1024 * 1024;
export const MAX_FORMAT_PIXELS = 64_000_000;
export const MAX_FORMAT_EDGE = 16384;
export const MAX_FORMAT_FILES = 100;
export const iconSizes = [16, 24, 32, 48, 64, 128, 256] as const;

export type FormatCode =
  | "invalid_image"
  | "invalid_options"
  | "input_limit"
  | "output_limit"
  | "pixel_limit"
  | "unsupported"
  | "timeout"
  | "busy"
  | "conversion_failed"
  | "artifact_required";

export class ImageFormatError extends Error {
  constructor(public code: FormatCode) {
    super(code);
    this.name = "ImageFormatError";
  }
}

export type AvifOptions = {
  quality: number;
  scale: number;
  speed: number;
  lossless: boolean;
};

export type IcoOptions = {
  sizes: number[];
  backgroundEnabled: boolean;
  backgroundColor: string;
};

export const avifDefaults: AvifOptions = {
  quality: 75,
  scale: 100,
  speed: 6,
  lossless: false,
};

export const icoDefaults: IcoOptions = {
  sizes: [16, 32, 48, 256],
  backgroundEnabled: false,
  backgroundColor: "#ffffff",
};

export type FormatSettings =
  | { kind: "avif"; options: AvifOptions }
  | { kind: "ico"; options: IcoOptions };

export type Raster = {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
};

export type FormatOutput = {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  sizes?: number[];
};

export function dimensions(width: number, height: number) {
  if (
    ![width, height].every(
      (n) => Number.isInteger(n) && n > 0 && n <= MAX_FORMAT_EDGE,
    ) ||
    width * height > MAX_FORMAT_PIXELS
  )
    throw new ImageFormatError("pixel_limit");
  return { width, height };
}

export function validateSettings(settings: FormatSettings) {
  if (settings.kind === "avif") {
    const o = settings.options;
    if (
      !Number.isInteger(o.quality) ||
      o.quality < 0 ||
      o.quality > 100 ||
      !Number.isInteger(o.speed) ||
      o.speed < 0 ||
      o.speed > 10 ||
      !Number.isInteger(o.scale) ||
      o.scale < 10 ||
      o.scale > 400 ||
      typeof o.lossless !== "boolean"
    )
      throw new ImageFormatError("invalid_options");
  } else {
    const o = settings.options;
    if (
      !o.sizes.length ||
      o.sizes.length > 256 ||
      o.sizes.some((n) => !Number.isInteger(n) || n < 1 || n > 256) ||
      typeof o.backgroundEnabled !== "boolean" ||
      !/^#[a-f\d]{6}(?![\s\S])/i.test(o.backgroundColor)
    )
      throw new ImageFormatError("invalid_options");
  }
}

export function outputName(
  name: string,
  ext: "avif" | "ico",
  used = new Set<string>(),
) {
  const safe = name
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Remove unsafe filename control bytes.
    .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .trim()
    .slice(0, 160);
  const stem = safe.replace(/\.[^.]*$/, "") || "image";
  let result = `${stem}.${ext}`,
    i = 2;
  while (used.has(result.toLowerCase())) result = `${stem}-${i++}.${ext}`;
  used.add(result.toLowerCase());
  return result;
}

export function iconPlacement(width: number, height: number, size: number) {
  dimensions(width, height);
  const factor = size / Math.max(width, height),
    w = Math.max(1, Math.round(width * factor)),
    h = Math.max(1, Math.round(height * factor));
  return {
    width: w,
    height: h,
    left: Math.round((size - w) / 2),
    top: Math.round((size - h) / 2),
  };
}

/** ICO directory with PNG image payloads, including the standard zero-byte 256 size marker. */
export function packIcon(frames: { size: number; bytes: Uint8Array }[]) {
  if (!frames.length || frames.length > 256)
    throw new ImageFormatError("invalid_options");
  const length =
    6 + 16 * frames.length + frames.reduce((n, f) => n + f.bytes.byteLength, 0);
  if (length > MAX_FORMAT_OUTPUT) throw new ImageFormatError("output_limit");
  const bytes = new Uint8Array(length),
    v = new DataView(bytes.buffer);
  v.setUint16(2, 1, true);
  v.setUint16(4, frames.length, true);
  let offset = 6 + 16 * frames.length;
  frames.forEach((f, i) => {
    if (!Number.isInteger(f.size) || f.size < 1 || f.size > 256)
      throw new ImageFormatError("invalid_options");
    const p = 6 + i * 16;
    bytes[p] = bytes[p + 1] = f.size === 256 ? 0 : f.size;
    v.setUint16(p + 4, 1, true);
    v.setUint16(p + 6, 32, true);
    v.setUint32(p + 8, f.bytes.length, true);
    v.setUint32(p + 12, offset, true);
    bytes.set(f.bytes, offset);
    offset += f.bytes.length;
  });
  return bytes;
}

export type RasterRuntime = {
  resize: (
    r: Raster,
    width: number,
    height: number,
    background?: { size: number; color?: string },
  ) => Promise<Raster>;
  png: (r: Raster) => Promise<Uint8Array<ArrayBuffer>>;
  avif: (r: Raster, o: AvifOptions) => Promise<ArrayBuffer>;
};

export async function convertRaster(
  raster: Raster,
  settings: FormatSettings,
  runtime: RasterRuntime,
): Promise<FormatOutput> {
  validateSettings(settings);
  dimensions(raster.width, raster.height);
  if (raster.data.length !== raster.width * raster.height * 4)
    throw new ImageFormatError("invalid_image");
  if (settings.kind === "avif") {
    const { options } = settings,
      w = Math.max(1, Math.round((raster.width * options.scale) / 100)),
      h = Math.max(1, Math.round((raster.height * options.scale) / 100));
    dimensions(w, h);
    const resized =
      w === raster.width && h === raster.height
        ? raster
        : await runtime.resize(raster, w, h);
    const bytes = new Uint8Array(await runtime.avif(resized, options));
    if (!bytes.length) throw new ImageFormatError("conversion_failed");
    if (bytes.length > MAX_FORMAT_OUTPUT)
      throw new ImageFormatError("output_limit");
    return { bytes, width: w, height: h };
  }
  const sizes = [...new Set(settings.options.sizes)].sort((a, b) => b - a),
    frames = [];
  for (const size of sizes) {
    const p = iconPlacement(raster.width, raster.height, size);
    const r = await runtime.resize(raster, p.width, p.height, {
      size,
      color: settings.options.backgroundEnabled
        ? settings.options.backgroundColor
        : undefined,
    });
    frames.push({ size, bytes: await runtime.png(r) });
  }
  return { bytes: packIcon(frames), width: sizes[0], height: sizes[0], sizes };
}
