import { describe, expect, it, vi } from "vitest";
import {
  avifDefaults,
  convertRaster,
  dimensions,
  icoDefaults,
  iconPlacement,
  MAX_FORMAT_OUTPUT,
  MAX_FORMAT_PIXELS,
  outputName,
  packIcon,
  validateSettings,
  type Raster,
  type RasterRuntime,
} from "../../src/image/logic";

const raster = (width = 2, height = 1): Raster => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
});

describe("image format core", () => {
  it("validates dimensions and AVIF/ICO settings at their supported limits", () => {
    for (const options of [
      { ...avifDefaults, quality: 0, scale: 10, speed: 0 },
      { ...avifDefaults, quality: 100, scale: 400, speed: 10 },
    ])
      expect(() => validateSettings({ kind: "avif", options })).not.toThrow();
    for (const options of [
      { ...avifDefaults, speed: 11 },
      { ...avifDefaults, scale: 9 },
      { ...avifDefaults, quality: 2.5 },
      { ...avifDefaults, lossless: "yes" as never },
    ])
      expect(() => validateSettings({ kind: "avif", options })).toThrow(
        "invalid_options",
      );
    for (const sizes of [
      [],
      [0],
      [257],
      [1.5],
      Array.from({ length: 257 }, () => 1),
    ])
      expect(() =>
        validateSettings({ kind: "ico", options: { ...icoDefaults, sizes } }),
      ).toThrow("invalid_options");
    for (const options of [
      { ...icoDefaults, backgroundEnabled: "yes" as never },
      { ...icoDefaults, backgroundColor: "#ffffff\n" },
      { ...icoDefaults, backgroundColor: "white" },
    ])
      expect(() => validateSettings({ kind: "ico", options })).toThrow(
        "invalid_options",
      );
    expect(() => dimensions(8000, 8000)).not.toThrow();
    for (const pair of [
      [0, 1],
      [-1, 1],
      [1.5, 1],
      [16385, 1],
      [8001, 8000],
    ])
      expect(() => dimensions(pair[0], pair[1])).toThrow("pixel_limit");
    expect(MAX_FORMAT_PIXELS).toBe(64_000_000);
  });

  it("creates safe unique output names and centered icon placements", () => {
    const used = new Set<string>();
    expect(outputName("../a.png", "avif", used)).toBe(".._a.avif");
    expect(outputName("x.png", "avif", used)).toBe("x.avif");
    expect(outputName("x-2.png", "avif", used)).toBe("x-2.avif");
    expect(outputName("x.jpg", "avif", used)).toBe("x-3.avif");
    expect(outputName("X.jpg", "avif", used)).toBe("X-4.avif");
    expect(outputName("\0  .png", "ico", used)).toBe("_  .ico");
    expect(outputName(".png", "ico")).toBe("image.ico");
    expect(outputName("...", "ico", used)).toBe("...ico");
    expect(outputName("a".repeat(200), "ico").length).toBe(164);
    expect(iconPlacement(40, 20, 16)).toEqual({
      width: 16,
      height: 8,
      left: 0,
      top: 4,
    });
  });

  it("packs exact ICO offsets, markers, payloads, and rejects invalid bounds", () => {
    const frames = [
        { size: 256, bytes: new Uint8Array([1, 2, 3]) },
        { size: 16, bytes: new Uint8Array([4, 5]) },
      ],
      bytes = packIcon(frames),
      v = new DataView(bytes.buffer);
    expect(v.getUint16(2, true)).toBe(1);
    expect(v.getUint16(4, true)).toBe(2);
    expect(bytes[6]).toBe(0);
    expect(bytes[22]).toBe(16);
    expect(v.getUint32(18, true)).toBe(38);
    expect(v.getUint32(34, true)).toBe(41);
    expect(Array.from(bytes.slice(38))).toEqual([1, 2, 3, 4, 5]);
    for (const frames of [
      [],
      Array.from({ length: 257 }, () => ({ size: 1, bytes: new Uint8Array() })),
    ])
      expect(() => packIcon(frames)).toThrow("invalid_options");
    expect(() => packIcon([{ size: 0, bytes: new Uint8Array() }])).toThrow(
      "invalid_options",
    );
    expect(() => packIcon([{ size: 257, bytes: new Uint8Array() }])).toThrow(
      "invalid_options",
    );
    expect(() =>
      packIcon([{ size: 1, bytes: new Uint8Array(MAX_FORMAT_OUTPUT) }]),
    ).toThrow("output_limit");
  });

  it("converts AVIF without resizing and preserves output bounds", async () => {
    const avif = vi.fn(async () => new Uint8Array([1, 2]).buffer);
    const resize = vi.fn(async (r: Raster) => r);
    const runtime: RasterRuntime = {
      resize,
      avif,
      png: vi.fn(),
    };
    await expect(
      convertRaster(raster(), { kind: "avif", options: avifDefaults }, runtime),
    ).resolves.toMatchObject({
      width: 2,
      height: 1,
      bytes: new Uint8Array([1, 2]),
    });
    expect(resize).not.toHaveBeenCalled();
    expect(avif).toHaveBeenCalledWith(raster(), avifDefaults);
    await expect(
      convertRaster(
        { ...raster(), data: new Uint8ClampedArray(1) },
        { kind: "avif", options: avifDefaults },
        runtime,
      ),
    ).rejects.toThrow("invalid_image");
    await expect(
      convertRaster(
        raster(),
        { kind: "avif", options: { ...avifDefaults, scale: 10 } },
        {
          ...runtime,
          avif: vi.fn(async () => new ArrayBuffer(0)),
        },
      ),
    ).rejects.toThrow("conversion_failed");
    await expect(
      convertRaster(
        raster(),
        { kind: "avif", options: avifDefaults },
        {
          ...runtime,
          avif: vi.fn(async () => new Uint8Array(MAX_FORMAT_OUTPUT + 1).buffer),
        },
      ),
    ).rejects.toThrow("output_limit");
  });

  it("resizes AVIF and builds ICO frames with and without background", async () => {
    const resized: Raster = raster(4, 2);
    const resize = vi.fn(async () => resized);
    const png = vi.fn(async () => new Uint8Array([1]));
    const avif = vi.fn(async () => new Uint8Array([2]).buffer);
    const runtime: RasterRuntime = { resize, png, avif };
    await expect(
      convertRaster(
        raster(),
        { kind: "avif", options: { ...avifDefaults, scale: 400 } },
        runtime,
      ),
    ).resolves.toMatchObject({ width: 8, height: 4 });
    expect(resize).toHaveBeenCalledWith(raster(), 8, 4);
    resize.mockClear();
    await expect(
      convertRaster(
        raster(4, 2),
        {
          kind: "ico",
          options: {
            ...icoDefaults,
            sizes: [16, 24, 16],
            backgroundEnabled: true,
          },
        },
        runtime,
      ),
    ).resolves.toMatchObject({ sizes: [24, 16], width: 24, height: 24 });
    expect(resize).toHaveBeenCalledWith(raster(4, 2), 24, 12, {
      size: 24,
      color: "#ffffff",
    });
    await expect(
      convertRaster(raster(), { kind: "ico", options: icoDefaults }, runtime),
    ).resolves.toMatchObject({ sizes: [256, 48, 32, 16] });
    expect(resize).toHaveBeenCalledWith(raster(), 256, 128, {
      size: 256,
      color: undefined,
    });
  });
});
