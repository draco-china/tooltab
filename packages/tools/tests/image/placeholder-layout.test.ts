import { expect, it } from "vitest";
import {
  buildPlaceholderFilename,
  buildPlaceholderPreviewDataUri,
  buildPlaceholderSvg,
  normalizePageOptions,
  PAGE_PLACEHOLDER_DEFAULTS,
  resolvePlaceholderText,
} from "../../src/image/placeholder-layout";

it("normalizes dimensions, font size, angle, defaults, and text", () => {
  expect(normalizePageOptions({})).toEqual(PAGE_PLACEHOLDER_DEFAULTS);
  expect(
    normalizePageOptions({
      width: 5000.4,
      height: -2.2,
      fontSize: 999,
      gradientAngle: -45.4,
      text: "  hello  ",
    }),
  ).toEqual({
    ...PAGE_PLACEHOLDER_DEFAULTS,
    width: 4096,
    height: 1,
    fontSize: 500,
    gradientAngle: 315,
    text: "  hello  ",
  });
  expect(
    normalizePageOptions({
      width: Number.NaN,
      height: Number.POSITIVE_INFINITY,
      fontSize: Number.NEGATIVE_INFINITY,
      gradientAngle: Number.NaN,
      backgroundColor: "#fff",
    }),
  ).toEqual({ ...PAGE_PLACEHOLDER_DEFAULTS, backgroundColor: "#fff" });
  expect(resolvePlaceholderText(normalizePageOptions({ text: "  " }))).toBe(
    "800 × 600",
  );
  expect(
    resolvePlaceholderText(normalizePageOptions({ text: " hello " })),
  ).toBe("hello");
});

it("builds solid and scaled SVG with explicit and fallback font sizes", () => {
  const source = buildPlaceholderSvg(
    { ...PAGE_PLACEHOLDER_DEFAULTS, text: "Hello", fontSize: 20 },
    2,
  );
  expect(source).toContain('width="1600" height="1200"');
  expect(source).toContain('viewBox="0 0 1600 1200"');
  expect(source).toContain('fill="#d4d4d8"');
  expect(source).toContain('font-size="40"');
  expect(source).toContain(">Hello</text>");
  expect(buildPlaceholderSvg({ width: 80, height: 40, text: "" })).toContain(
    ">80 × 40</text>",
  );
  expect(buildPlaceholderSvg({ width: 80, height: 40, fontSize: 0 })).toContain(
    'font-size="5"',
  );
});

it("builds linear/radial gradients and escapes every SVG attribute value", () => {
  for (const backgroundType of [
    "linear-gradient",
    "radial-gradient",
  ] as const) {
    const source = buildPlaceholderSvg({
      ...PAGE_PLACEHOLDER_DEFAULTS,
      backgroundType,
      backgroundColor: '" onload="alert(1)',
      gradientColor1: '"/><script>&',
      gradientColor2: "'bad&value",
      textColor: '" onmouseover="alert(1)',
      text: "<&'\"",
    });
    expect(source).toContain("&quot;/&gt;&lt;script&gt;&amp;");
    expect(source).toContain("&#39;bad&amp;value");
    expect(source).toContain("&quot; onmouseover=&quot;alert(1)");
    expect(source).toContain("&lt;&amp;&#39;&quot;");
    expect(source).not.toContain("<script>");
  }
});

it("creates encoded preview data, deterministic filenames, and format suffixes", () => {
  const options = { width: 320, height: 180, text: "Preview" };
  const uri = buildPlaceholderPreviewDataUri(options);
  expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
  expect(decodeURIComponent(uri.split(",", 2)[1] ?? "")).toContain(
    ">Preview</text>",
  );
  expect(buildPlaceholderFilename(options, "png", 1)).toBe(
    "placeholder-320x180.png",
  );
  expect(buildPlaceholderFilename(options, "jpeg", 2)).toBe(
    "placeholder-320x180@2x.jpg",
  );
  expect(buildPlaceholderFilename(options, "webp", 3)).toBe(
    "placeholder-320x180@3x.webp",
  );
  expect(buildPlaceholderFilename(options, "svg", 1)).toBe(
    "placeholder-320x180.svg",
  );
});

it("rejects invalid XML characters without imposing the protocol text limit", () => {
  for (const text of ["a\0b", "\ud800", "\uffff"]) {
    expect(() => buildPlaceholderSvg({ text })).toThrow("invalid_character");
    expect(() => buildPlaceholderPreviewDataUri({ text })).toThrow(
      "invalid_character",
    );
  }
  expect(buildPlaceholderSvg({ text: "x".repeat(501) })).toContain(
    "x".repeat(501),
  );
  expect(buildPlaceholderSvg({ text: "fixed😀" })).toContain("fixed😀");
});
