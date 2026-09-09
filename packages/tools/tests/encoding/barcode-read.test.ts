import { readFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { prepareZXingModule, purgeZXingModule } from "zxing-wasm/reader";
import { describe, expect, test } from "vitest";
import { generateBarcode } from "../../src/encoding/barcode-generate";
import { readBarcode } from "../../src/encoding/barcode-read";

const wasmUrl = new URL(
  import.meta.resolve("zxing-wasm/reader/zxing_reader.wasm"),
);
prepareZXingModule({
  overrides: {
    wasmBinary: readFileSync(wasmUrl),
    locateFile: () => wasmUrl.pathname,
  },
});

const measureContext = createCanvas(1, 1).getContext("2d");
const measureText = (text: string, fontSize: number) => {
  measureContext.font = `${fontSize}px monospace`;
  return measureContext.measureText(text).width;
};

type Raster = {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
};

async function barcodeRaster(
  format: string,
  text: string,
  options: Record<string, unknown> = {},
): Promise<Raster> {
  const svg = await generateBarcode({ format, text, ...options }, measureText);
  const image = await loadImage(Buffer.from(svg.svg));
  const canvas = createCanvas(svg.width, svg.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, svg.width, svg.height).data;
  return {
    data: new Uint8ClampedArray(pixels) as Uint8ClampedArray<ArrayBuffer>,
    width: svg.width,
    height: svg.height,
  };
}

describe("readBarcode", () => {
  test.each([
    ["Code128", "CODE128", "HELLO-123", "HELLO-123"],
    ["Code39", "CODE39", "HELLO-39", "HELLO-39"],
    ["EAN13", "EAN13", "5901234123457", "5901234123457"],
    ["EAN8", "EAN8", "96385074", "96385074"],
    ["UPCA", "UPC", "12345678901", "123456789012"],
    ["UPCE", "UPCE", "04252614", "04252614"],
    ["ITF", "ITF", "123456", "123456"],
  ] as const)(
    "decodes a real %s barcode",
    async (format, sourceFormat, text, expectedText) => {
      const raster = await barcodeRaster(sourceFormat, text);
      const result = await readBarcode(
        raster.data,
        raster.width,
        raster.height,
      );

      expect(result).toMatchObject({
        text: expectedText,
        format,
        width: raster.width,
        height: raster.height,
      });
    },
  );

  test("classifies a decoded URL using the actual barcode payload", async () => {
    const text = "https://example.com/path?a=1";
    const raster = await barcodeRaster("CODE128", text);
    const result = await readBarcode(raster.data, raster.width, raster.height);

    expect(result).toMatchObject({
      text,
      format: "Code128",
      kind: "url",
      href: text,
    });
  });

  test("composites transparent pixels without mutating the input", async () => {
    const raster = await barcodeRaster("CODE128", "ALPHA-123");
    const before = new Uint8ClampedArray(raster.data);
    for (let i = 3; i < raster.data.length; i += 4) raster.data[i] = 128;

    const result = await readBarcode(raster.data, raster.width, raster.height);

    expect(result).toMatchObject({ text: "ALPHA-123", format: "Code128" });
    expect(raster.data).toEqual(
      before.map((value, index) => (index % 4 === 3 ? 128 : value)),
    );
  });

  test("returns null for a real blank RGBA image", async () => {
    const width = 120;
    const height = 80;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }

    await expect(readBarcode(data, width, height)).resolves.toBeNull();
  });

  test("accepts the minimum real raster dimensions", async () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255]);

    await expect(readBarcode(data, 1, 1)).resolves.toBeNull();
  });

  test("rejects malformed dimensions before decoding", async () => {
    await expect(
      readBarcode(new Uint8ClampedArray(3), 1, 1),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(
      readBarcode(new Uint8ClampedArray(4), 0, 1),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(
      readBarcode(new Uint8ClampedArray(4), 1.5, 1),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(
      readBarcode(new Uint8ClampedArray(4), 1, 1.5),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(
      readBarcode(new Uint8ClampedArray(4), 1, 0),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(
      readBarcode(new Uint8ClampedArray(4), 10_000, 4_000),
    ).rejects.toMatchObject({ code: "too_large" });
  });
});

test("maps corrupt WASM failure and recovers with local module bytes", async () => {
  const input = new Uint8ClampedArray([10, 20, 30, 128]);
  const original = new Uint8ClampedArray(input);
  purgeZXingModule();
  prepareZXingModule({
    overrides: { wasmBinary: new Uint8Array([0, 1, 2, 3]) },
  });
  try {
    await expect(readBarcode(input, 1, 1)).rejects.toMatchObject({
      name: "BarcodeError",
      code: "decode_failed",
    });
    expect(input).toEqual(original);
  } finally {
    purgeZXingModule();
    prepareZXingModule({
      overrides: {
        wasmBinary: readFileSync(wasmUrl),
        locateFile: () => wasmUrl.pathname,
      },
    });
  }
  await expect(
    readBarcode(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1),
  ).resolves.toBeNull();
});
