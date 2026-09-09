import { describe, expect, it } from "vitest";
import { MAX_PDF_PAGES, PdfEditingError } from "../../src/pdf/core";
import {
  imageDimensions,
  imageDefaults,
  imageFormats,
  imageOptions,
  imagePages,
  MAX_RENDER_EDGE,
  MAX_RENDER_PIXELS,
} from "../../src/pdf/rendering";

const base = imageDefaults;

describe("PDF rendering options", () => {
  it("accepts all formats and inclusive DPI/quality boundaries", () => {
    for (const format of imageFormats) {
      expect(() =>
        imageOptions({ dpi: 72, format, quality: 0.1 }),
      ).not.toThrow();
      expect(() =>
        imageOptions({ dpi: 600, format, quality: 1 }),
      ).not.toThrow();
    }
  });

  it.each([
    { dpi: 71 },
    { dpi: 601 },
    { dpi: 72.5 },
    { dpi: Number.NaN },
    { dpi: Number.POSITIVE_INFINITY },
    { format: "gif" },
    { quality: 0.09 },
    { quality: 1.01 },
    { quality: Number.NaN },
    { quality: Number.POSITIVE_INFINITY },
  ])("rejects invalid image option %j", (override) => {
    expect(() => imageOptions({ ...base, ...override } as typeof base)).toThrow(
      new PdfEditingError("invalid_options"),
    );
  });
});

describe("image dimensions", () => {
  it("rounds dimensions and clamps non-positive edges to one pixel", () => {
    expect(imageDimensions(100.4, 200.6)).toEqual({ width: 100, height: 201 });
    expect(imageDimensions(0, -2)).toEqual({ width: 1, height: 1 });
    expect(imageDimensions(0.49, 0.49)).toEqual({ width: 1, height: 1 });
  });

  it("accepts the edge and total pixel limits", () => {
    expect(imageDimensions(MAX_RENDER_EDGE, 1)).toEqual({
      width: MAX_RENDER_EDGE,
      height: 1,
    });
    expect(imageDimensions(8000, MAX_RENDER_PIXELS / 8000)).toEqual({
      width: 8000,
      height: MAX_RENDER_PIXELS / 8000,
    });
  });

  it.each([
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
    [MAX_RENDER_EDGE + 1, 1],
    [1, MAX_RENDER_EDGE + 1],
    [8001, 8000],
  ])(
    "rejects dimensions that exceed finite, edge, or pixel limits: %s x %s",
    (width, height) => {
      expect(() => imageDimensions(width, height)).toThrow(
        new PdfEditingError("too_large"),
      );
    },
  );
});

describe("image page selection", () => {
  it("defaults to every page and preserves explicit range order", () => {
    expect(imagePages({ ...base, pages: "" }, 4)).toEqual([1, 2, 3, 4]);
    expect(imagePages({ ...base, pages: "4,1-2" }, 4)).toEqual([4, 1, 2]);
  });

  it.each(["1,1", "1-2,2", "0", "5", "3-1", "1,,2", "1.5"])(
    "rejects invalid or duplicate page selection %s",
    (pages) => {
      expect(() => imagePages({ ...base, pages }, 4)).toThrow();
    },
  );

  it("checks image options before page count and page count before ranges", () => {
    expect(() =>
      imagePages({ ...base, dpi: 1, pages: "not-a-range" }, MAX_PDF_PAGES + 1),
    ).toThrow(new PdfEditingError("invalid_options"));
    expect(() =>
      imagePages({ ...base, pages: "not-a-range" }, MAX_PDF_PAGES + 1),
    ).toThrow(new PdfEditingError("too_large"));
  });
});
