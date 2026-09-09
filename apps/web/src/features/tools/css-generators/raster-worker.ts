import { renderGradientRaster } from "@workspace/tools/css/raster";
import type { GradientRasterJob } from "./raster-worker-client";

self.onmessage = async (event: MessageEvent<GradientRasterJob>) => {
  try {
    const pixels = await renderGradientRaster(
      event.data.input,
      event.data.width,
      event.data.height,
    );
    (
      self as unknown as {
        postMessage(value: unknown, transfer: Transferable[]): void;
      }
    ).postMessage({ pixels }, [pixels.buffer]);
  } catch {
    self.postMessage({ error: true });
  }
};
