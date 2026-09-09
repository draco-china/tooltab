import { describe, expect, test } from "vitest";
import { generateQr, readQr } from "../../src/encoding/qr";
import type { QrOptionsInput } from "../../src/encoding/qr-contract";
import { qrPixels } from "../../src/encoding/qr-pixels";

async function textMatrix(text: string, options: Record<string, unknown> = {}) {
  return generateQr({ type: "text", text }, options);
}

describe("generateQr", () => {
  test("creates a real matrix and SVG with matching geometry and colors", async () => {
    const matrix = await generateQr({ type: "text", text: "Hello QR" });

    expect(matrix.payload).toBe("Hello QR");
    expect(matrix.count).toBeGreaterThanOrEqual(21);
    expect(matrix.modules).toHaveLength(matrix.count * matrix.count);
    expect(matrix.svg).toContain('width="320"');
    expect(matrix.svg).toContain('height="320"');
    expect(matrix.svg).toContain("#111827");
    expect(matrix.svg).toContain("#ffffff");
  });

  test("supports every error correction level with real QR output", async () => {
    const matrices = await Promise.all(
      (["L", "M", "Q", "H"] as const).map((errorCorrectionLevel) =>
        textMatrix("Correction level fixture", { errorCorrectionLevel }),
      ),
    );

    for (const matrix of matrices) {
      expect(matrix.modules).toHaveLength(matrix.count ** 2);
      expect(matrix.svg).toContain("<svg");
    }
    expect(matrices[0].count).toBeLessThanOrEqual(matrices[3].count);
  });

  test("honors output size, margin, and colors", async () => {
    const matrix = await textMatrix("styled", {
      darkColor: "#123456",
      lightColor: "#fedcba",
      margin: 0,
      size: 128,
    });

    expect(matrix.svg).toContain("#123456");
    expect(matrix.svg).toContain("#fedcba");
    const pixels = qrPixels(matrix, {
      darkColor: "#123456",
      lightColor: "#fedcba",
      margin: 0,
      size: 128,
    });
    expect(pixels).toMatchObject({ width: 128, height: 128 });
    expect(pixels.data).toHaveLength(128 * 128 * 4);
    expect(pixels.data.slice(0, 4)).toEqual(
      Uint8ClampedArray.from([18, 52, 86, 255]),
    );
    expect(pixels.data).toContain(254);
  });

  test("scales to the real matrix when the requested size is smaller", async () => {
    const matrix = await textMatrix("x".repeat(2_500), {
      errorCorrectionLevel: "L",
      size: 128,
    });
    expect(matrix.count).toBeGreaterThan(128);
    const pixels = qrPixels(matrix, { size: 128, margin: 0 });
    expect(pixels.width).toBe(matrix.count);
    expect(pixels.height).toBe(matrix.count);
  });

  test("accepts a large valid input at schema limit only when qrcode capacity allows it", async () => {
    await expect(
      generateQr(
        { type: "text", text: "x".repeat(10_000) },
        { errorCorrectionLevel: "H" },
      ),
    ).rejects.toMatchObject({ code: "capacity" });
  });

  test("rejects invalid content and options through the real schemas", async () => {
    await expect(
      generateQr({ type: "text", text: 42 } as never),
    ).rejects.toMatchObject({
      name: "ZodError",
    });
    await expect(
      generateQr({ type: "text", text: "ok" }, { size: 127 }),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      generateQr({ type: "text", text: "ok" }, {
        errorCorrectionLevel: "X",
      } as unknown as QrOptionsInput),
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});

describe("qrPixels and readQr", () => {
  test.each([
    ["https://example.com/qr", "url"],
    ["你好 QR", "text"],
  ])("round-trips %s through real pixels and jsQR", async (text, kind) => {
    const matrix = await textMatrix(text);
    const pixels = qrPixels(matrix);
    const before = new Uint8ClampedArray(pixels.data);
    const result = readQr(pixels.data, pixels.width, pixels.height);

    expect(result).toMatchObject({
      data: text,
      kind,
      width: pixels.width,
      height: pixels.height,
    });
    if (kind === "url") expect(result?.href).toBe("https://example.com/qr");
    expect(pixels.data).toEqual(before);
  });

  test("decodes an inverted real QR image using both inversion attempts", async () => {
    const matrix = await textMatrix("inverted");
    const pixels = qrPixels(matrix, { margin: 0 });
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = 255 - pixels.data[i];
      pixels.data[i + 1] = 255 - pixels.data[i + 1];
      pixels.data[i + 2] = 255 - pixels.data[i + 2];
    }

    expect(readQr(pixels.data, pixels.width, pixels.height)).toMatchObject({
      data: "inverted",
      kind: "text",
    });
  });

  test("returns null for a blank real-size RGBA image", () => {
    const data = new Uint8ClampedArray(128 * 128 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
    expect(readQr(data, 128, 128)).toBeNull();
  });

  test("rejects all malformed dimension and data-length boundaries", () => {
    expect(() => readQr(new Uint8ClampedArray(3), 1, 1)).toThrowError(
      expect.objectContaining({ code: "too_large" }),
    );
    expect(() => readQr(new Uint8ClampedArray(4), 0, 1)).toThrowError(
      expect.objectContaining({ code: "too_large" }),
    );
    expect(() => readQr(new Uint8ClampedArray(4), 1.5, 1)).toThrowError(
      expect.objectContaining({ code: "too_large" }),
    );
    expect(() => readQr(new Uint8ClampedArray(4), 1, 1.5)).toThrowError(
      expect.objectContaining({ code: "too_large" }),
    );
    expect(() => readQr(new Uint8ClampedArray(4), 1, 0)).toThrowError(
      expect.objectContaining({ code: "too_large" }),
    );
    expect(() => readQr(new Uint8ClampedArray(4), 10_000, 4_000)).toThrowError(
      expect.objectContaining({ code: "too_large" }),
    );
  });

  test("rejects noninteger pixel options and preserves pixel defaults", async () => {
    const matrix = await textMatrix("pixel options");
    expect(() => qrPixels(matrix, { margin: 1.5 })).toThrowError(
      expect.objectContaining({ name: "ZodError" }),
    );
    const pixels = qrPixels(matrix);
    expect(pixels.width).toBe(320);
    expect(pixels.height).toBe(320);
    expect(pixels.data[3]).toBe(255);
  });

  test("rejects invalid matrix geometry and module values", () => {
    const invalid = [
      { count: 20, modules: new Uint8Array(400) },
      { count: 21.5, modules: new Uint8Array(441) },
      { count: 22, modules: new Uint8Array(484) },
      { count: 181, modules: new Uint8Array(181 * 181) },
      { count: 21, modules: new Uint8Array(440) },
      {
        count: 21,
        modules: Uint8Array.from({ length: 441 }, (_, index) =>
          index === 0 ? 2 : 0,
        ),
      },
    ];
    for (const matrix of invalid)
      expect(() => qrPixels(matrix, {})).toThrowError(
        expect.objectContaining({ code: "invalid_input" }),
      );
  });
});
