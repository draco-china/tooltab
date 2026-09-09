import { randomFillSync } from "node:crypto";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import UPNG from "upng-js";
import { describe, expect, it } from "vitest";
import { encodeApng } from "../../src/image/apng";
import { convertAnimation, decodeGif, inspectGif } from "../../src/image/gif";
import {
  animationDefaults,
  GIF_OUTPUT_LIMIT,
  type AnimationRuntime,
  validateOptions,
  type AnimationOptions,
} from "../../src/image/gif-contract";

async function fixture() {
  const pixels = new Uint8Array(3 * 3 * 4 * 3);
  for (let frame = 0; frame < 3; frame++)
    for (let p = 0; p < 9; p++) {
      pixels[frame * 36 + p * 4 + frame] = 255;
      pixels[frame * 36 + p * 4 + 3] = 255;
    }
  const bytes = new Uint8Array(
    await sharp(pixels, {
      raw: { width: 3, height: 9, channels: 4, pageHeight: 3 },
    })
      .gif({ loop: 3, delay: [20, 100, 250] })
      .toBuffer(),
  );
  return { bytes, pixels };
}

describe("GIF animation core", () => {
  it("composites all frames and interprets finite GIF repeats as total plays", async () => {
    const { bytes, pixels } = await fixture();
    const decoded = decodeGif(bytes, animationDefaults, "apng");
    expect(inspectGif(bytes).plays).toBe(3);
    expect(decoded.delays).toEqual([20, 100, 250]);
    expect(new Uint8Array(decoded.frames.flatMap((f) => [...f]))).toEqual(
      pixels,
    );
    const apng = UPNG.decode(encodeApng(decoded).buffer);
    expect(apng.frames.map((f) => f.delay)).toEqual([20, 100, 250]);
    expect(UPNG.toRGBA8(apng).map((f) => new Uint8Array(f))).toEqual(
      decoded.frames,
    );
    expect(apng.tabs.acTL).toEqual({ num_frames: 3, num_plays: 3 });
  });

  it("retains long delays without wrapping and preserves exact total duration", async () => {
    const { bytes } = await fixture();
    const decoded = decodeGif(bytes, animationDefaults, "apng");
    decoded.delays = [100000, 100, 250];
    const apng = UPNG.decode(encodeApng(decoded).buffer);
    expect(apng.frames.reduce((n, f) => n + f.delay, 0)).toBe(100350);
    expect(apng.frames.length).toBe(4);
  });

  it("rejects truncation, invalid options and size amplification before allocation", async () => {
    const { bytes } = await fixture();
    expect(() => inspectGif(bytes.subarray(0, -1))).toThrow("invalid_input");
    expect(() =>
      validateOptions("webp", { ...animationDefaults, speed: NaN }),
    ).toThrow("invalid_options");
    const huge = bytes.slice();
    huge[6] = 255;
    huge[7] = 255;
    expect(() => inspectGif(huge)).toThrow("pixel_limit");
  });

  it("rejects malformed GIF headers and invalid option bounds", () => {
    expect(() => inspectGif(new Uint8Array())).toThrow("invalid_input");
    const invalid: AnimationOptions = {
      ...animationDefaults,
      scale: 401,
      loopMode: "custom",
      loopCount: 1,
    };
    expect(() => validateOptions("apng", invalid)).toThrow("invalid_options");
  });
});

