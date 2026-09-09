import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { expect, it } from "vitest";
import {
  cleanImage,
  imageFormat,
  imagePreview,
  pngCrc,
} from "../../src/image/metadata-containers";
import { inspectImage } from "../../src/image/metadata";

const jpeg = () =>
  sharp({ create: { width: 3, height: 2, channels: 3, background: "red" } })
    .jpeg()
    .withExif({
      IFD0: { Artist: "Private Artist", Orientation: "6" },
      IFD2: { DateTimeOriginal: "2026:01:01 00:00:00" },
    })
    .toBuffer();
it("reads actual JPEG PNG TIFF WebP GIF and HEIC/HEIF containers", async () => {
  for (const format of ["jpeg", "png", "tiff", "webp", "gif"] as const) {
    const bytes = await sharp({
      create: { width: 2, height: 3, channels: 3, background: "red" },
    })
      .toFormat(format)
      .toBuffer();
    const result = await inspectImage(bytes);
    expect(result.format).toBe(format);
    expect(result.fields).toBeGreaterThan(0);
  }
  const heic = new Uint8Array(
    await readFile(
      new URL("../fixtures/image-metadata/no-metadata.heic", import.meta.url),
    ),
  );
  expect((await inspectImage(heic)).format).toBe("heic");
  const heif = heic.slice();
  heif.set(new TextEncoder().encode("mif1"), 8);
  expect((await inspectImage(heif)).format).toBe("heic");
});
it("retains full JSON metadata and groups camera/basic fields without rendering HTML", async () => {
  const result = await inspectImage(await jpeg());
  expect(result.json).toContain("Private Artist");
  expect(
    result.groups
      .find((g) => g.id === "basic")
      ?.entries.some((e) => e.key === "Orientation"),
  ).toBe(true);
  expect(
    result.groups
      .find((g) => g.id === "camera")
      ?.entries.some((e) => e.key === "DateTimeOriginal"),
  ).toBe(true);
});
it("removes known metadata without reencoding JPEG PNG or WebP pixels", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const input = await sharp({
      create: { width: 3, height: 2, channels: 3, background: "red" },
    })
      .toFormat(format)
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Artist: "Secret" } })
      .toBuffer();
    const result = cleanImage(input);
    expect(result.removedBytes).toBeGreaterThan(0);
    expect(result.preservesCompressedPixels).toBe(true);
    expect(result.appearanceMayChange).toBe(true);
    expect((await inspectImage(result.bytes)).json).not.toContain("Secret");
    const before = await sharp(input).raw().toBuffer(),
      after = await sharp(result.bytes).raw().toBuffer();
    expect(after).toEqual(before);
    if (format === "webp") {
      const flag = result.bytes[20];
      expect(flag & 0x2c).toBe(0);
      expect(new DataView(result.bytes.buffer).getUint32(4, true)).toBe(
        result.bytes.length - 8,
      );
    }
  }
});
it("rejects truncated containers and bad PNG CRC rather than returning a false cleaned result", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "red" },
    })
      .toFormat(format)
      .toBuffer();
    expect(() => cleanImage(bytes.subarray(0, bytes.length - 5))).toThrow(
      "invalid_image",
    );
  }
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  png[20] ^= 1;
  expect(() => cleanImage(png)).toThrow("invalid_image");
  expect(pngCrc(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  expect(() => imageFormat(new Uint8Array(64 * 1048576 + 1))).toThrow(
    "too_large",
  );
  expect(() => cleanImage(new TextEncoder().encode("GIF89a"))).toThrow(
    "unsupported_format",
  );
});
it("removes trailing data and is idempotent", async () => {
  const original = await jpeg(),
    withTail = new Uint8Array(original.length + 6);
  withTail.set(original);
  withTail.set(new TextEncoder().encode("secret"), original.length);
  const first = cleanImage(withTail);
  expect(first.removed["trailing data"]).toBe(1);
  expect(cleanImage(first.bytes).bytes).toEqual(first.bytes);
});

