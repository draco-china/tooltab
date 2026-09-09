import { crc32, inflateSync } from "node:zlib";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import UPNG from "upng-js";
import { encodeApng } from "../../src/image/apng";
import { expect, it } from "vitest";
import { optimizeImage, svgConfig } from "../../src/image/optimizer-runtime";
import {
  inspectPng,
  svgDefaults,
  type OptimizerJob,
} from "../../src/image/optimizer";

const require = createRequire(import.meta.url);

it("optimizes SVG with selected metadata, comment, id, and dimension options", async () => {
  const input =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10" viewBox="0 0 20 10"><!-- keep --><metadata>Creator</metadata><style>.red{fill:red}</style><rect id="important" class="red" width="20" height="10"/></svg>';
  const preserved = new TextDecoder().decode(
    (
      await optimizeImage({
        kind: "svg",
        input,
        options: {
          ...svgDefaults,
          removeComments: false,
          removeMetadata: false,
          cleanupIds: false,
        },
      })
    ).bytes,
  );
  expect(preserved).toMatch(/<!--\s*keep\s*-->/);
  expect(preserved).toContain("Creator");
  expect(preserved).toContain("important");
  const aggressive = new TextDecoder().decode(
    (
      await optimizeImage({
        kind: "svg",
        input,
        options: { ...svgDefaults, removeDimensions: true, inlineStyles: true },
      })
    ).bytes,
  );
  expect(aggressive).not.toMatch(/<svg[^>]*width=/);
  expect(aggressive).not.toContain("Creator");
  expect(aggressive).toContain("viewBox");
});

it("keeps SVGO output behavior and resource guard errors", async () => {
  const input =
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://example.com/image.png" width="20" height="20"/></svg>';
  const output = new TextDecoder().decode(
    (await optimizeImage({ kind: "svg", input, options: svgDefaults })).bytes,
  );
  expect(output).toContain("alert(1)");
  expect(output).toContain("https://example.com/image.png");
  await expect(
    optimizeImage({
      kind: "svg",
      input: `<svg>${"<g/>".repeat(100001)}</svg>`,
      options: svgDefaults,
    }),
  ).rejects.toThrow("input_limit");
  expect(svgConfig(svgDefaults).plugins).toHaveLength(2);
});

it("optimizes a real PNG with the oxipng WASM runtime and preserves pixels", async () => {
  const pixels = new Uint8Array([0, 63, 31, 15, 0, 255, 128, 64]);
  const png = new Uint8Array(
    await sharp(pixels, { raw: { width: 2, height: 1, channels: 4 } })
      .png()
      .toBuffer(),
  );
  const wasm = new Uint8Array(
    await readFile(
      require.resolve("@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm"),
    ),
  );
  const job: OptimizerJob = {
    kind: "png",
    bytes: png,
    options: { level: 2, interlace: false, optimiseAlpha: true },
  };
  const result = await optimizeImage(job, wasm);
  expect(result.width).toBe(2);
  expect(result.height).toBe(1);
  expect(result.bytes.length).toBeGreaterThan(0);
  expect(await sharp(result.bytes).ensureAlpha().raw().toBuffer()).toEqual(
    Buffer.from(pixels),
  );
});

it("rejects PNG execution without a WASM binary before loading the runtime", async () => {
  const job: OptimizerJob = {
    kind: "png",
    bytes: new Uint8Array(
      await sharp({
        create: { width: 1, height: 1, channels: 4, background: "red" },
      })
        .png()
        .toBuffer(),
    ),
    options: { level: 2, interlace: false, optimiseAlpha: true },
  };
  await expect(optimizeImage(job)).rejects.toMatchObject({
    code: "unsupported",
  });
});