function disposalGif(disposal: number, transparent: boolean) {
  const bytes = [
    ...new TextEncoder().encode("GIF89a"),
    3,
    0,
    2,
    0,
    0x81,
    0,
    0,
    255,
    255,
    255,
    255,
    0,
    0,
    0,
    255,
    0,
    0,
    0,
    255,
  ];
  const add = (
    x: number,
    y: number,
    w: number,
    h: number,
    indices: number[],
    dispose: number,
  ) => {
    bytes.push(
      0x21,
      0xf9,
      4,
      (dispose << 2) | (transparent ? 1 : 0),
      10,
      0,
      0,
      0,
      0x2c,
      x,
      0,
      y,
      0,
      w,
      0,
      h,
      0,
      0,
      2,
    );
    const codes = indices.flatMap((i) => [4, i]);
    codes.push(5);
    const packed: number[] = [];
    let bits = 0,
      acc = 0;
    for (const code of codes) {
      acc |= code << bits;
      bits += 3;
      if (bits >= 8) {
        packed.push(acc & 255);
        acc >>= 8;
        bits -= 8;
      }
    }
    if (bits) packed.push(acc);
    bytes.push(packed.length, ...packed, 0);
  };
  add(0, 0, 3, 2, [1, 1, 1, 1, 1, 1], 1);
  add(1, 0, 1, 1, [2], disposal);
  add(2, 1, 1, 1, [3], 1);
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

it.each([2, 3])(
  "matches independent GIF disposal %i with transparency",
  async (disposal) => {
    const gif = disposalGif(disposal, true);
    const ours = decodeGif(gif, animationDefaults, "apng");
    const independent = await sharp(gif, { animated: true })
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(Buffer.concat(ours.frames)).toEqual(independent);
  },
);

it("matches independent opaque background disposal", async () => {
  const gif = disposalGif(2, false);
  const ours = decodeGif(gif, animationDefaults, "apng");
  const independent = await sharp(gif, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(Buffer.concat(ours.frames)).toEqual(independent);
});

it("writes independently verified CRCs for every APNG chunk", async () => {
  const { bytes } = await fixture();
  const png = encodeApng(decodeGif(bytes, animationDefaults, "apng"));
  const view = new DataView(png.buffer);
  let at = 8;
  while (at < png.length) {
    const length = view.getUint32(at);
    expect(view.getUint32(at + 8 + length)).toBe(
      crc32(png.subarray(at + 4, at + 8 + length)),
    );
    at += length + 12;
  }
  expect(at).toBe(png.length);
});

it("converts and resizes real GIF frames into an APNG with matching result metadata", async () => {
  const { bytes } = await fixture();
  for (const scale of [100, 200]) {
    let resized = 0;
    const result = await convertAnimation(
      { kind: "apng", bytes, options: { ...animationDefaults, scale } },
      {
        async resize(frame, width, height, targetWidth, targetHeight) {
          resized++;
          return new Uint8Array(
            await sharp(frame, { raw: { width, height, channels: 4 } })
              .resize(targetWidth, targetHeight, { fit: "fill" })
              .raw()
              .toBuffer(),
          );
        },
        async webp() {
          throw new Error("APNG must not invoke the WebP encoder");
        },
      },
    );
    const width = scale === 100 ? 3 : 6;
    expect(resized).toBe(scale === 100 ? 0 : 3);
    expect(result).toMatchObject({
      width,
      height: width,
      originalWidth: 3,
      originalHeight: 3,
      frames: 3,
      durationMs: 370,
      plays: 3,
      originalBytes: bytes.length,
      outputBytes: result.bytes.length,
    });
    const image = UPNG.decode(result.bytes.buffer);
    expect(image.frames.map((frame) => frame.delay)).toEqual([20, 100, 250]);
    expect(image.tabs.acTL.num_plays).toBe(3);
    const frames = UPNG.toRGBA8(image);
    expect(frames).toHaveLength(3);
    for (let frame = 0; frame < 3; frame++) {
      const expected = new Uint8Array(width * width * 4);
      for (let p = 0; p < width * width; p++) {
        expected[p * 4 + frame] = 255;
        expected[p * 4 + 3] = 255;
      }
      expect(new Uint8Array(frames[frame])).toEqual(expected);
    }
  }
});

it("propagates a resize failure without attempting another frame or encoder", async () => {
  const { bytes } = await fixture();
  const failure = new Error("Resize backend unavailable");
  let calls = 0;
  await expect(
    convertAnimation(
      { kind: "apng", bytes, options: { ...animationDefaults, scale: 200 } },
      {
        async resize() {
          calls++;
          throw failure;
        },
        async webp() {
          throw new Error("Unexpected WebP encoding");
        },
      },
    ),
  ).rejects.toBe(failure);
  expect(calls).toBe(1);
});

it("rejects empty output from an external WebP encoder", async () => {
  const { bytes } = await fixture();
  let calls = 0;
  await expect(
    convertAnimation(
      { kind: "webp", bytes, options: animationDefaults },
      {
        async resize() {
          throw new Error("Unexpected resizing");
        },
        async webp() {
          calls++;
          return new Uint8Array();
        },
      },
    ),
  ).rejects.toMatchObject({ code: "conversion_failed" });
  expect(calls).toBe(1);
});

it("rejects every truncated prefix of a real multi-frame GIF", async () => {
  const { bytes } = await fixture();
  for (let length = 0; length < bytes.length; length++) {
    expect(
      () => inspectGif(bytes.subarray(0, length)),
      `prefix ${length}`,
    ).toThrow("invalid_input");
  }
});

it("limits APNG frame expansion caused by long delays", async () => {
  const { bytes } = await fixture();
  const animation = decodeGif(bytes, animationDefaults, "apng");
  animation.delays[0] = 65535 * 2000 + 1;
  expect(() => encodeApng(animation)).toThrow("frame_limit");
});

it("reports the actual WebP frame count after identical frames merge", async () => {
  const pixels = Buffer.from([255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255]);
  const bytes = new Uint8Array(
    await sharp(pixels, {
      raw: { width: 1, height: 3, channels: 4, pageHeight: 1 },
    })
      .gif({ keepDuplicateFrames: true, loop: 3, delay: [20, 100, 250] })
      .toBuffer(),
  );
  const result = await convertAnimation(
    { kind: "webp", bytes, options: animationDefaults },
    {
      async resize() {
        throw new Error("Unexpected resize");
      },
      async webp(animation) {
        return new Uint8Array(
          await sharp(Buffer.concat(animation.frames), {
            raw: {
              width: animation.width,
              height: animation.height * animation.frames.length,
              channels: 4,
              pageHeight: animation.height,
            },
          })
            .webp({
              lossless: true,
              delay: animation.delays,
              loop: animation.plays,
            })
            .toBuffer(),
        );
      },
    },
  );
  const metadata = await sharp(result.bytes, { animated: true }).metadata();
  expect(metadata.pages).toBe(2);
  expect(result.frames).toBe(metadata.pages);
  expect(metadata.delay).toEqual([120, 250]);
  expect(result.durationMs).toBe(370);
});

it("reports a static WebP as one frame", async () => {
  const bytes = new Uint8Array(
    await sharp({
      create: { width: 1, height: 1, channels: 4, background: "red" },
    })
      .gif()
      .toBuffer(),
  );
  const result = await convertAnimation(
    { kind: "webp", bytes, options: animationDefaults },
    {
      async resize() {
        throw new Error("Unexpected resize");
      },
      async webp(animation) {
        return new Uint8Array(
          await sharp(animation.frames[0], {
            raw: { width: 1, height: 1, channels: 4 },
          })
            .webp({ lossless: true })
            .toBuffer(),
        );
      },
    },
  );
  expect(result.frames).toBe(1);
  expect((await sharp(result.bytes).metadata()).format).toBe("webp");
});

it("rejects malformed WebP output from the external encoder", async () => {
  const { bytes } = await fixture();
  const webp = await sharp({
    create: { width: 1, height: 1, channels: 4, background: "red" },
  })
    .webp({ lossless: true })
    .toBuffer();
  const wrongRiff = Buffer.from(webp);
  wrongRiff.write("FAIL", 0);
  const wrongFormat = Buffer.from(webp);
  wrongFormat.write("FAIL", 8);
  const wrongSize = Buffer.from(webp);
  wrongSize.writeUInt32LE(0, 4);
  const container = (chunk: Buffer) => {
    const header = Buffer.alloc(12);
    header.write("RIFF", 0);
    header.writeUInt32LE(chunk.length + 4, 4);
    header.write("WEBP", 8);
    return Buffer.concat([header, chunk]);
  };
  const hugeChunk = Buffer.alloc(8);
  hugeChunk.write("ANMF", 0);
  hugeChunk.writeUInt32LE(100, 4);
  const shortFrame = Buffer.alloc(8);
  shortFrame.write("ANMF", 0);
  const noFrames = Buffer.alloc(8);
  noFrames.write("JUNK", 0);
  for (const output of [
    webp.subarray(0, 8),
    wrongRiff,
    wrongFormat,
    wrongSize,
    container(Buffer.alloc(3)),
    container(hugeChunk),
    container(shortFrame),
    container(noFrames),
  ]) {
    await expect(
      convertAnimation(
        { kind: "webp", bytes, options: animationDefaults },
        {
          async resize() {
            throw new Error("Unexpected resize");
          },
          async webp() {
            return new Uint8Array(output);
          },
        },
      ),
    ).rejects.toMatchObject({ code: "conversion_failed" });
  }
});

function tinyGif(width = 1, height = 1, count = 1, extension: number[] = []) {
  const header = [
    ...new TextEncoder().encode("GIF89a"),
    width & 255,
    width >> 8,
    height & 255,
    height >> 8,
    0x80,
    0,
    0,
    0,
    0,
    0,
    255,
    255,
    255,
  ];
  // One black pixel: clear, palette index 0, end, each encoded with three bits.
  const frame = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0];
  return new Uint8Array([
    ...header,
    ...extension,
    ...Array.from({ length: count }, () => frame).flat(),
    0x3b,
  ]);
}

it("enforces input, frame and cumulative pixel budgets before decoding", () => {
  expect(() => inspectGif(new Uint8Array(64 * 1048576 + 1))).toThrow(
    "input_limit",
  );
  expect(inspectGif(tinyGif(1, 1, 2000)).frames).toBe(2000);
  expect(() => inspectGif(tinyGif(1, 1, 2001))).toThrow("frame_limit");
  expect(inspectGif(tinyGif(8192, 8192, 2)).frames).toBe(2);
  expect(() => inspectGif(tinyGif(8192, 8192, 3))).toThrow("pixel_limit");
  for (const [width, height] of [
    [0, 1],
    [1, 0],
  ])
    expect(() => inspectGif(tinyGif(width, height))).toThrow("invalid_input");
  for (const [width, height] of [
    [1, 16385],
    [8193, 8193],
  ])
    expect(() => inspectGif(tinyGif(width, height))).toThrow("pixel_limit");
  for (const [width, height, count] of [
    [5000, 1, 1],
    [1, 5000, 1],
    [3000, 3000, 1],
    [2048, 2048, 3],
  ])
    expect(() =>
      decodeGif(
        tinyGif(width, height, count),
        { ...animationDefaults, scale: 400 },
        "apng",
      ),
    ).toThrow("pixel_limit");
});

it("preserves loop overrides, absent delays and minimum output dimensions", () => {
  const gif = tinyGif();
  const decoded = decodeGif(gif, { ...animationDefaults, scale: 10 }, "apng");
  expect(decoded).toMatchObject({
    width: 1,
    height: 1,
    plays: 1,
    delays: [100],
  });
  expect(decoded.frames).toEqual([new Uint8Array([0, 0, 0, 255])]);
  expect(
    decodeGif(gif, { ...animationDefaults, loopMode: "infinite" }, "webp")
      .plays,
  ).toBe(0);
  expect(
    decodeGif(
      gif,
      { ...animationDefaults, loopMode: "custom", loopCount: 7 },
      "apng",
    ).plays,
  ).toBe(7);
  const loop = (repeats: number) => [
    0x21,
    0xff,
    11,
    ...new TextEncoder().encode("NETSCAPE2.0"),
    3,
    1,
    repeats & 255,
    repeats >> 8,
    0,
  ];
  expect(inspectGif(tinyGif(1, 1, 1, loop(0))).plays).toBe(0);
  expect(
    decodeGif(tinyGif(1, 1, 1, loop(65535)), animationDefaults, "apng").plays,
  ).toBe(65536);
  expect(() =>
    decodeGif(tinyGif(1, 1, 1, loop(65535)), animationDefaults, "webp"),
  ).toThrow("unsupported");
});

it("rejects unsupported text rendering and invalid extension declarations", () => {
  expect(() => inspectGif(tinyGif(1, 1, 1, [0x21, 1]))).toThrow("unsupported");
  for (const extension of [
    [0x21, 0xff, 10],
    [0x21, 0xf9, 3],
    [0x21, 0xf9, 4, 16, 0, 0, 0, 0],
    [0x21, 0xf9, 4, 0, 0, 0, 0, 1],
  ])
    expect(() => inspectGif(tinyGif(1, 1, 1, extension))).toThrow(
      "invalid_input",
    );
  expect(
    inspectGif(tinyGif(1, 1, 1, [0x21, 0xfe, 3, 65, 66, 67, 0])).frames,
  ).toBe(1);
});

function gifWithCodes(codes: number[], width = 1) {
  const gif = tinyGif(width);
  const packed: number[] = [];
  let accumulator = 0;
  let bits = 0;
  // These short streams never reach the first LZW code-width increase.
  for (const code of codes) {
    accumulator |= code << bits;
    bits += 3;
    if (bits >= 8) {
      packed.push(accumulator & 255);
      accumulator >>= 8;
      bits -= 8;
    }
  }
  if (bits) packed.push(accumulator);
  const prefix = gif.slice(0, 30);
  prefix[24] = width;
  return new Uint8Array([
    ...prefix,
    ...(packed.length ? [packed.length, ...packed] : []),
    0,
    0x3b,
  ]);
}

it("rejects structurally complete GIFs with invalid LZW streams", () => {
  for (const codes of [
    [],
    [4, 5],
    [4, 7, 5],
    [4, 6, 5],
    [4, 0, 0, 5],
    [4, 0],
  ]) {
    const gif = gifWithCodes(codes);
    expect(inspectGif(gif).frames).toBe(1);
    expect(
      () => decodeGif(gif, animationDefaults, "apng"),
      `codes ${codes}`,
    ).toThrow("invalid_input");
  }
});

it("decodes the LZW next-code special case using an independent image decoder", async () => {
  const gif = gifWithCodes([4, 0, 6, 5], 3);
  const decoded = decodeGif(gif, animationDefaults, "apng");
  const independent = await sharp(gif).ensureAlpha().raw().toBuffer();
  expect(Buffer.from(decoded.frames[0])).toEqual(independent);
  expect(decoded.frames[0]).toEqual(
    new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]),
  );
});

