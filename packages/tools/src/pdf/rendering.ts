import { MAX_PDF_PAGES, PdfEditingError, pageRanges } from "./core";
export type ImageOptions = {
  dpi: number;
  format: ImageFormat;
  quality: number;
};
export const imageDefaults: ImageOptions = {
  dpi: 144,
  format: "png",
  quality: 0.92,
};
export const MAX_RENDER_PIXELS = 64_000_000;
export const MAX_RENDER_EDGE = 16384;
export const imageFormats = ["png", "jpeg", "webp"] as const;
export type ImageFormat = (typeof imageFormats)[number];
export function imageOptions(job: ImageOptions) {
  if (
    !imageFormats.includes(job.format) ||
    !Number.isInteger(job.dpi) ||
    job.dpi < 72 ||
    job.dpi > 600 ||
    !Number.isFinite(job.quality) ||
    job.quality < 0.1 ||
    job.quality > 1
  )
    throw new PdfEditingError("invalid_options");
}
export function imageDimensions(width: number, height: number) {
  const w = Math.max(1, Math.round(width)),
    h = Math.max(1, Math.round(height));
  if (
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w > MAX_RENDER_EDGE ||
    h > MAX_RENDER_EDGE ||
    w * h > MAX_RENDER_PIXELS
  )
    throw new PdfEditingError("too_large");
  return { width: w, height: h };
}
export function imagePages(
  job: ImageOptions & { pages: string },
  count: number,
) {
  imageOptions(job);
  if (count > MAX_PDF_PAGES) throw new PdfEditingError("too_large");
  return pageRanges(job.pages, count, true).pages;
}
