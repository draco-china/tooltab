import factory from "@jsquash/avif/codec/enc/avif_enc.js";
import { defaultOptions } from "@jsquash/avif/meta.js";
import type { AvifOptions, Raster } from "@workspace/tools/image";
import { ImageFormatError } from "@workspace/tools/image";
/** Select the package's single-thread factory explicitly: no automatic pthread/COOP dependency. */
export async function avifEncoder(wasmBinary: Uint8Array<ArrayBuffer>) {
  const module = await factory({ wasmBinary });
  return async (r: Raster, o: AvifOptions) => {
    const settings = {
      ...defaultOptions,
      quality: o.lossless ? 100 : o.quality,
      qualityAlpha: -1,
      speed: o.speed,
      lossless: o.lossless,
      subsample: o.lossless ? 3 : defaultOptions.subsample,
      bitDepth: 8,
    };
    const result = module.encode(r.data, r.width, r.height, settings);
    if (!result) throw new ImageFormatError("conversion_failed");
    return new Uint8Array(result).buffer;
  };
}