it("returns a domain error for missing palettes and out-of-range palette indices", () => {
  const source = tinyGif();
  const missingPalette = new Uint8Array([
    ...source.subarray(0, 13),
    ...source.subarray(19),
  ]);
  missingPalette[10] = 0;
  for (const gif of [missingPalette, gifWithCodes([4, 2, 5])]) {
    expect(inspectGif(gif).frames).toBe(1);
    expect(() => decodeGif(gif, animationDefaults, "apng")).toThrow(
      expect.objectContaining({ code: "invalid_input" }),
    );
  }
});

it("decodes a local palette without requiring a global palette", async () => {
  const source = tinyGif();
  const header = source.slice(0, 13);
  header[10] = 0;
  const descriptor = source.slice(19, 29);
  descriptor[9] = 0x80;
  const gif = new Uint8Array([
    ...header,
    ...descriptor,
    255,
    0,
    0,
    0,
    255,
    0,
    ...source.subarray(29),
  ]);
  const result = decodeGif(gif, animationDefaults, "apng");
  expect(result.frames).toEqual([new Uint8Array([255, 0, 0, 255])]);
  expect(Buffer.from(result.frames[0])).toEqual(
    await sharp(gif).ensureAlpha().raw().toBuffer(),
  );
});

it("validates recognized loop extensions while allowing unrelated application data", () => {
  const application = (name: string, blocks: number[]) => [
    0x21,
    0xff,
    11,
    ...new TextEncoder().encode(name),
    ...blocks,
  ];
  for (const name of ["NETSCAPE2.0", "ANIMEXTS1.0"]) {
    expect(
      inspectGif(tinyGif(1, 1, 1, application(name, [3, 1, 4, 0, 0]))).plays,
    ).toBe(5);
    for (const blocks of [[0], [2, 1, 4, 0], [3, 2, 4, 0, 0]])
      expect(() =>
        inspectGif(tinyGif(1, 1, 1, application(name, blocks))),
      ).toThrow("invalid_input");
  }
  expect(
    inspectGif(tinyGif(1, 1, 1, application("CUSTOMAPP01", [2, 42, 43, 0]))),
  ).toMatchObject({ plays: 1, repeats: undefined, frames: 1 });
});

