import { rasterizeSvg } from "../image-formats/svg";
import {
  buildPlaceholderSvg,
  type PagePlaceholderOptions,
  type PlaceholderExportFormat,
  type PlaceholderScale,
} from "@workspace/tools/image/placeholder-layout";

export const PLACEHOLDER_PRESETS = [
  { id: "hd", label: "HD 1280 × 720", width: 1280, height: 720 },
  {
    id: "full-hd",
    label: "Full HD 1920 × 1080",
    width: 1920,
    height: 1080,
  },
  { id: "square", label: "Square 1080 × 1080", width: 1080, height: 1080 },
  { id: "story", label: "Story 1080 × 1920", width: 1080, height: 1920 },
  { id: "cover", label: "Cover 1200 × 630", width: 1200, height: 630 },
  { id: "banner", label: "Banner 728 × 90", width: 728, height: 90 },
] as const;

export async function createPlaceholderRasterBlob(
  options: PagePlaceholderOptions,
  format: Exclude<PlaceholderExportFormat, "svg">,
  scale: PlaceholderScale,
  quality: number,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  return rasterizeSvg(
    buildPlaceholderSvg(options),
    {
      width: options.width,
      height: options.height,
      scale,
      format,
      quality: Math.min(1, Math.max(0.1, quality)),
      transparent: false,
      background: options.backgroundColor,
    },
    signal,
  );
}
