import { describe, expect, it } from "vitest";
import {
  filterLocalFonts,
  fontCss,
  groupLocalFonts,
  inferFontWeight,
  isItalicStyle,
  normalizeLocalFonts,
} from "../../src/font/local";

describe("local font metadata", () => {
  it("infers style and weight", () => {
    expect(isItalicStyle("Bold Italic")).toBe(true);
    expect(inferFontWeight("Bold")).toBe(700);
  });
});

it.each([
  ["Hairline", 100],
  ["Ultra Light", 200],
  ["Light", 300],
  ["Book", 350],
  ["Roman", 400],
  ["Medium", 500],
  ["Demi-Bold", 600],
  ["Bold", 700],
  ["ExtraBold", 800],
  ["Heavy", 900],
  ["Ultra Black", 950],
  ["Weight 500 Italic", 500],
  ["Unclassified", undefined],
] as const)("maps installed font weight %s to CSS", (style, weight) => {
  expect(inferFontWeight(style)).toBe(weight);
});

it("normalizes incomplete platform records without losing their original metadata", () => {
  const fonts = normalizeLocalFonts([
    { family: " Alpha ", fullName: " Alpha Regular ", style: " Regular " },
    { family: "Beta" },
    { fullName: "Gamma Display" },
    { postscriptName: "Delta-PS" },
    {},
    { style: "Italic" },
  ]);
  expect(
    fonts.map((font) => [
      font.id,
      font.displayFamily,
      font.displayName,
      font.displayStyle,
    ]),
  ).toEqual([
    ["Alpha Regular|Alpha|Regular-0", "Alpha", "Alpha Regular", "Regular"],
    ["Beta-1", "Beta", "Beta", "--"],
    ["Gamma Display-2", "Gamma Display", "Gamma Display", "--"],
    ["Delta-PS", "Delta-PS", "Delta-PS", "--"],
    ["font-4", "--", "--", "--"],
    ["Italic-5", "--", "--", "Italic"],
  ]);
  expect(fonts[0].searchKey).toBe("alpha alpha regular ");
  expect(fonts[4].family).toBe("");
});

it("exports CSS with escaped family names and only known non-default styling", () => {
  const fonts = normalizeLocalFonts([
    { family: 'A\\B"C', style: "Bold Oblique" },
    { fullName: "Name", style: "Regular" },
    { postscriptName: "PostScript", style: "Unknown" },
    {},
  ]);
  expect(fontCss(fonts[0])).toBe(
    'font-family: "A\\\\B\\"C";\nfont-style: italic;\nfont-weight: 700;',
  );
  expect(fontCss(fonts[1])).toBe('font-family: "Name";');
  expect(fontCss(fonts[2])).toBe('font-family: "PostScript";');
  expect(fontCss(fonts[3])).toBe("");
  expect(fontCss(undefined)).toBe("");
});

it("combines case-insensitive search and style filters without reordering the source", () => {
  const fonts = normalizeLocalFonts([
    { family: "Beta", fullName: "Alpha", style: "Regular" },
    { family: "Alpha", fullName: "Zulu", style: "Oblique" },
    { family: "Alpha", fullName: "Beta", style: "Bold" },
  ]);
  expect(filterLocalFonts(fonts, "", "all")).toEqual([
    fonts[1],
    fonts[2],
    fonts[0],
  ]);
  expect(filterLocalFonts(fonts, "", "all", "name")).toEqual([
    fonts[0],
    fonts[2],
    fonts[1],
  ]);
  expect(filterLocalFonts(fonts, "", "all", "style")).toEqual([
    fonts[2],
    fonts[1],
    fonts[0],
  ]);
  expect(filterLocalFonts(fonts, " ALPHA ", "italic")).toEqual([fonts[1]]);
  expect(filterLocalFonts(fonts, "alpha", "regular")).toEqual([
    fonts[2],
    fonts[0],
  ]);
  expect(filterLocalFonts(fonts, "missing", "all")).toEqual([]);
  expect(fonts.map((font) => font.fullName)).toEqual(["Alpha", "Zulu", "Beta"]);
});

it("groups repeated families in discovery order and handles empty enumeration", () => {
  const fonts = normalizeLocalFonts([
    { family: "B" },
    { family: "A" },
    { family: "B" },
  ]);
  expect(groupLocalFonts(fonts, true)).toEqual([
    { id: "B", label: "B", items: [fonts[0], fonts[2]] },
    { id: "A", label: "A", items: [fonts[1]] },
  ]);
  expect(groupLocalFonts(fonts, false)).toEqual([
    { id: "all-fonts", label: "", items: fonts },
  ]);
  expect(groupLocalFonts([], true)).toEqual([]);
  expect(groupLocalFonts([], false)).toEqual([]);
});
