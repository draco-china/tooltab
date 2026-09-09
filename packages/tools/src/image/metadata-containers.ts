export const MAX_IMAGE_BYTES = 64 * 1048576;
export class ImageMetadataError extends Error {
  constructor(
    public code:
      | "invalid_image"
      | "unsupported_format"
      | "too_large"
      | "timeout"
      | "unsupported"
      | "busy"
      | "artifact_required"
      | "read_failed",
  ) {
    super(code);
  }
}
export type ImageFormat = "jpeg" | "png" | "webp" | "gif" | "tiff" | "heic";
const ascii = (b: Uint8Array, p: number, n: number) =>
  String.fromCharCode(...b.subarray(p, p + n));
export function imageFormat(b: Uint8Array): ImageFormat {
  if (b.length > MAX_IMAGE_BYTES) throw new ImageMetadataError("too_large");
  if (b[0] === 255 && b[1] === 216) return "jpeg";
  if (ascii(b, 0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (["GIF87a", "GIF89a"].includes(ascii(b, 0, 6))) return "gif";
  if (["II\x2a\0", "MM\0\x2a"].includes(ascii(b, 0, 4))) return "tiff";
  if (
    ascii(b, 4, 4) === "ftyp" &&
    ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(ascii(b, 8, 4))
  )
    return "heic";
  throw new ImageMetadataError("unsupported_format");
}
const bad = () => {
  throw new ImageMetadataError("invalid_image");
};
function join(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let j = 0; j < 8; j++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});
export function pngCrc(b: Uint8Array) {
  let n = 0xffffffff;
  for (const x of b) n = (n >>> 8) ^ crcTable[(n ^ x) & 255];
  return (n ^ 0xffffffff) >>> 0;
}
export type CleanResult = {
  kind: "cleaned";
  format: "jpeg" | "png" | "webp";
  bytes: Uint8Array;
  originalBytes: number;
  removedBytes: number;
  removed: Record<string, number>;
  preservesCompressedPixels: true;
  appearanceMayChange: true;
};
export function cleanImage(bytes: Uint8Array): CleanResult {
  const format = imageFormat(bytes),
    parts: Uint8Array[] = [],
    removed: Record<string, number> = {};
  let segments = 0;
  const checkCount = () => {
    if (++segments > 100000) throw new ImageMetadataError("too_large");
  };
  const drop = (name: string) => {
    removed[name] = (removed[name] ?? 0) + 1;
  };
  if (format === "jpeg") {
    parts.push(bytes.subarray(0, 2));
    let p = 2,
      entropy = false,
      ended = false,
      sawScan = false;
    while (p < bytes.length) {
      checkCount();
      const inScan = entropy;
      if (entropy) {
        const start = p;
        while (p < bytes.length) {
          if (bytes[p] !== 255) {
            p++;
            continue;
          }
          const markerStart = p;
          while (bytes[p] === 255) p++;
          if (p >= bytes.length) bad();
          if (bytes[p] === 0 || (bytes[p] >= 0xd0 && bytes[p] <= 0xd7)) {
            p++;
            continue;
          }
          p = markerStart;
          break;
        }
        parts.push(bytes.subarray(start, p));
        entropy = false;
      }
      if (bytes[p] !== 255) bad();
      const start = p;
      while (bytes[p] === 255) p++;
      const marker = bytes[p++];
      if (marker === 0xd9) {
        parts.push(bytes.subarray(start, p));
        ended = true;
        break;
      }
      if (
        marker === 0xd8 ||
        marker === 0 ||
        marker === undefined ||
        (marker >= 0xd0 && marker <= 0xd7)
      )
        bad();
      if (marker === 1) {
        parts.push(bytes.subarray(start, p));
        continue;
      }
      if (p + 2 > bytes.length) bad();
      const length = bytes[p] * 256 + bytes[p + 1],
        end = p + length;
      if (length < 2 || end > bytes.length) bad();
      // APP14 Adobe describes color transform and is retained for decoding fidelity.
      // APP0 JFIF is structural; JFXX thumbnails and unknown application blocks are removed.
      const jfif = marker === 0xe0 && ascii(bytes, p + 2, 5) === "JFIF\0";
      const adobe =
        marker === 0xee && length === 14 && ascii(bytes, p + 2, 5) === "Adobe";
      if (jfif) {
        if (length < 16) bad();
        const clean = new Uint8Array(bytes.subarray(start, p + 16));
        clean[clean.length - 2] = 0;
        clean[clean.length - 1] = 0;
        const lenOffset = p - start;
        clean[lenOffset] = 0;
        clean[lenOffset + 1] = 16;
        parts.push(clean);
        if (length > 16) drop("JFIF thumbnail");
      } else if (
        marker === 0xfe ||
        (marker >= 0xe0 && marker <= 0xef && !adobe)
      )
        drop(marker === 0xfe ? "COM" : `APP${marker - 0xe0}`);
      else parts.push(bytes.subarray(start, end));
      p = end;
      if (marker === 0xda) {
        entropy = true;
        sawScan = true;
      }
      if (inScan && marker === 0xdc) entropy = true;
    }
    if (!ended || !sawScan) bad();
    if (p < bytes.length) drop("trailing data");
  } else if (format === "png") {
    parts.push(bytes.subarray(0, 8));
    let p = 8,
      ended = false,
      sawData = false,
      index = 0;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (p < bytes.length) {
      checkCount();
      if (p + 12 > bytes.length) bad();
      const size = view.getUint32(p),
        name = ascii(bytes, p + 4, 4),
        end = p + 12 + size;
      if (
        end > bytes.length ||
        !/^[A-Za-z]{4}$/.test(name) ||
        size > 0x7fffffff
      )
        bad();
      if (view.getUint32(end - 4) !== pngCrc(bytes.subarray(p + 4, end - 4)))
        bad();
      if (index++ === 0 && (name !== "IHDR" || size !== 13)) bad();
      if (name === "IHDR" && index > 1) bad();
      if (name === "IDAT") sawData = true;
      // Keep rendering/animation chunks, remove known descriptive metadata only.
      if (["tEXt", "zTXt", "iTXt", "eXIf", "iCCP", "tIME"].includes(name))
        drop(name);
      else parts.push(bytes.subarray(p, end));
      p = end;
      if (name === "IEND") {
        if (size !== 0) bad();
        ended = true;
        break;
      }
    }
    if (!ended || !sawData) bad();
    if (p < bytes.length) drop("trailing data");
  } else if (format === "webp") {
    if (bytes.length < 20) bad();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const declared = view.getUint32(4, true) + 8;
    if (declared > bytes.length || declared < 20) bad();
    parts.push(bytes.subarray(0, 12));
    let p = 12,
      sawImage = false;
    while (p < declared) {
      checkCount();
      if (p + 8 > declared) bad();
      const name = ascii(bytes, p, 4),
        size = view.getUint32(p + 4, true),
        end = p + 8 + size + (size % 2);
      if (end > declared) bad();
      if (["VP8 ", "VP8L", "ANMF"].includes(name)) sawImage = true;
      if (["EXIF", "XMP ", "ICCP"].includes(name)) drop(name);
      else if (name === "VP8X") {
        if (size !== 10) bad();
        const chunk = new Uint8Array(bytes.subarray(p, end));
        chunk[8] &= ~0x2c;
        parts.push(chunk);
      } else parts.push(bytes.subarray(p, end));
      p = end;
    }
    if (!sawImage) bad();
    if (p < bytes.length) drop("trailing data");
  } else throw new ImageMetadataError("unsupported_format");
  const output = join(parts);
  if (format === "webp")
    new DataView(output.buffer).setUint32(4, output.length - 8, true);
  return {
    kind: "cleaned",
    format,
    bytes: output,
    originalBytes: bytes.length,
    removedBytes: bytes.length - output.length,
    removed,
    preservesCompressedPixels: true,
    appearanceMayChange: true,
  };
}

/** Preview only bounded still raster images; extraction itself never decodes pixels. */
export function imagePreview(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const format = imageFormat(bytes);
  let width = 0,
    height = 0;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "png" && bytes.length >= 33) {
    width = v.getUint32(16);
    height = v.getUint32(20);
    let p = 8,
      chunks = 0;
    while (p + 12 <= bytes.length) {
      if (++chunks > 100000) return null;
      const n = v.getUint32(p);
      if (p + n + 12 > bytes.length) return null;
      if (ascii(bytes, p + 4, 4) === "acTL") return null;
      p += n + 12;
    }
  } else if (format === "jpeg") {
    let p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p++] !== 255) return null;
      while (bytes[p] === 255) p++;
      const marker = bytes[p++];
      if (marker === 0xda || marker === 0xd9) break;
      if (p + 2 > bytes.length) return null;
      const n = v.getUint16(p);
      if (n < 2 || p + n > bytes.length) return null;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        n >= 8
      ) {
        height = v.getUint16(p + 3);
        width = v.getUint16(p + 5);
        break;
      }
      p += n;
    }
  } else if (format === "webp") {
    let p = 12;
    while (p + 8 <= bytes.length) {
      const name = ascii(bytes, p, 4),
        n = v.getUint32(p + 4, true),
        q = p + 8;
      if (q + n > bytes.length) return null;
      if (name === "ANIM" || name === "ANMF") return null;
      if (name === "VP8X" && n === 10) {
        if (bytes[q] & 2) return null;
        width = 1 + bytes[q + 4] + bytes[q + 5] * 256 + bytes[q + 6] * 65536;
        height = 1 + bytes[q + 7] + bytes[q + 8] * 256 + bytes[q + 9] * 65536;
      }
      if (name === "VP8 " && n >= 10 && !width) {
        width = v.getUint16(q + 6, true) & 16383;
        height = v.getUint16(q + 8, true) & 16383;
      }
      if (name === "VP8L" && n >= 5 && !width) {
        const bits = v.getUint32(q + 1, true);
        width = (bits & 16383) + 1;
        height = ((bits >>> 14) & 16383) + 1;
      }
      p = q + n + (n % 2);
    }
  }
  return width > 0 &&
    height > 0 &&
    width <= 8192 &&
    height <= 8192 &&
    width * height <= 32000000
    ? { width, height }
    : null;
}
