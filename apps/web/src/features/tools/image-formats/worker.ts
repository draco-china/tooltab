/// <reference lib="webworker" />

import wasmUrl from "@jsquash/avif/codec/enc/avif_enc.wasm?url";
import { zipSync } from "fflate";
import { avifEncoder } from "./avif";
import {
  convertRaster,
  type FormatSettings,
  ImageFormatError,
  MAX_FORMAT_OUTPUT,
  type Raster,
} from "@workspace/tools/image";

const scope = self as DedicatedWorkerGlobalScope;
function canvas(r: Raster) {
  const c = new OffscreenCanvas(r.width, r.height),
    x = c.getContext("2d");
  if (!x) throw new ImageFormatError("unsupported");
  x.putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
  return c;
}
scope.onmessage = async (
  event: MessageEvent<
    | { raster: Raster; settings: FormatSettings }
    | { archive: { name: string; bytes: Uint8Array }[] }
  >,
) => {
  try {
    if ("archive" in event.data) {
      if (
        event.data.archive.reduce((n, f) => n + f.bytes.length, 0) >
        MAX_FORMAT_OUTPUT
      )
        throw new ImageFormatError("output_limit");
      const archive = zipSync(
        Object.fromEntries(event.data.archive.map((f) => [f.name, f.bytes])),
        { level: 0 },
      );
      if (archive.length > MAX_FORMAT_OUTPUT)
        throw new ImageFormatError("output_limit");
      scope.postMessage({ archive }, [archive.buffer]);
      return;
    }
    const { raster, settings } = event.data;
    const avif =
      settings.kind === "avif"
        ? await avifEncoder(
            new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer()),
          )
        : async () => {
            throw new ImageFormatError("unsupported");
          };
    const result = await convertRaster(raster, settings, {
      avif,
      async resize(r, w, h, bg) {
        const source = canvas(r),
          target = new OffscreenCanvas(bg?.size ?? w, bg?.size ?? h);
        try {
          const ctx = target.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new ImageFormatError("unsupported");
          if (bg?.color) {
            ctx.fillStyle = bg.color;
            ctx.fillRect(0, 0, target.width, target.height);
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(
            source,
            Math.round((target.width - w) / 2),
            Math.round((target.height - h) / 2),
            w,
            h,
          );
          return {
            data: ctx.getImageData(0, 0, target.width, target.height).data,
            width: target.width,
            height: target.height,
          };
        } finally {
          source.width = source.height = target.width = target.height = 1;
        }
      },
      async png(r) {
        const c = canvas(r);
        try {
          return new Uint8Array(
            await (await c.convertToBlob({ type: "image/png" })).arrayBuffer(),
          );
        } finally {
          c.width = c.height = 1;
        }
      },
    });
    scope.postMessage({ result }, [result.bytes.buffer]);
  } catch (error) {
    scope.postMessage({
      error:
        error instanceof ImageFormatError ? error.code : "conversion_failed",
    });
  }
};
