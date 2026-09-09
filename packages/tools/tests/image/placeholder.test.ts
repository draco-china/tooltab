import { expect, it } from "vitest";
import {
  isPlaceholderText,
  placeholderDefaults,
  placeholderSvg,
  type PlaceholderOptions,
} from "../../src/image/placeholder";

const options = (
  patch: Partial<PlaceholderOptions> = {},
): PlaceholderOptions => ({
  ...placeholderDefaults,
  ...patch,
});

it("uses defaults and scales physical SVG dimensions", () => {
  const source = placeholderSvg(options({ scale: 2 }));
  expect(source).toContain('width="2400" height="1600"');
  expect(source).toContain('viewBox="0 0 1200 800"');
  expect(source).toContain("1200 × 800");
  expect(source).toContain('fill="#E9EEF5"');
});

it("generates solid, linear, and radial backgrounds", () => {
  const solid = placeholderSvg(options({ backgroundType: "solid" }));
  expect(solid).not.toContain("<defs>");
  expect(solid).toContain('fill="#E9EEF5"');
  for (const backgroundType of ["linear", "radial"] as const) {
    const source = placeholderSvg(options({ backgroundType }));
    expect(source).toContain(`<${backgroundType}Gradient id="bg">`);
    expect(source).toContain('stop-color="#B7CDF5"');
    expect(source).toContain('fill="url(#bg)"');
  }
});

it("escapes XML text and counts Unicode code points for font sizing", () => {
  const source = placeholderSvg(
    options({
      width: 300,
      height: 200,
      text: `<tag attr="x">&'🙂</tag>`,
      textColor: "#123456",
    }),
  );
  expect(source).toContain(
    "&lt;tag attr=&quot;x&quot;&gt;&amp;&apos;🙂&lt;/tag&gt;",
  );
  expect(source).toContain('fill="#123456"');
  expect(source).toContain('font-size="10.434782608695652"');
  expect(placeholderSvg(options({ text: "" }))).toContain("1200 × 800");
});

it("preserves scale 1/2/3 and rejects invalid dimensions, colors, types, and text", () => {
  for (const scale of [1, 2, 3] as const)
    expect(placeholderSvg(options({ scale }))).toContain(
      `width="${1200 * scale}"`,
    );
  for (const patch of [
    { width: 0 },
    { height: 1.5 },
    { scale: 4 },
    { background: "#12345g" },
    { endColor: "red" },
    { textColor: "#1234567" },
    { backgroundType: "conic" as never },
    { text: "x".repeat(501) },
  ])
    expect(() => placeholderSvg(options(patch))).toThrow();
  expect(() => placeholderSvg(options({ width: 8192, scale: 2 }))).toThrow(
    "invalidDimensions",
  );
});

it("clamps font size to readable minimum and maximum bounds", () => {
  const tiny = placeholderSvg(
    options({ width: 1, height: 1, text: "very long text" }),
  );
  expect(tiny).toContain('font-size="1"');
  const wide = placeholderSvg(
    options({ width: 1000, height: 1000, text: "a" }),
  );
  expect(wide).toContain('font-size="200"');
});

it("rejects non-XML characters while preserving whitespace and Unicode text", () => {
  for (const text of [
    "",
    "\t\n\r",
    "中文😀",
    "x".repeat(500),
    "\ud7ff\ue000\ufffd",
  ]) {
    expect(isPlaceholderText(text)).toBe(true);
    expect(placeholderSvg(options({ text }))).toContain("<svg");
  }
  for (const text of [
    "\0",
    "\u0008",
    "\u000b",
    "\u000c",
    "\u001f",
    "\ud800",
    "\udfff",
    "\ufffe",
    "\uffff",
    "x".repeat(501),
  ]) {
    expect(isPlaceholderText(text)).toBe(false);
    expect(() => placeholderSvg(options({ text }))).toThrow("error");
  }
});
