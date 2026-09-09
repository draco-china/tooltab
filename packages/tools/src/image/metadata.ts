import { DOMParser } from "@xmldom/xmldom";
import * as ExifReader from "exifreader";
import {
  ImageMetadataError,
  imageFormat,
  imagePreview,
} from "./metadata-containers";

export const MAX_METADATA_BYTES = 16 * 1048576;
export type MetadataEntry = {
  key: string;
  source: string;
  value: unknown;
  description: string;
};
export type MetadataGroup = {
  id: "basic" | "camera" | "gps" | "advanced";
  entries: MetadataEntry[];
};
export type MetadataResult = {
  kind: "metadata";
  format: string;
  groups: MetadataGroup[];
  fields: number;
  gps: { latitude: number; longitude: number } | null;
  json: string;
  warnings: string[];
  preview: { width: number; height: number } | null;
};
async function inflate(data: Uint8Array, account: (bytes: number) => void) {
  const reader = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      // The shared account enforces the limit across all compressed blocks.
      account(r.value.length);
      chunks.push(r.value);
    }
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
  const out = new Uint8Array(size);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
export async function inspectImage(bytes: Uint8Array): Promise<MetadataResult> {
  const format = imageFormat(bytes),
    warnings = new Set<string>();
  let inflatedTotal = 0;
  let count = 0,
    stringBytes = 0;
  function account(value: string) {
    if (value.length > MAX_METADATA_BYTES)
      throw new ImageMetadataError("too_large");
    stringBytes += new TextEncoder().encode(value).length;
    if (stringBytes > MAX_METADATA_BYTES)
      throw new ImageMetadataError("too_large");
    return value;
  }
  function normalize(v: unknown, depth = 0): unknown {
    if (++count > 100000 || depth > 24)
      throw new ImageMetadataError("too_large");
    if (typeof v === "string") return account(v);
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v))
      return { binaryBytes: v.byteLength };
    if (typeof v === "number" && !Number.isFinite(v)) return String(v);
    if (Array.isArray(v)) return v.map((x) => normalize(x, depth + 1));
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [
          account(k),
          normalize(x, depth + 1),
        ]),
      );
    return v ?? null;
  }
  const parser = new DOMParser({
    onError: () => {
      warnings.add("xmp_skipped");
      throw new Error("Invalid XMP");
    },
  });
  const domParser = {
    parseFromString(source: string, mime: string) {
      if (
        source.length > MAX_METADATA_BYTES ||
        new TextEncoder().encode(source).length > MAX_METADATA_BYTES
      ) {
        warnings.add("xmp_skipped");
        throw new ImageMetadataError("too_large");
      }
      if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
        warnings.add("xmp_skipped");
        throw new Error("Invalid XMP");
      }
      return parser.parseFromString(source, mime as "application/xml");
    },
  };
  let parsed: ExifReader.ExpandedTags;
  try {
    // ExifReader XMP chunks use offsets into the backing buffer, so normalize subviews.
    const buffer =
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer
        : new Uint8Array(bytes).buffer;
    parsed = await ExifReader.loadView(new DataView(buffer), {
      expanded: true,
      async: true,
      includeUnknown: true,
      domParser,
      decompress: {
        maxDecompressedSize: MAX_METADATA_BYTES,
        deflate: async (data) => {
          try {
            return await inflate(data, (n) => {
              inflatedTotal += n;
              if (inflatedTotal > MAX_METADATA_BYTES)
                throw new ImageMetadataError("too_large");
            });
          } catch (e) {
            warnings.add("compressed_metadata_skipped");
            throw e;
          }
        },
      },
    });
  } catch {
    // ExifReader handles callback failures as skipped metadata internally.
    // A rejected load therefore represents an invalid image container.
    throw new ImageMetadataError("invalid_image");
  }
  const groups: MetadataGroup[] = [
    { id: "basic", entries: [] },
    { id: "camera", entries: [] },
    { id: "gps", entries: [] },
    { id: "advanced", entries: [] },
  ];
  const normalized: Record<string, unknown> = {};
  for (const [source, tags] of Object.entries(parsed)) {
    // Expanded ExifReader results contain object-valued groups.
    const normalizedTags = normalize(tags) as Record<string, unknown>;
    normalized[source] = normalizedTags;
    for (const [key, tag] of Object.entries(normalizedTags)) {
      const v =
        tag && typeof tag === "object"
          ? (tag as Record<string, unknown>)
          : null;
      const value = v && Object.hasOwn(v, "value") ? v.value : tag;
      const description = String(
        v?.description ??
          (typeof value === "object" ? JSON.stringify(value) : value),
      );
      const id =
        source === "gps" || key.startsWith("GPS")
          ? 2
          : /^(Make|Model|Lens|Exposure|FNumber|ISO|Focal|Flash|WhiteBalance|Metering|Shutter|Aperture|DateTimeOriginal|CreateDate|Scene|DigitalZoom|Contrast|Saturation|Sharpness)/.test(
                key,
              )
            ? 1
            : ["file", "jfif", "pngFile", "riff", "gif"].includes(source) ||
                /^(Image|ExifImage|Orientation|Resolution|XResolution|YResolution|Software|ModifyDate|Artist|Copyright|ColorSpace|BitsPerSample|Compression)/.test(
                  key,
                )
              ? 0
              : 3;
      groups[id].entries.push({ key, source, value, description });
    }
  }
  const gpsData = parsed.gps as
    | { Latitude?: number; Longitude?: number }
    | undefined;
  const lat = gpsData?.Latitude,
    lon = gpsData?.Longitude;
  const gps =
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
      ? { latitude: lat, longitude: lon }
      : null;
  const json = JSON.stringify(normalized, null, 2);
  if (new TextEncoder().encode(json).length > MAX_METADATA_BYTES)
    throw new ImageMetadataError("too_large");
  return {
    kind: "metadata",
    preview: imagePreview(bytes),
    format,
    groups: groups.filter((g) => g.entries.length),
    fields: groups.reduce((n, g) => n + g.entries.length, 0),
    gps,
    json,
    warnings: [...warnings],
  };
}