it("reads signed GPS coordinates and local XMP, rejecting DTD metadata", async () => {
  const bytes = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "red" },
  })
    .jpeg()
    .withExif({
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "40/1 30/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "74/1 0/1 0/1",
      },
    })
    .toBuffer();
  expect((await inspectImage(bytes)).gps).toEqual({
    latitude: 40.5,
    longitude: -74,
  });
  const wrap = (xml: string) => {
    const body = Buffer.from(`http://ns.adobe.com/xap/1.0/\0${xml}`),
      segment = Buffer.alloc(body.length + 4);
    segment[0] = 255;
    segment[1] = 225;
    segment.writeUInt16BE(body.length + 2, 2);
    segment.set(body, 4);
    return Buffer.concat([bytes.subarray(0, 2), segment, bytes.subarray(2)]);
  };
  const xmp =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="Private creator"/></rdf:RDF></x:xmpmeta>';
  expect((await inspectImage(wrap(xmp))).json).toContain("Private creator");
  for (const depth of [3, 30]) {
    const nested =
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:n="urn:synthetic">' +
      "<n:item>".repeat(depth) +
      "nested value" +
      "</n:item>".repeat(depth) +
      "</rdf:Description></rdf:RDF></x:xmpmeta>";
    if (depth === 3)
      expect((await inspectImage(wrap(nested))).json).toContain("nested value");
    else await expect(inspectImage(wrap(nested))).rejects.toThrow("too_large");
  }

  const malformed = await inspectImage(
    wrap('<x:xmpmeta xmlns:x="adobe:ns:meta/"><broken></x:xmpmeta>'),
  );
  expect(malformed.warnings).toContain("xmp_skipped");
  expect(malformed.format).toBe("jpeg");
  expect(malformed.fields).toBeGreaterThan(0);
  expect(malformed.gps).toEqual({ latitude: 40.5, longitude: -74 });

  expect(
    (
      await inspectImage(
        wrap(
          `<!DOCTYPE x [<!ENTITY xx SYSTEM "https://example.com/private">]>${xmp}`,
        ),
      )
    ).warnings,
  ).toContain("xmp_skipped");
});
it("preserves progressive JPEG scan payloads while removing metadata", async () => {
  const bytes = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "blue" },
  })
    .jpeg({ progressive: true })
    .withExif({ IFD0: { Artist: "secret" } })
    .toBuffer();
  const out = cleanImage(bytes);
  expect(await sharp(out.bytes).raw().toBuffer()).toEqual(
    await sharp(bytes).raw().toBuffer(),
  );
});

it("bounds compressed PNG metadata and reports skipped content", async () => {
  const { zlibSync } = await import("fflate");
  const original = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const payload = Buffer.concat([
    Buffer.from("Comment\0\0"),
    zlibSync(new Uint8Array(17 * 1048576).fill(120)),
  ]);
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write("zTXt", 4);
  chunk.set(payload, 8);
  chunk.writeUInt32BE(pngCrc(chunk.subarray(4, -4)), chunk.length - 4);
  const input = Buffer.concat([
    original.subarray(0, -12),
    chunk,
    original.subarray(-12),
  ]);
  const result = await inspectImage(input);
  expect(result.warnings).toContain("compressed_metadata_skipped");
  expect(result.json.length).toBeLessThan(16384);
});

it("inflates bounded PNG zTXt metadata and rejects out-of-range EXIF GPS", async () => {
  const { zlibSync } = await import("fflate");
  const original = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const payload = Buffer.concat([
    Buffer.from("Comment\0\0"),
    zlibSync(new TextEncoder().encode("bounded compressed metadata")),
  ]);
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write("zTXt", 4);
  chunk.set(payload, 8);
  chunk.writeUInt32BE(pngCrc(chunk.subarray(4, -4)), chunk.length - 4);
  const inspected = await inspectImage(
    Buffer.concat([original.subarray(0, -12), chunk, original.subarray(-12)]),
  );
  expect(inspected.json).toContain("bounded compressed metadata");
  expect(inspected.warnings).not.toContain("compressed_metadata_skipped");

  const invalidGps = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "red" },
  })
    .jpeg()
    .withExif({
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "91/1 0/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "181/1 0/1 0/1",
      },
    })
    .toBuffer();
  expect((await inspectImage(invalidGps)).gps).toBeNull();
});
it("does not mutate Node Buffer input when rewriting container headers", async () => {
  for (const format of ["jpeg", "webp"] as const) {
    const original = await sharp({
        create: { width: 1, height: 1, channels: 3, background: "red" },
      })
        .toFormat(format)
        .withMetadata()
        .toBuffer(),
      copy = Buffer.from(original);
    cleanImage(original);
    expect(original).toEqual(copy);
  }
});

