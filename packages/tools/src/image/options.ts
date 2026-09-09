export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_BATCH_FILES = 20;
export const MAX_IMAGE_SIDE = 8192;
export const MAX_IMAGE_PIXELS = 32_000_000;
export const imageMimes = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;
export type ImageFormat = keyof typeof imageMimes;
export type Dimensions = { width: number; height: number };
export function validateFile(file: { type: string; size: number }) {
  if (
    !Object.values(imageMimes).some((mime) => mime === file.type) ||
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > MAX_FILE_BYTES
  )
    throw Error("invalidFile");
}
export function validateDimensions(size: Dimensions): Dimensions {
  if (
    ![size.width, size.height].every(
      (n) => Number.isInteger(n) && n > 0 && n <= MAX_IMAGE_SIDE,
    ) ||
    size.width * size.height > MAX_IMAGE_PIXELS
  )
    throw Error("invalidDimensions");
  return size;
}
export function resizeDimensions(
  original: Dimensions,
  axis: "width" | "height",
  value: number,
  locked: boolean,
  current: Dimensions = original,
): Dimensions {
  validateDimensions(original);
  return validateDimensions(
    locked
      ? axis === "width"
        ? {
            width: value,
            height: Math.max(
              1,
              Math.round((value * original.height) / original.width),
            ),
          }
        : {
            height: value,
            width: Math.max(
              1,
              Math.round((value * original.width) / original.height),
            ),
          }
      : { ...current, [axis]: value },
  );
}
export function scaleDimensions(
  original: Dimensions,
  percent: number,
): Dimensions {
  if (!Number.isFinite(percent) || percent <= 0)
    throw Error("invalidDimensions");
  validateDimensions(original);
  return validateDimensions({
    width: Math.max(1, Math.round((original.width * percent) / 100)),
    height: Math.max(1, Math.round((original.height * percent) / 100)),
  });
}
export function exportOptions(format: string, quality: number) {
  if (!Object.hasOwn(imageMimes, format)) throw Error("unsupported");
  if (!Number.isFinite(quality) || quality < 1 || quality > 100)
    throw Error("invalidQuality");
  return {
    type: imageMimes[format as ImageFormat],
    quality: format === "png" ? undefined : quality / 100,
  };
}
export function outputFilename(name: string, format: ImageFormat, suffix = "") {
  const base =
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    name
      .split(/[\\/]/)
      .pop()!
      .replace(/\.[^.]*$/, "")
      .replace(/[^\p{L}\p{N} _-]/gu, "_")
      .trim()
      .slice(0, 100) || "image";
  return `${base}${suffix.replace(/[^a-zA-Z0-9_-]/g, "")}.${format === "jpeg" ? "jpg" : format}`;
}