it("maps malformed SVG parser failures while preserving domain guard errors", async () => {
  await expect(
    optimizeImage({
      kind: "svg",
      input: "<svg><path></svg>",
      options: svgDefaults,
    }),
  ).rejects.toMatchObject({ code: "optimize_failed" });
  for (const input of ["<html/>", "<svg/><svg/>", "<!-- only comment -->"])
    await expect(
      optimizeImage({ kind: "svg", input, options: svgDefaults }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  const result = await optimizeImage({
    kind: "svg",
    input:
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="2" fill="#ff0000"/></svg>',
    options: { ...svgDefaults, convertColors: false, multipass: false },
  });
  expect(new TextDecoder().decode(result.bytes)).toContain("#ff0000");
});

it("rejects invalid compressed PNG data with valid chunk CRCs, then permits a retry", async () => {
  const png = new Uint8Array(
    await sharp({
      create: { width: 2, height: 2, channels: 4, background: "red" },
    })
      .png()
      .toBuffer(),
  );
  const broken = png.slice();
  const view = new DataView(broken.buffer);
  let corrupted = false;
  for (let at = 8; at < broken.length; ) {
    const length = view.getUint32(at);
    if (new TextDecoder().decode(broken.subarray(at + 4, at + 8)) === "IDAT") {
      broken.fill(0, at + 8, at + 8 + length);
      view.setUint32(
        at + 8 + length,
        crc32(broken.subarray(at + 4, at + 8 + length)),
      );
      corrupted = true;
      break;
    }
    at += length + 12;
  }
  expect(corrupted).toBe(true);
  expect(inspectPng(broken)).toMatchObject({ width: 2, height: 2 });
  const wasm = new Uint8Array(
    await readFile(
      require.resolve("@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm"),
    ),
  );
  await expect(
    optimizeImage(
      {
        kind: "png",
        bytes: broken,
        options: { level: 2, interlace: false, optimiseAlpha: true },
      },
      wasm,
    ),
  ).rejects.toMatchObject({ code: "optimize_failed" });
  const result = await optimizeImage(
    {
      kind: "png",
      bytes: png,
      options: { level: 2, interlace: true, optimiseAlpha: false },
    },
    wasm,
  );
  expect(result.interlaced).toBe(
    (await sharp(result.bytes).metadata()).isProgressive,
  );
  expect(await sharp(result.bytes).ensureAlpha().raw().toBuffer()).toEqual(
    await sharp(png).ensureAlpha().raw().toBuffer(),
  );
});

it("produces and reports actual Adam7 interlacing when optimizing an uncompressed gradient", async () => {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const at = (y * 64 + x) * 4;
      pixels[at] = x * 4;
      pixels[at + 1] = y * 4;
      pixels[at + 3] = 255;
    }
  const bytes = new Uint8Array(
    await sharp(pixels, { raw: { width: 64, height: 64, channels: 4 } })
      .png({ compressionLevel: 0 })
      .toBuffer(),
  );
  const wasm = new Uint8Array(
    await readFile(
      require.resolve("@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm"),
    ),
  );
  const result = await optimizeImage(
    {
      kind: "png",
      bytes,
      options: { level: 2, interlace: true, optimiseAlpha: false },
    },
    wasm,
  );
  expect(result.interlaced).toBe(true);
  expect((await sharp(result.bytes).metadata()).isProgressive).toBe(true);
  expect(await sharp(result.bytes).ensureAlpha().raw().toBuffer()).toEqual(
    Buffer.from(pixels),
  );
});

it("preserves text and ICC profile content and reports metadata changes from actual PNG chunks", async () => {
  const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
  const encoded = new Uint8Array(
    await sharp(pixels, { raw: { width: 2, height: 1, channels: 4 } })
      .withIccProfile("srgb")
      .png()
      .toBuffer(),
  );
  const payload = new TextEncoder().encode("Author\0ToolTab");
  const text = Buffer.alloc(payload.length + 12);
  text.writeUInt32BE(payload.length, 0);
  text.write("tEXt", 4);
  text.set(payload, 8);
  text.writeUInt32BE(crc32(text.subarray(4, -4)), text.length - 4);
  const bytes = new Uint8Array(
    Buffer.concat([encoded.subarray(0, 33), text, encoded.subarray(33)]),
  );
  const wasm = new Uint8Array(
    await readFile(
      require.resolve("@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm"),
    ),
  );
  const result = await optimizeImage(
    {
      kind: "png",
      bytes,
      options: { level: 2, interlace: false, optimiseAlpha: false },
    },
    wasm,
  );
  const before = inspectPng(bytes).chunks;
  const after = inspectPng(result.bytes).chunks;
  expect(after.find((chunk) => chunk.type === "tEXt")?.bytes).toEqual(payload);
  const profile = (chunks: typeof before) => {
    // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
    const data = chunks.find((chunk) => chunk.type === "iCCP")!.bytes;
    return inflateSync(data.subarray(data.indexOf(0) + 2));
  };
  expect(profile(after)).toEqual(profile(before));
  expect(await sharp(result.bytes).ensureAlpha().raw().toBuffer()).toEqual(
    await sharp(bytes).ensureAlpha().raw().toBuffer(),
  );
  expect(result.chunksRemoved).toEqual([]);
  for (const name of result.chunksChanged ?? []) {
    const original = before
      .filter((chunk) => chunk.type === name)
      .map((chunk) => Buffer.from(chunk.bytes));
    const output = after
      .filter((chunk) => chunk.type === name)
      .map((chunk) => Buffer.from(chunk.bytes));
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toEqual(original);
  }
});

it("preserves APNG animation controls and both decoded frames", async () => {
  const frames = [
    new Uint8Array([255, 0, 0, 255]),
    new Uint8Array([0, 0, 255, 255]),
  ];
  const bytes = encodeApng({
    width: 1,
    height: 1,
    originalWidth: 1,
    originalHeight: 1,
    frames,
    delays: [100, 250],
    plays: 3,
  });
  const wasm = new Uint8Array(
    await readFile(
      require.resolve("@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm"),
    ),
  );
  const result = await optimizeImage(
    {
      kind: "png",
      bytes,
      options: { level: 2, interlace: false, optimiseAlpha: false },
    },
    wasm,
  );
  expect(result.animated).toBe(true);
  const decoded = UPNG.decode(result.bytes.buffer);
  expect(decoded.frames.map((frame) => frame.delay)).toEqual([100, 250]);
  expect(decoded.tabs.acTL).toEqual({ num_frames: 2, num_plays: 3 });
  expect(UPNG.toRGBA8(decoded).map((frame) => new Uint8Array(frame))).toEqual(
    frames,
  );
  expect(result.chunksRemoved).toEqual([]);
  expect(result.chunksChanged).toEqual([]);
});

it("reports removed background and significant-bit chunks while retaining safe ancillary data", async () => {
  const original = await sharp({
    create: { width: 16, height: 16, channels: 4, background: "red" },
  })
    .png()
    .toBuffer();
  const wasm = new Uint8Array(
    await readFile(
      require.resolve("@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm"),
    ),
  );
  const cases = [
    { type: "bKGD", data: [0, 255, 0, 0, 0, 0], removed: true },
    { type: "sBIT", data: [8, 8, 8, 8], removed: true },
    { type: "vpAG", data: [0, 0, 0, 16, 0, 0, 0, 16, 0], removed: false },
  ];
  for (const { type, data, removed } of cases) {
    const chunk = Buffer.alloc(data.length + 12);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4);
    chunk.set(data, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
    const bytes = new Uint8Array(
      Buffer.concat([original.subarray(0, 33), chunk, original.subarray(33)]),
    );
    const result = await optimizeImage(
      {
        kind: "png",
        bytes,
        options: { level: 2, interlace: false, optimiseAlpha: false },
      },
      wasm,
    );
    expect(result.chunksRemoved).toEqual(removed ? [type] : []);
    expect(result.chunksChanged).toEqual([]);
    const actual = inspectPng(result.bytes).chunks.filter(
      (part) => part.type === type,
    );
    expect(actual.map((part) => Array.from(part.bytes))).toEqual(
      removed ? [] : [data],
    );
    expect(await sharp(result.bytes).ensureAlpha().raw().toBuffer()).toEqual(
      await sharp(bytes).ensureAlpha().raw().toBuffer(),
    );
  }
});