it("preserves every animated WebP frame, delay and loop without reencoding", async () => {
  const pixels = new Uint8Array(24);
  pixels.fill(255, 0, 12);
  const input = await sharp(pixels, {
      raw: { width: 2, height: 4, channels: 3, pageHeight: 2 },
    })
      .webp({ loop: 3, delay: [100, 200] })
      .withMetadata()
      .toBuffer(),
    out = cleanImage(input);
  const before = await sharp(input, { animated: true }).metadata(),
    after = await sharp(out.bytes, { animated: true }).metadata();
  expect(after.pages).toBe(2);
  expect(after.delay).toEqual(before.delay);
  expect(after.loop).toBe(3);
  expect(await sharp(out.bytes, { animated: true }).raw().toBuffer()).toEqual(
    await sharp(input, { animated: true }).raw().toBuffer(),
  );
});

it("declines JPEG previews with truncated marker padding or segment lengths", () => {
  for (const bytes of [
    [255, 216, 255, 255, 255, 255],
    [255, 216, 255, 255, 255, 192],
    [255, 216, 255, 255, 192, 0],
  ])
    expect(imagePreview(new Uint8Array(bytes))).toBeNull();
});

it("reads a complete JPEG frame after marker padding", () => {
  expect(
    imagePreview(
      new Uint8Array([255, 216, 255, 255, 192, 0, 8, 8, 0, 2, 0, 3, 0]),
    ),
  ).toEqual({ width: 3, height: 2 });
});

it("reads real lossy and lossless WebP previews without extended headers", async () => {
  for (const lossless of [false, true]) {
    const bytes = await sharp({
      create: { width: 7, height: 5, channels: 3, background: "red" },
    })
      .webp({ lossless })
      .toBuffer();
    expect(bytes.toString("ascii", 12, 16)).toBe(lossless ? "VP8L" : "VP8 ");
    expect(imagePreview(bytes)).toEqual({ width: 7, height: 5 });
  }
});

