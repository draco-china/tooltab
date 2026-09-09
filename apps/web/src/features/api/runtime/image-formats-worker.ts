import { readFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { gc } from "bun";
import { zipSync } from "fflate";
import sharp, { type Sharp } from "sharp";
import { avifEncoder } from "@/features/tools/image-formats/avif";
import {
  convertRaster,
  dimensions,
  type FormatSettings,
  ImageFormatError,
  MAX_FORMAT_OUTPUT,
  MAX_FORMAT_PIXELS,
  outputName,
  type Raster,
} from "@workspace/tools/image";
import { validateSvg } from "@workspace/tools/image/svg";
import { serverSvgXml } from "./svg-image";
export type FormatJob = {
  sources: { bytes: Uint8Array; name: string }[];
  settings: FormatSettings;
};
export type FormatBatch = {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
  filename: string;
  files: {
    name: string;
    bytes: number;
    inputBytes: number;
    width: number;
    height: number;
    sizes?: number[];
  }[];
  errors: { name: string; code: string }[];
};
async function raw(p: Sharp): Promise<Raster> {
  try {
    const { data, info } = await p
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    dimensions(info.width, info.height);
    return {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
    };
  } finally {
    p.destroy();
  }
}
async function decode(bytes: Uint8Array, name: string): Promise<Raster> {
  let input: Buffer<ArrayBufferLike> = Buffer.from(bytes);
  if (input[0] === 31 && input[1] === 139)
    throw new ImageFormatError("invalid_image");
  const head = input.subarray(0, 1024).toString();
  if (/\.svgz?$/i.test(name) || head.trimStart().startsWith("<")) {
    try {
      input = Buffer.from(
        validateSvg(input.toString("utf8"), serverSvgXml).source,
      );
    } catch {
      throw new ImageFormatError("invalid_image");
    }
  }
  if (input[0] === 66 && input[1] === 77) {
    const v = new DataView(input.buffer, input.byteOffset, input.byteLength);
    if (input.length < 26) throw new ImageFormatError("invalid_image");
    const small = v.getUint32(14, true) === 12;
    dimensions(
      small ? v.getUint16(18, true) : Math.abs(v.getInt32(18, true)),
      small ? v.getUint16(20, true) : Math.abs(v.getInt32(22, true)),
    );
    const img = await loadImage(input);
    try {
      const c = createCanvas(img.width, img.height);
      try {
        c.getContext("2d").drawImage(img, 0, 0);
        return raw(
          sharp(c.toBuffer("image/png"), {
            limitInputPixels: MAX_FORMAT_PIXELS,
          }),
        );
      } finally {
        c.width = c.height = 1;
      }
    } finally {
      img.onload = undefined;
      img.onerror = undefined;
      img.src = "";
    }
  }
  // ICO is not a libvips input format. Its embedded PNG can be decoded directly; DIB icons use the maintained native decoder when available.
  if (
    input.length >= 6 &&
    input.readUInt16LE(0) === 0 &&
    input.readUInt16LE(2) === 1
  ) {
    const count = input.readUInt16LE(4);
    if (!count || 6 + count * 16 > input.length)
      throw new ImageFormatError("invalid_image");
    const entries = [];
    for (let i = 0; i < count; i++) {
      const p = 6 + i * 16,
        len = input.readUInt32LE(p + 8),
        offset = input.readUInt32LE(p + 12);
      if (offset + len > input.length || offset < 6 + count * 16)
        throw new ImageFormatError("invalid_image");
      entries.push({
        size: (input[p] || 256) * (input[p + 1] || 256),
        bytes: input.subarray(offset, offset + len),
      });
    }
    entries.sort((a, b) => b.size - a.size);
    const image = entries[0].bytes;
    if (image[0] === 137 && image[1] === 80) input = image;
    else {
      const img = await loadImage(input);
      try {
        dimensions(img.width, img.height);
        const c = createCanvas(img.width, img.height);
        try {
          c.getContext("2d").drawImage(img, 0, 0);
          input = c.toBuffer("image/png");
        } finally {
          c.width = c.height = 1;
        }
      } finally {
        img.onload = undefined;
        img.onerror = undefined;
        img.src = "";
      }
    }
  }
  return raw(
    sharp(input, { limitInputPixels: MAX_FORMAT_PIXELS, animated: false })
      .autoOrient()
      .toColourspace("srgb"),
  );
}
const scope = self as unknown as {
  onmessage: (e: MessageEvent<FormatJob>) => void;
  postMessage: (d: unknown, t?: Transferable[]) => void;
};
scope.onmessage = async (e) => {
  try {
    const job = e.data,
      files: FormatBatch["files"] = [],
      errors: FormatBatch["errors"] = [],
      archive: { name: string; bytes: Uint8Array<ArrayBuffer> }[] = [],
      used = new Set<string>();
    let total = 0;
    const avif =
      job.settings.kind === "avif"
        ? await avifEncoder(
            new Uint8Array(
              await readFile(
                new URL(
                  import.meta.resolve("@jsquash/avif/codec/enc/avif_enc.wasm"),
                ),
              ),
            ),
          )
        : async () => {
            throw new ImageFormatError("unsupported");
          };
    for (const source of job.sources) {
      try {
        const raster = await decode(source.bytes, source.name),
          result = await convertRaster(raster, job.settings, {
            avif,
            async png(r) {
              const p = sharp(r.data, {
                raw: { width: r.width, height: r.height, channels: 4 },
              });
              try {
                return new Uint8Array(await p.png().toBuffer());
              } finally {
                p.destroy();
              }
            },
            async resize(r, w, h, bg) {
              let p = sharp(r.data, {
                raw: { width: r.width, height: r.height, channels: 4 },
              }).resize(w, h, { fit: "fill", kernel: "lanczos3" });
              if (bg) {
                const left = Math.round((bg.size - w) / 2),
                  top = Math.round((bg.size - h) / 2);
                p = p.extend({
                  left,
                  top,
                  right: bg.size - w - left,
                  bottom: bg.size - h - top,
                  background: bg.color ?? { r: 0, g: 0, b: 0, alpha: 0 },
                });
                if (bg.color) p = p.flatten({ background: bg.color });
              }
              return raw(p);
            },
          });
        total += result.bytes.length;
        if (total > MAX_FORMAT_OUTPUT)
          throw new ImageFormatError("output_limit");
        const name = outputName(source.name, job.settings.kind, used);
        archive.push({ name, bytes: result.bytes });
        files.push({
          name,
          bytes: result.bytes.length,
          inputBytes: source.bytes.length,
          width: result.width,
          height: result.height,
          sizes: result.sizes,
        });
      } catch (error) {
        if (error instanceof ImageFormatError && error.code === "output_limit")
          throw error;
        errors.push({
          name: source.name,
          code:
            error instanceof ImageFormatError ? error.code : "invalid_image",
        });
      }
    }
    if (!archive.length) throw new ImageFormatError("invalid_image");
    const zipped = archive.length > 1;
    const bytes = zipped
      ? zipSync(Object.fromEntries(archive.map((f) => [f.name, f.bytes])), {
          level: 0,
        })
      : archive[0].bytes;
    if (bytes.length > MAX_FORMAT_OUTPUT)
      throw new ImageFormatError("output_limit");
    const result: FormatBatch = {
      bytes,
      mimeType: zipped
        ? "application/zip"
        : job.settings.kind === "avif"
          ? "image/avif"
          : "image/x-icon",
      filename: zipped ? "converted-images.zip" : archive[0].name,
      files,
      errors,
    };
    gc(true);
    scope.postMessage({ result }, [bytes.buffer]);
  } catch (error) {
    scope.postMessage({
      error:
        error instanceof ImageFormatError ? error.code : "conversion_failed",
    });
  }
};
