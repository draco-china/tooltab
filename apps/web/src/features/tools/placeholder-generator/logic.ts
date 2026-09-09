import { rasterizeSvg } from "../image-formats/svg";
import {
  type PlaceholderOptions,
  placeholderSvg,
} from "@workspace/tools/image/placeholder";

export async function generatePlaceholder(
  options: PlaceholderOptions,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const source = placeholderSvg(options);
  if (options.format === "svg")
    return new Blob([source], { type: "image/svg+xml" });
  return rasterizeSvg(
    source,
    { ...options, format: options.format, quality: 0.92, transparent: false },
    signal,
  );
}