it("declines PNG preview animation, truncated chunks, excessive chunks and oversized declared dimensions", async () => {
  const png = await sharp({
    create: { width: 3, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  expect(imagePreview(png)).toEqual({ width: 3, height: 2 });
  const chunk = (name: string, data: Buffer) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(name, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(pngCrc(out.subarray(4, -4)), out.length - 4);
    return out;
  };
  const control = Buffer.alloc(8);
  control.writeUInt32BE(1, 0);
  expect(
    imagePreview(
      Buffer.concat([
        png.subarray(0, 33),
        chunk("acTL", control),
        png.subarray(33),
      ]),
    ),
  ).toBeNull();
  const truncated = Buffer.from(png);
  truncated.writeUInt32BE(png.length, 8);
  expect(imagePreview(truncated)).toBeNull();
  const empty = chunk("ruST", Buffer.alloc(0));
  expect(
    imagePreview(
      Buffer.concat([
        png.subarray(0, 33),
        ...Array.from({ length: 100001 }, () => empty),
        png.subarray(33),
      ]),
    ),
  ).toBeNull();
  for (const [width, height] of [
    [0, 2],
    [3, 0],
    [8193, 1],
    [1, 8193],
    [8000, 4001],
  ]) {
    const oversized = Buffer.from(png);
    oversized.writeUInt32BE(width, 16);
    oversized.writeUInt32BE(height, 20);
    oversized.writeUInt32BE(pngCrc(oversized.subarray(12, 29)), 29);
    expect(imagePreview(oversized)).toBeNull();
  }
});

it("declines malformed JPEG segments and early scan/end markers without a frame", () => {
  for (const bytes of [
    [255, 216, 0, 0, 0, 0],
    [255, 216, 255, 218, 0, 2],
    [255, 216, 255, 217, 0, 2],
    [255, 216, 255, 224, 0, 1],
    [255, 216, 255, 224, 0, 64],
  ])
    expect(imagePreview(new Uint8Array(bytes))).toBeNull();
});

it("declines WebP animation flags, animation chunks and truncated payloads", async () => {
  const bytes = await sharp({
    create: { width: 7, height: 5, channels: 3, background: "red" },
  })
    .webp()
    .withExif({ IFD0: { Artist: "Synthetic" } })
    .toBuffer();
  expect(bytes.toString("ascii", 12, 16)).toBe("VP8X");
  expect(imagePreview(bytes)).toEqual({ width: 7, height: 5 });
  const animated = Buffer.from(bytes);
  animated[20] |= 2;
  expect(imagePreview(animated)).toBeNull();
  const truncated = Buffer.from(bytes);
  truncated.writeUInt32LE(bytes.length, 16);
  expect(imagePreview(truncated)).toBeNull();
  for (const name of ["ANIM", "ANMF"]) {
    const chunk = Buffer.alloc(8);
    chunk.write(name, 0, "ascii");
    const output = Buffer.concat([
      bytes.subarray(0, 12),
      chunk,
      bytes.subarray(12),
    ]);
    output.writeUInt32LE(output.length - 8, 4);
    expect(imagePreview(output)).toBeNull();
  }
});

it("rejects malformed PNG structure independently of checksum validation", async () => {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const signature = png.subarray(0, 8);
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const end = offset + png.readUInt32BE(offset) + 12;
    chunks.push(png.subarray(offset, end));
    offset = end;
  }
  const chunk = (name: string, data: Buffer) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(name, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(pngCrc(out.subarray(4, -4)), out.length - 4);
    return out;
  };
  const ihdr = chunks[0];
  const withoutEnd = chunks.slice(0, -1);
  const malformed = [
    Buffer.concat([signature, ihdr, ...chunks]),
    Buffer.concat([signature, ...chunks.slice(1)]),
    Buffer.concat([
      signature,
      chunk("IHDR", Buffer.alloc(12)),
      ...chunks.slice(1),
    ]),
    Buffer.concat([signature, ...withoutEnd, chunk("IEND", Buffer.from([0]))]),
    Buffer.concat([
      signature,
      ...chunks.filter((c) => c.toString("ascii", 4, 8) !== "IDAT"),
    ]),
    Buffer.concat([
      signature,
      ihdr,
      chunk("bad!", Buffer.alloc(0)),
      ...chunks.slice(1),
    ]),
    Buffer.concat([signature, ...withoutEnd]),
    png.subarray(0, 12),
  ];
  for (const bytes of malformed)
    expect(() => cleanImage(bytes)).toThrow("invalid_image");
  const tailed = Buffer.concat([png, Buffer.from("synthetic trailer")]);
  const cleaned = cleanImage(tailed);
  expect(cleaned.removed["trailing data"]).toBe(1);
  expect(cleaned.bytes).toEqual(new Uint8Array(png));
});

it("rejects malformed WebP lengths and missing image chunks", async () => {
  const webp = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .webp()
    .toBuffer();
  const resize = (bytes: Buffer, size: number) => {
    const out = Buffer.from(bytes);
    out.writeUInt32LE(size, 4);
    return out;
  };
  const shortChunkHeader = resize(
    Buffer.concat([webp.subarray(0, 12), Buffer.alloc(9)]),
    13,
  );
  const oversizedPayload = Buffer.from(webp);
  oversizedPayload.writeUInt32LE(webp.length, 16);
  const noImage = Buffer.alloc(20);
  noImage.write("RIFF", 0);
  noImage.writeUInt32LE(12, 4);
  noImage.write("WEBPJUNK", 8);
  const invalidExtended = Buffer.from(noImage);
  invalidExtended.write("VP8X", 12);
  for (const bytes of [
    webp.subarray(0, 12),
    resize(webp, webp.length + 1),
    resize(webp, 11),
    shortChunkHeader,
    oversizedPayload,
    noImage,
    invalidExtended,
  ])
    expect(() => cleanImage(bytes)).toThrow("invalid_image");
});

it("removes odd and even WebP metadata chunks, rewrites RIFF length and retains decodable pixels", async () => {
  const original = await sharp({
    create: { width: 3, height: 2, channels: 3, background: "red" },
  })
    .webp()
    .toBuffer();
  const chunk = (name: string, size: number) => {
    const out = Buffer.alloc(8 + size + (size % 2));
    out.write(name, 0, "ascii");
    out.writeUInt32LE(size, 4);
    return out;
  };
  const bytes = Buffer.concat([
    original,
    chunk("EXIF", 3),
    chunk("XMP ", 4),
    chunk("ICCP", 1),
  ]);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  const input = Buffer.concat([bytes, Buffer.from("synthetic trailer")]);
  const cleaned = cleanImage(input);
  expect(cleaned.removed).toEqual({
    EXIF: 1,
    "XMP ": 1,
    ICCP: 1,
    "trailing data": 1,
  });
  expect(cleaned.bytes).toEqual(new Uint8Array(original));
  expect(new DataView(cleaned.bytes.buffer).getUint32(4, true)).toBe(
    cleaned.bytes.length - 8,
  );
  expect(await sharp(cleaned.bytes).raw().toBuffer()).toEqual(
    await sharp(original).raw().toBuffer(),
  );
});

it("rejects JPEG invalid markers, missing scans and incomplete segment lengths", () => {
  for (const bytes of [
    [255, 216, 255, 216],
    [255, 216, 255, 0],
    [255, 216, 255],
    [255, 216, 255, 208],
    [255, 216, 255, 224, 0],
    [255, 216, 255, 224, 0, 1],
    [255, 216, 255, 224, 0, 8],
    [255, 216, 255, 217],
    [255, 216, 255, 218, 0, 2, 255, 255],
  ])
    expect(() => cleanImage(new Uint8Array(bytes))).toThrow("invalid_image");
});

it("removes JPEG comments and thumbnails while retaining structural JFIF and Adobe markers", async () => {
  const original = await sharp({
    create: { width: 3, height: 2, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
  const segment = (marker: number, payload: Buffer) => {
    const out = Buffer.alloc(payload.length + 4);
    out[0] = 255;
    out[1] = marker;
    out.writeUInt16BE(payload.length + 2, 2);
    payload.copy(out, 4);
    return out;
  };
  const jfif = segment(
    224,
    Buffer.from([74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 255, 0, 0]),
  );
  const adobe = segment(
    238,
    Buffer.from([65, 100, 111, 98, 101, 0, 100, 0, 0, 0, 0, 1]),
  );
  const tem = Buffer.from([255, 1]);
  const input = Buffer.concat([
    original.subarray(0, 2),
    tem,
    jfif,
    adobe,
    segment(254, Buffer.from("synthetic comment")),
    segment(227, Buffer.from("synthetic metadata")),
    original.subarray(2),
  ]);
  const cleaned = cleanImage(input);
  expect(cleaned.removed).toEqual(
    expect.objectContaining({ COM: 1, APP3: 1, "JFIF thumbnail": 1 }),
  );
  expect(Buffer.from(cleaned.bytes).includes(adobe)).toBe(true);
  expect(Buffer.from(cleaned.bytes).includes(tem)).toBe(true);
  expect(await sharp(cleaned.bytes).raw().toBuffer()).toEqual(
    await sharp(original).raw().toBuffer(),
  );
  const invalidJfif = segment(224, Buffer.from("JFIF\0"));
  expect(() =>
    cleanImage(
      Buffer.concat([
        original.subarray(0, 2),
        invalidJfif,
        original.subarray(2),
      ]),
    ),
  ).toThrow("invalid_image");
});

it("limits JPEG segment work even when input bytes remain below the file limit", async () => {
  const original = await jpeg();
  const markers = Buffer.alloc(200002);
  for (let offset = 0; offset < markers.length; offset += 2) {
    markers[offset] = 255;
    markers[offset + 1] = 1;
  }
  const input = Buffer.concat([
    original.subarray(0, 2),
    markers,
    original.subarray(2),
  ]);
  expect(input.length).toBeLessThan(64 * 1048576);
  expect(() => cleanImage(input)).toThrow("too_large");
});

it("rejects unrecognized signatures including unsupported ISO base media brands", () => {
  for (const bytes of [
    new Uint8Array(),
    new TextEncoder().encode("not an image"),
    new TextEncoder().encode("0000ftypavif"),
  ]) {
    expect(() => imageFormat(bytes)).toThrow("unsupported_format");
  }
});

it("retains a JFIF segment without a thumbnail", async () => {
  const original = await jpeg();
  const jfif = Buffer.from([
    255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  ]);
  const input = Buffer.concat([
    original.subarray(0, 2),
    jfif,
    original.subarray(2),
  ]);
  const cleaned = cleanImage(input);
  expect(cleaned.removed["JFIF thumbnail"]).toBeUndefined();
  expect(Buffer.from(cleaned.bytes).includes(jfif)).toBe(true);
  expect(await sharp(cleaned.bytes).raw().toBuffer()).toEqual(
    await sharp(original).raw().toBuffer(),
  );
});

it("preserves scan bytes on both sides of an in-scan DNL segment", () => {
  // A structural stream exercises scan framing, not pixel decoding.
  const stream = new Uint8Array([
    255, 216, 255, 218, 0, 2, 1, 255, 220, 0, 4, 0, 2, 2, 255, 217,
  ]);
  const result = cleanImage(stream);
  expect(result.bytes).toEqual(stream);
  expect(result.removedBytes).toBe(0);
  expect(result.removed).toEqual({});
});

it("retains metadata while withholding coordinates outside geographic bounds", async () => {
  for (const [latitude, longitude] of [
    [91, 74],
    [40, 181],
  ]) {
    const bytes = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "red" },
    })
      .jpeg()
      .withExif({
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: `${latitude}/1 0/1 0/1`,
          GPSLongitudeRef: "W",
          GPSLongitude: `${longitude}/1 0/1 0/1`,
        },
      })
      .toBuffer();
    const result = await inspectImage(bytes);
    expect(result.gps).toBeNull();
    expect(
      result.groups.some(
        (group) => group.id === "gps" && group.entries.length > 0,
      ),
    ).toBe(true);
    expect(result.format).toBe("jpeg");
  }
});

it("skips damaged compressed PNG metadata while retaining image information", async () => {
  const png = await sharp({
    create: { width: 3, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const payload = Buffer.concat([
    Buffer.from("Comment\0\0"),
    Buffer.from([1, 2, 3, 4]),
  ]);
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write("zTXt", 4, "ascii");
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc(chunk.subarray(4, -4)), chunk.length - 4);
  const input = Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]);
  const result = await inspectImage(input);
  expect(result.warnings).toContain("compressed_metadata_skipped");
  expect(result.format).toBe("png");
  expect(result.preview).toEqual({ width: 3, height: 2 });
  expect(result.fields).toBeGreaterThan(0);
});

it("enforces character and UTF-8 limits on actual uncompressed PNG text metadata", async () => {
  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  for (const [size, byte] of [
    [16 * 1048576 + 1, 65],
    [8 * 1048576 + 1, 233],
  ]) {
    const payload = Buffer.concat([
      Buffer.from("Comment\0"),
      Buffer.alloc(size, byte),
    ]);
    const chunk = Buffer.alloc(payload.length + 12);
    chunk.writeUInt32BE(payload.length, 0);
    chunk.write("tEXt", 4, "ascii");
    payload.copy(chunk, 8);
    chunk.writeUInt32BE(pngCrc(chunk.subarray(4, -4)), chunk.length - 4);
    const input = Buffer.concat([
      png.subarray(0, -12),
      chunk,
      png.subarray(-12),
    ]);
    await expect(inspectImage(input)).rejects.toThrow("too_large");
  }
});

it("bounds JSON expansion independently of the input metadata byte count", async () => {
  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const payload = Buffer.concat([
    Buffer.from("Comment\0"),
    Buffer.alloc(2 * 1048576, 1),
  ]);
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write("tEXt", 4, "ascii");
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc(chunk.subarray(4, -4)), chunk.length - 4);
  const input = Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]);
  expect(input.length).toBeLessThan(3 * 1048576);
  await expect(inspectImage(input)).rejects.toThrow("too_large");
});