it("rejects real lossless APNG output beyond the artifact capacity", () => {
  // Four uncompressible 4096-square RGBA frames fit the pixel limit, but
  // compressed streams plus PNG framing exceed the 256 MiB output limit.
  const pixels = randomFillSync(new Uint8Array(4096 * 4096 * 4));
  expect(() =>
    encodeApng({
      originalWidth: 4096,
      originalHeight: 4096,
      width: 4096,
      height: 4096,
      frames: [pixels, pixels, pixels, pixels],
      delays: [100, 100, 100, 100],
      plays: 0,
    }),
  ).toThrow("output_limit");
}, 60_000);

it("rejects GIF image rectangles outside their logical screen", () => {
  const header = [
    71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255,
  ];
  const image = [44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59];
  expect(inspectGif(new Uint8Array([...header, ...image]))).toMatchObject({
    width: 1,
    height: 1,
    frames: 1,
  });
  for (const [offset, value] of [
    [5, 0],
    [7, 0],
    [1, 1],
    [3, 1],
  ]) {
    const invalid = image.slice();
    invalid[offset] = value;
    expect(() => inspectGif(new Uint8Array([...header, ...invalid]))).toThrow(
      "invalid_input",
    );
  }
  expect(() => inspectGif(new Uint8Array([...header, 127, ...image]))).toThrow(
    "invalid_input",
  );
});

