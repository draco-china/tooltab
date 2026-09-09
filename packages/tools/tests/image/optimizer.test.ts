import { crc32 } from "node:zlib";
import sharp from "sharp";
import { expect, it } from "vitest";
import {
  inspectPng,
  metrics,
  optimizedName,
  OPTIMIZER_OUTPUT_LIMIT,
  pngDefaults,
  svgDefaults,
  validateJob,
  type OptimizerJob,
} from "../../src/image/optimizer";

async function pngFixture() {
  return new Uint8Array(
    await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 4,
        background: { r: 12, g: 34, b: 56, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer(),
  );
}

it("inspects real PNG dimensions, bit depth, animation flag, and chunks", async () => {
  const bytes = await pngFixture();
  const result = inspectPng(bytes);
  expect(result).toMatchObject({
    width: 2,
    height: 1,
    bitDepth: 8,
    animated: false,
  });
  expect(result.chunks[0]?.type).toBe("IHDR");
  expect(result.chunks.some((chunk) => chunk.type === "IDAT")).toBe(true);
  expect(result.chunks.at(-1)?.type).toBe("IEND");
});

it("rejects damaged PNG chunk CRCs independently verified with node:zlib", async () => {
  const bytes = await pngFixture();
  const damaged = bytes.slice();
  let at = 8;
  while (at + 12 <= damaged.length) {
    const length = new DataView(damaged.buffer).getUint32(at);
    const type = new TextDecoder().decode(damaged.subarray(at + 4, at + 8));
    if (type === "IDAT") {
      const expected = crc32(damaged.subarray(at + 4, at + 8 + length));
      const actual = new DataView(damaged.buffer).getUint32(at + 8 + length);
      expect(actual).toBe(expected);
      damaged[at + 8 + length + 3] ^= 1;
      break;
    }
    at += length + 12;
  }
  expect(() => inspectPng(damaged)).toThrow("invalid_input");
});

it("validates PNG options and SVG options/input limits", async () => {
  const bytes = await pngFixture();
  const validPng: OptimizerJob = {
    kind: "png",
    bytes,
    options: pngDefaults,
  };
  expect(() => validateJob(validPng)).not.toThrow();
  for (const level of [-1, 7, 2.5])
    expect(() =>
      validateJob({
        ...validPng,
        options: { ...pngDefaults, level },
      }),
    ).toThrow("invalid_options");
  const validSvg: OptimizerJob = {
    kind: "svg",
    input: "<svg>é</svg>",
    options: svgDefaults,
  };
  expect(() => validateJob(validSvg)).not.toThrow();
  expect(() =>
    validateJob({
      ...validSvg,
      options: { ...svgDefaults, inlineStyles: "yes" as never },
    }),
  ).toThrow("invalid_options");
  expect(() =>
    validateJob({
      ...validSvg,
      input: `${"é".repeat(8_388_608)}a`,
    }),
  ).toThrow("input_limit");
});

it("rejects invalid PNG input and malformed or unsafe SVG text", () => {
  expect(() =>
    validateJob({ kind: "png", bytes: new Uint8Array(), options: pngDefaults }),
  ).toThrow("invalid_input");
  for (const input of [
    "",
    "   ",
    "<svg>\u0000</svg>",
    "<svg>\ud800</svg>",
    "<!DOCTYPE svg><svg/>",
    '<!ENTITY x "x"><svg/>',
  ])
    expect(() =>
      validateJob({ kind: "svg", input, options: svgDefaults }),
    ).toThrow("invalid_input");
});

it("computes metrics and enforces the output cap", () => {
  expect(() => metrics(1, new Uint8Array(OPTIMIZER_OUTPUT_LIMIT + 1))).toThrow(
    "output_limit",
  );
  expect(metrics(0, new Uint8Array()).savedPercent).toBe(0);
  expect(metrics(2, new Uint8Array(3))).toMatchObject({
    savedBytes: -1,
    savedPercent: -50,
  });
  const result = metrics(10, new Uint8Array([1, 2, 3]));
  expect(result).toEqual({
    bytes: new Uint8Array([1, 2, 3]),
    originalBytes: 10,
    optimizedBytes: 3,
    savedBytes: 7,
    savedPercent: 70,
  });
});

it("sanitizes optimized filenames without changing the selected extension", () => {
  expect(optimizedName("../source.png", "png")).toBe(".._source-optimized.png");
  expect(optimizedName("  ", "svg")).toBe("image-optimized.svg");
  expect(optimizedName("é".repeat(200), "png").length).toBe(150 + 14);
});

function pngChunk(type: string, data: Uint8Array = new Uint8Array()) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  chunk.set(data, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

it("rejects truncated and structurally invalid PNGs even when chunk CRCs are valid", async () => {
  const original = await pngFixture();
  const signature = original.subarray(0, 8);
  const chunks = inspectPng(original).chunks;
  const header = pngChunk("IHDR", chunks[0].bytes);
  // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
  const data = pngChunk("IDAT", chunks.find((c) => c.type === "IDAT")!.bytes);
  const end = pngChunk("IEND");
  const png = (...parts: Uint8Array[]) => Buffer.concat([signature, ...parts]);
  for (let length = 0; length < original.length; length++)
    expect(() => inspectPng(original.subarray(0, length))).toThrow(
      "invalid_input",
    );
  for (const bytes of [
    png(header, end),
    png(data, header, end),
    png(pngChunk("IHDR", new Uint8Array(12)), data, end),
    png(header, data, pngChunk("IEND", new Uint8Array([1]))),
    png(header, data, end, new Uint8Array([1])),
    png(header, pngChunk("ID1T", new Uint8Array([1])), end),
  ])
    expect(() => inspectPng(bytes)).toThrow("invalid_input");
  expect(() => inspectPng(original, original.length - 1)).toThrow(
    "input_limit",
  );
  expect(inspectPng(original, original.length).width).toBe(2);
  const wrongSignature = original.slice();
  wrongSignature[0] = 0;
  expect(() => inspectPng(wrongSignature)).toThrow("invalid_input");
});

it("rejects impossible dimensions before invoking a decoder", async () => {
  const original = await pngFixture();
  const chunks = inspectPng(original).chunks;
  for (const [width, height] of [
    [0, 1],
    [1, 0],
    [16385, 1],
    [1, 16385],
    [8001, 8000],
  ]) {
    const header = Buffer.from(chunks[0].bytes);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    const bytes = Buffer.concat([
      original.subarray(0, 8),
      pngChunk("IHDR", header),
      ...chunks.slice(1).map((c) => pngChunk(c.type, c.bytes)),
    ]);
    expect(() => inspectPng(bytes)).toThrow("pixel_limit");
  }
});

it("validates boolean PNG options independently and accepts both level endpoints", async () => {
  const bytes = await pngFixture();
  for (const level of [0, 6])
    expect(() =>
      validateJob({ kind: "png", bytes, options: { ...pngDefaults, level } }),
    ).not.toThrow();
  for (const key of ["interlace", "optimiseAlpha"] as const)
    expect(() =>
      validateJob({
        kind: "png",
        bytes,
        options: { ...pngDefaults, [key]: "true" } as never,
      }),
    ).toThrow("invalid_options");
  expect(optimizedName("folder\\photo.png", "png")).toBe(
    "folder_photo-optimized.png",
  );
});