it("reads valid compressed PNG text and keeps the original pixels", async () => {
  const { zlibSync } = await import("fflate");
  const png = await sharp({
    create: { width: 3, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const text = "Private compressed comment é ".repeat(2000);
  const payload = Buffer.concat([
    Buffer.from("Comment\0\0"),
    zlibSync(Buffer.from(text, "latin1")),
  ]);
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write("zTXt", 4, "ascii");
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc(chunk.subarray(4, -4)), chunk.length - 4);
  const input = Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]);
  const result = await inspectImage(input);
  expect(result.warnings).toEqual([]);
  expect(result.preview).toEqual({ width: 3, height: 2 });
  expect(result.groups.flatMap((group) => group.entries)).toContainEqual(
    expect.objectContaining({ key: "Comment", value: text }),
  );
  const decompression = Object.getOwnPropertyDescriptor(
    globalThis,
    "DecompressionStream",
  );
  expect(decompression).toBeDefined();
  try {
    Object.defineProperty(globalThis, "DecompressionStream", {
      ...decompression,
      value: undefined,
    });
    const limited = await inspectImage(input);
    expect(limited.preview).toEqual({ width: 3, height: 2 });
    expect(limited.warnings).toContain("compressed_metadata_skipped");
    expect(limited.json).not.toContain(text);
  } finally {
    // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
    Object.defineProperty(globalThis, "DecompressionStream", decompression!);
  }
  const recovered = await inspectImage(input);
  expect(recovered.warnings).toEqual([]);
  expect(recovered.groups.flatMap((group) => group.entries)).toContainEqual(
    expect.objectContaining({ key: "Comment", value: text }),
  );
  const cleaned = cleanImage(input);
  expect((await inspectImage(cleaned.bytes)).json).not.toContain(
    "Private compressed comment",
  );
  expect(await sharp(cleaned.bytes).raw().toBuffer()).toEqual(
    await sharp(png).raw().toBuffer(),
  );
});

