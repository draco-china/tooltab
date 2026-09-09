import { describe, expect, it } from "vitest";
import {
  buildBoxShadow,
  DEFAULT_SHADOW_CONFIG,
  formatShadowLayer,
  getAlphaPercentage,
  getOpaqueHexColor,
  normalizeShadowConfig,
  parseHexColor,
  rgbaToHex,
  updateHexAlpha,
  updateHexColorRgb,
} from "../../src/css/box-shadow";

describe("CSS box shadow logic", () => {
  it("parses shorthand and full hex colors with strict digits", () => {
    expect(parseHexColor("#123")).toEqual({ r: 17, g: 34, b: 51, a: 1 });
    expect(parseHexColor("#1234")?.a).toBeCloseTo(0.267, 2);
    expect(parseHexColor("#12345678")?.a).toBeCloseTo(0.471, 2);
    expect(parseHexColor("#ABCDEF")).toEqual({ r: 171, g: 205, b: 239, a: 1 });
    expect(parseHexColor("#gggggg")).toBeNull();
    expect(parseHexColor("#12gg56")).toBeNull();
    expect(parseHexColor("#0g0000")).toBeNull();
    expect(parseHexColor("#00000g")).toBeNull();
    expect(parseHexColor("#0000000g")).toBeNull();
    expect(parseHexColor("#12345g78")).toBeNull();
    expect(parseHexColor("#12")).toBeNull();
    expect(parseHexColor("  #123456  ")).toEqual({ r: 18, g: 52, b: 86, a: 1 });
  });

  it("formats rgba and shadow layers", () => {
    expect(rgbaToHex({ r: 18, g: 52, b: 86, a: 0.5 })).toBe("#12345680");
    expect(rgbaToHex({ r: -1, g: 300, b: 1.4, a: 2 }, false)).toBe("#00FF01");
    expect(rgbaToHex({ r: 18, g: 52, b: 86, a: 0 })).toBe("#12345600");
    expect(
      formatShadowLayer({
        offsetX: 0,
        offsetY: 12,
        blur: 40,
        spread: -8,
        color: "#00000040",
        inset: true,
      }),
    ).toBe("inset 0px 12px 40px -8px rgba(0, 0, 0, 0.251)");
    expect(
      formatShadowLayer({
        offsetX: 1.6,
        offsetY: -2.4,
        blur: -3.2,
        spread: 4.5,
        color: "#broken",
        inset: false,
      }),
    ).toBe("2px -2px 0px 5px rgba(0, 0, 0, 0.2)");
  });

  it("joins layers and handles empty and multiple lists", () => {
    expect(buildBoxShadow([])).toBe("none");
    expect(buildBoxShadow([DEFAULT_SHADOW_CONFIG])).toBe(
      "0px 8px 24px 0px rgba(0, 0, 0, 0.2)",
    );
    expect(
      buildBoxShadow([
        DEFAULT_SHADOW_CONFIG,
        { ...DEFAULT_SHADOW_CONFIG, inset: true, color: "#fff" },
      ]),
    ).toContain(", inset");
  });

  it("updates color channels and alpha independently with fallback", () => {
    expect(getOpaqueHexColor("#12345680")).toBe("#123456");
    expect(getAlphaPercentage("#12345680")).toBe(50);
    expect(updateHexColorRgb("#12345680", "#ABCDEF")).toBe("#ABCDEF80");
    expect(updateHexAlpha("#12345680", 12)).toBe("#1234561F");
    expect(getOpaqueHexColor("invalid")).toBe("#000000");
    expect(getAlphaPercentage("invalid")).toBe(20);
    expect(updateHexColorRgb("nope", "#ABCDEF")).toBe("#ABCDEF33");
    expect(updateHexColorRgb("#123456", "nope")).toBe("#123456");
    expect(updateHexAlpha("nope", 150)).toBe("#000000FF");
    expect(updateHexAlpha("nope", -2)).toBe("#00000000");
  });

  it("normalizes invalid and fractional configuration", () => {
    expect(
      normalizeShadowConfig({
        offsetX: 10.4,
        offsetY: 2.4,
        blur: -4,
        spread: 5.6,
        color: "#ABCDEF",
        inset: true,
      }),
    ).toEqual({
      offsetX: 10,
      offsetY: 2,
      blur: 0,
      spread: 6,
      color: "#ABCDEF",
      inset: true,
    });
    expect(normalizeShadowConfig()).toEqual(DEFAULT_SHADOW_CONFIG);
    expect(
      normalizeShadowConfig({
        offsetX: Infinity,
        offsetY: null as unknown as number,
        blur: undefined,
        spread: "2" as unknown as number,
        color: "nope",
        inset: "yes" as unknown as boolean,
      }),
    ).toEqual(DEFAULT_SHADOW_CONFIG);
  });

  it("protects mutable defaults while exercising fallback configuration", () => {
    const snapshot = { ...DEFAULT_SHADOW_CONFIG };
    try {
      DEFAULT_SHADOW_CONFIG.color = "#12345678";
      expect(getOpaqueHexColor("nope")).toBe("#123456");
      expect(getAlphaPercentage("nope")).toBe(47);
      DEFAULT_SHADOW_CONFIG.color = "nope";
      expect(getAlphaPercentage("nope")).toBe(20);
    } finally {
      Object.assign(DEFAULT_SHADOW_CONFIG, snapshot);
    }
  });
});