it("matches an independent decoder for a dense indexed-color GIF", async () => {
  const pixels = new Uint8Array(128 * 128 * 3);
  let seed = 0x12345678;
  for (let i = 0; i < pixels.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    pixels[i] = seed & 255;
  }
  const bytes = new Uint8Array(
    await sharp(pixels, {
      raw: { width: 128, height: 128, channels: 3 },
    })
      .gif({ colours: 256, dither: 0 })
      .toBuffer(),
  );
  expect(bytes.length).toBeGreaterThan(4096);
  const decoded = decodeGif(bytes, animationDefaults, "apng");
  expect(decoded.frames).toHaveLength(1);
  expect(Buffer.from(decoded.frames[0])).toEqual(
    await sharp(bytes).ensureAlpha().raw().toBuffer(),
  );
});

it("rejects a valid oversized WebP container from the encoder and accepts a fresh conversion", async () => {
  const bytes = tinyGif();
  const runtime: AnimationRuntime = {
    async resize() {
      throw new Error("Unexpected resize");
    },
    async webp(animation) {
      return new Uint8Array(
        await sharp(animation.frames[0], {
          raw: {
            width: animation.width,
            height: animation.height,
            channels: 4,
          },
        })
          .webp({ lossless: true })
          .toBuffer(),
      );
    },
  };
  const oversized: AnimationRuntime = {
    ...runtime,
    async webp(animation) {
      const encoded = await runtime.webp(animation);
      // RIFF permits unknown chunks. Preserve the actual encoded image while
      // exercising the external encoder's output-size boundary with ancillary data.
      const output = new Uint8Array(GIF_OUTPUT_LIMIT + 2);
      output.set(encoded);
      output.set(new TextEncoder().encode("JUNK"), encoded.length);
      const view = new DataView(output.buffer);
      view.setUint32(4, output.length - 8, true);
      view.setUint32(
        encoded.length + 4,
        output.length - encoded.length - 8,
        true,
      );
      expect(await sharp(output).ensureAlpha().raw().toBuffer()).toEqual(
        Buffer.from(animation.frames[0]),
      );
      return output;
    },
  };
  await expect(
    convertAnimation(
      { kind: "webp", bytes, options: animationDefaults },
      oversized,
    ),
  ).rejects.toMatchObject({ code: "output_limit" });
  const recovered = await convertAnimation(
    { kind: "webp", bytes, options: animationDefaults },
    runtime,
  );
  expect(recovered.frames).toBe(1);
  expect(recovered.outputBytes).toBeLessThan(GIF_OUTPUT_LIMIT);
  expect(await sharp(recovered.bytes).ensureAlpha().raw().toBuffer()).toEqual(
    await sharp(bytes).ensureAlpha().raw().toBuffer(),
  );
});