it("bounds cumulative decompression across individually valid PNG text chunks", async () => {
  const { zlibSync } = await import("fflate");
  const png = await sharp({
    create: { width: 3, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const chunks = ["First", "Second"].map((key) => {
    const payload = Buffer.concat([
      Buffer.from(`${key}\0\0`),
      zlibSync(Buffer.alloc(9 * 1048576, 65)),
    ]);
    const chunk = Buffer.alloc(payload.length + 12);
    chunk.writeUInt32BE(payload.length, 0);
    chunk.write("zTXt", 4, "ascii");
    payload.copy(chunk, 8);
    chunk.writeUInt32BE(pngCrc(chunk.subarray(4, -4)), chunk.length - 4);
    return chunk;
  });
  const input = Buffer.concat([
    png.subarray(0, -12),
    ...chunks,
    png.subarray(-12),
  ]);
  const result = await inspectImage(input);
  expect(result.warnings).toContain("compressed_metadata_skipped");
  expect(result.preview).toEqual({ width: 3, height: 2 });
  expect(result.fields).toBeGreaterThan(0);
  expect(result.json.length).toBeLessThan(16 * 1048576);
  expect(cleanImage(input).bytes).toEqual(new Uint8Array(png));
});

it("skips oversized PNG XMP before parsing its XML", async () => {
  const png = await sharp({
    create: { width: 3, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const payload = Buffer.concat([
    Buffer.from("XML:com.adobe.xmp\0\0\0\0\0"),
    Buffer.alloc(16 * 1048576 + 1, 32),
  ]);
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write("iTXt", 4, "ascii");
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc(chunk.subarray(4, -4)), chunk.length - 4);
  const result = await inspectImage(
    Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]),
  );
  expect(result.warnings).toContain("xmp_skipped");
  expect(result.preview).toEqual({ width: 3, height: 2 });
  expect(result.json.length).toBeLessThan(16384);
});

it("bounds wide XMP structures independently of byte size and nesting depth", async () => {
  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  for (const count of [10, 100001]) {
    const xml =
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:subject><rdf:Bag>' +
      "<rdf:li>value</rdf:li>".repeat(count) +
      "</rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta>";
    const payload = Buffer.from(`XML:com.adobe.xmp\0\0\0\0\0${xml}`);
    const chunk = Buffer.alloc(payload.length + 12);
    chunk.writeUInt32BE(payload.length, 0);
    chunk.write("iTXt", 4, "ascii");
    payload.copy(chunk, 8);
    chunk.writeUInt32BE(pngCrc(chunk.subarray(4, -4)), chunk.length - 4);
    const input = Buffer.concat([
      png.subarray(0, -12),
      chunk,
      png.subarray(-12),
    ]);
    expect(input.length).toBeLessThan(3 * 1048576);
    if (count === 10) {
      const result = await inspectImage(input);
      expect(result.warnings).toEqual([]);
      expect(result.json).toContain("value");
    } else await expect(inspectImage(input)).rejects.toThrow("too_large");
  }
});

it.each([
  ["1/0 0/1 0/1", "Infinity"],
  ["0/0 0/1 0/1", "NaN"],
])(
  "keeps zero-denominator GPS metadata serializable: %s",
  async (latitude, expected) => {
    const bytes = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "red" },
    })
      .jpeg()
      .withExif({
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: latitude,
          GPSLongitudeRef: "E",
          GPSLongitude: "20/1 0/1 0/1",
        },
      })
      .toBuffer();
    const result = await inspectImage(bytes);
    expect(result.gps).toBeNull();
    expect(JSON.parse(result.json).gps).toEqual({
      Latitude: expected,
      Longitude: 20,
    });
    expect(result.preview).toEqual({ width: 1, height: 1 });
    expect(result.groups.flatMap((group) => group.entries)).toContainEqual(
      expect.objectContaining({ key: "Latitude", value: expected }),
    );
  },
);

