import { expect, it } from "vitest";
import {
  exportOptions,
  imageMimes,
  MAX_BATCH_FILES,
  MAX_FILE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  outputFilename,
  resizeDimensions,
  scaleDimensions,
  validateDimensions,
  validateFile,
} from "../../src/image/options";

it("preserves image formats and file limits", () => {
  expect(imageMimes).toEqual({
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
  });
  expect(MAX_BATCH_FILES).toBe(20);
  expect(MAX_FILE_BYTES).toBe(20 * 1024 * 1024);
  expect(MAX_IMAGE_SIDE).toBe(8192);
  expect(MAX_IMAGE_PIXELS).toBe(32_000_000);
  validateFile({ type: "image/png", size: 1 });
  validateFile({ type: "image/webp", size: MAX_FILE_BYTES });
  for (const file of [
    { type: "text/plain", size: 1 },
    { type: "image/png", size: 0 },
    { type: "image/png", size: -1 },
    { type: "image/png", size: MAX_FILE_BYTES + 1 },
    { type: "image/png", size: 1.5 },
    { type: "image/png", size: Number.NaN },
  ])
    expect(() => validateFile(file)).toThrow("invalidFile");
});

it("validates side, integer, and megapixel limits", () => {
  expect(validateDimensions({ width: 1, height: 1 })).toEqual({
    width: 1,
    height: 1,
  });
  expect(validateDimensions({ width: 8000, height: 4000 })).toEqual({
    width: 8000,
    height: 4000,
  });
  for (const size of [
    { width: 0, height: 1 },
    { width: -1, height: 1 },
    { width: 1.5, height: 1 },
    { width: MAX_IMAGE_SIDE + 1, height: 1 },
    { width: 8000, height: 4001 },
    { width: Number.NaN, height: 1 },
  ])
    expect(() => validateDimensions(size)).toThrow("invalidDimensions");
});

it("resizes with or without aspect lock and rounds safely", () => {
  const original = { width: 400, height: 200 };
  expect(resizeDimensions(original, "width", 801, true)).toEqual({
    width: 801,
    height: 401,
  });
  expect(resizeDimensions(original, "height", 101, true)).toEqual({
    width: 202,
    height: 101,
  });
  expect(
    resizeDimensions(original, "width", 321, false, {
      width: 300,
      height: 250,
    }),
  ).toEqual({
    width: 321,
    height: 250,
  });
  expect(resizeDimensions(original, "height", 1, false)).toEqual({
    width: 400,
    height: 1,
  });
  expect(() =>
    resizeDimensions({ width: 0, height: 1 }, "width", 1, true),
  ).toThrow("invalidDimensions");
  expect(() => resizeDimensions(original, "width", 0, true)).toThrow(
    "invalidDimensions",
  );
  expect(() => resizeDimensions(original, "height", 9000, true)).toThrow(
    "invalidDimensions",
  );
});

it("scales dimensions with percentage limits", () => {
  expect(scaleDimensions({ width: 400, height: 200 }, 50)).toEqual({
    width: 200,
    height: 100,
  });
  expect(scaleDimensions({ width: 3, height: 3 }, 1)).toEqual({
    width: 1,
    height: 1,
  });
  for (const percent of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => scaleDimensions({ width: 10, height: 10 }, percent)).toThrow(
      "invalidDimensions",
    );
  expect(() => scaleDimensions({ width: 8192, height: 8192 }, 100)).toThrow(
    "invalidDimensions",
  );
});

it("exports PNG, JPEG, and WebP options with quality validation", () => {
  expect(exportOptions("png", 1)).toEqual({
    type: "image/png",
    quality: undefined,
  });
  expect(exportOptions("jpeg", 75)).toEqual({
    type: "image/jpeg",
    quality: 0.75,
  });
  expect(exportOptions("webp", 100)).toEqual({
    type: "image/webp",
    quality: 1,
  });
  expect(() => exportOptions("gif", 50)).toThrow("unsupported");
  for (const quality of [0, -1, 101, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => exportOptions("jpeg", quality)).toThrow("invalidQuality");
});

it("sanitizes filenames, removes paths and maps jpeg extension", () => {
  expect(outputFilename("/tmp/My photo!.png", "png")).toBe("My photo_.png");
  expect(outputFilename("C:\\folder\\résumé.tar.gz", "jpeg", "-resized!")).toBe(
    "résumé_tar-resized.jpg",
  );
  expect(outputFilename("...", "webp")).toBe("__.webp");
  expect(outputFilename("", "webp")).toBe("image.webp");
  expect(outputFilename("a".repeat(150), "webp", "_x/y")).toBe(
    `${"a".repeat(100)}_xy.webp`,
  );
});
