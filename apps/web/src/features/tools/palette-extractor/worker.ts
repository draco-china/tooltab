import {
  createSwatches,
  quantizePalette,
} from "@workspace/tools/image/palette/quantize";

self.onmessage = (
  event: MessageEvent<{
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
    count: number;
    sampleStride: number;
    ignoreTransparent: boolean;
  }>,
) => {
  try {
    const result = quantizePalette(
      {
        data: event.data.pixels,
      },
      {
        colorCount: event.data.count,
        ignoreTransparent: event.data.ignoreTransparent,
        sampleStride: event.data.sampleStride,
      },
    );
    self.postMessage({
      swatches: createSwatches(result.colors, result.totalPixels),
      totalPixels: result.totalPixels,
    });
  } catch {
    self.postMessage({ error: true });
  }
};