it("normalizes a real EXIF JPEG thumbnail and removes it without changing primary pixels", async () => {
  const primary = await sharp({
    create: { width: 3, height: 2, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
  const thumbnail = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "blue" },
  })
    .jpeg()
    .toBuffer();
  // Little-endian TIFF with an empty IFD0 followed by IFD1's thumbnail offset and length.
  const tiff = Buffer.alloc(44 + thumbnail.length);
  tiff.write("II", 0);
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt32LE(14, 10);
  tiff.writeUInt16LE(2, 14);
  for (const [index, tag, value] of [
    [0, 513, 44],
    [1, 514, thumbnail.length],
  ]) {
    const at = 16 + index * 12;
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(4, at + 2);
    tiff.writeUInt32LE(1, at + 4);
    tiff.writeUInt32LE(value, at + 8);
  }
  thumbnail.copy(tiff, 44);
  const body = Buffer.concat([Buffer.from("Exif\0\0"), tiff]);
  const segment = Buffer.alloc(body.length + 4);
  segment.writeUInt16BE(0xffe1, 0);
  segment.writeUInt16BE(body.length + 2, 2);
  body.copy(segment, 4);
  const bytes = Buffer.concat([
    primary.subarray(0, 2),
    segment,
    primary.subarray(2),
  ]);
  const result = await inspectImage(bytes);
  expect(JSON.parse(result.json).Thumbnail).toMatchObject({
    type: "image/jpeg",
    image: { binaryBytes: thumbnail.length },
    base64: thumbnail.toString("base64"),
  });
  expect(result.groups.flatMap((group) => group.entries)).toContainEqual(
    expect.objectContaining({
      key: "image",
      value: { binaryBytes: thumbnail.length },
      description: JSON.stringify({ binaryBytes: thumbnail.length }),
    }),
  );
  const cleaned = cleanImage(bytes);
  expect(
    JSON.parse((await inspectImage(cleaned.bytes)).json),
  ).not.toHaveProperty("Thumbnail");
  expect(await sharp(cleaned.bytes).raw().toBuffer()).toEqual(
    await sharp(primary).raw().toBuffer(),
  );
});

it("maps truncated JPEG metadata parser failures and still reads the intact image", async () => {
  const bytes = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .jpeg()
    .withMetadata()
    .toBuffer();
  for (const length of [208, 209]) {
    const truncated = bytes.subarray(0, length);
    expect(imageFormat(truncated)).toBe("jpeg");
    await expect(inspectImage(truncated)).rejects.toMatchObject({
      code: "invalid_image",
      message: "invalid_image",
    });
  }
  const result = await inspectImage(bytes);
  expect(result.format).toBe("jpeg");
  expect(result.preview).toEqual({ width: 2, height: 2 });
  expect(result.fields).toBeGreaterThan(0);
});

it("preserves the ICC date string returned by the real image parser", async () => {
  const bytes = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .png()
    .withMetadata()
    .toBuffer();
  const result = await inspectImage(bytes);
  const date = result.groups
    .flatMap((group) => group.entries)
    .find(
      (entry) => entry.source === "icc" && entry.key === "ICC Profile Date",
    );
  expect(date?.value).toBe("2018-03-20T09:14:29.000Z");
  expect(date?.description).toBe(date?.value);
  const json = JSON.parse(result.json);
  expect(json.icc["ICC Profile Date"].value).toBe(date?.value);
});

it("preserves missing GIF header fields as null when inspecting a partial file", async () => {
  const bytes = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "red" },
  })
    .gif()
    .toBuffer();
  const header = await inspectImage(bytes.subarray(0, 6));
  const data = JSON.parse(header.json);
  expect(header.format).toBe("gif");
  expect(header.preview).toBeNull();
  expect(data.gif["GIF Version"].value).toBe("89a");
  for (const field of [
    "Image Width",
    "Image Height",
    "Global Color Map",
    "Bits Per Pixel",
    "Color Resolution Depth",
  ])
    expect(data.gif[field]).toBeNull();
  const dimensions = JSON.parse(
    (await inspectImage(bytes.subarray(0, 10))).json,
  );
  expect(dimensions.gif["Image Width"].value).toBe(1);
  expect(dimensions.gif["Image Height"].value).toBe(1);
  expect(dimensions.gif["Global Color Map"]).toBeNull();
});
