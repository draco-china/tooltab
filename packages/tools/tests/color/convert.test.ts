import { expect, it } from "vitest";
import {
  checkContrast,
  colorValues,
  convertColor,
  hexColor,
  parseColor,
  relativeLuminance,
} from "../../src/color/convert";

it("converts independent primary color vectors across all formats", () => {
  const c = parseColor("red"),
    v = colorValues(c);
  expect(c).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  expect(v.hex).toBe("#FF0000FF");
  expect(v.hsl).toBe("hsla(0, 100%, 50%, 1)");
  expect(v.hsv).toBe("hsva(0, 100%, 100%, 1)");
  expect(v.cmyk).toBe("cmyk(0%, 100%, 100%, 0%)");
  expect(v.lab).toBe("lab(53.2, 80.1, 67.2)");
  expect(v.keyword).toBe("red");
  for (const input of [
    "hsv(0 100 100)",
    "hwb(0 0 0)",
    "lab(53.2 80.1 67.2)",
    "cmyk(0 100 100 0)",
  ])
    expect(hexColor(parseColor(input))).toBe("#FF0000");
});
it("accepts full CSS names, HEX alpha and functional units", () => {
  expect(hexColor(parseColor("RebeccaPurple"))).toBe("#663399");
  expect(hexColor(parseColor("papayawhip"))).toBe("#FFEFD5");
  expect(parseColor("#abcd").a).toBeCloseTo(221 / 255);
  expect(parseColor("rgba(100%, 0%, 0%, 50%)")).toEqual({
    r: 255,
    g: 0,
    b: 0,
    a: 0.5,
  });
  expect(hexColor(parseColor("hsl(0.5turn 100% 50% / 25%)"), true)).toBe(
    "#00FFFF40",
  );
  expect(hexColor(parseColor("hsl(100grad 100% 50%)"))).toBe("#80FF00");
  expect(parseColor("hsl(3.141592653589793rad 100 50)")).toEqual(
    parseColor("hsl(180 100 50)"),
  );
  expect(parseColor("transparent").a).toBe(0);
  expect(convertColor("#1234", undefined, false).values.hex).toBe("#112233");
});
it("clamps RGB and alpha, rejects malformed functions and bounded invalid values", () => {
  expect(parseColor("rgba(-10 999 0 150%)")).toEqual({
    r: 0,
    g: 255,
    b: 0,
    a: 1,
  });
  for (const s of [
    "rgb(1,,2,3)",
    "rgb(1 2 3 / )",
    "rgb(1 2 3) x",
    "lab(101 0 0)",
    "lch(50 -1 0)",
    "lch(50 1 400)",
    "cmyk(101 0 0 0)",
    "hwb(0 0 0 / .5)",
    "rgb(Infinity 0 0)",
    "rgb(1e99 0 0)",
    "__proto__",
    "currentColor",
    "laba(50,0,0)",
    "hwba(0,0,0)",
    "cmyka(0,0,0,0)",
  ])
    expect(() => parseColor(s), s).toThrow("invalid_color");
  expect(() => parseColor("a".repeat(501))).toThrow("too_large");
  expect(() => parseColor("red", "rgb")).toThrow("invalid_color");
});
it("matches WCAG independent black/white/red vectors", () => {
  expect(relativeLuminance(parseColor("red"))).toBe(0.2126);
  const bw = checkContrast("#000", "#fff");
  expect(bw.ratio).toBe(21);
  expect(bw.aaaNormal).toBe(true);
  expect(checkContrast("#fff", "#fff").ratio).toBe(1);
  expect(checkContrast("red", "white").ratio).toBeCloseTo(3.99847677, 6);
  expect(checkContrast("#777", "#fff")).toMatchObject({
    aaNormal: false,
    aaLarge: true,
    aaaNormal: false,
    aaaLarge: false,
  });
  expect(checkContrast("#767676", "#fff").aaNormal).toBe(true);
});
it("composites foreground over resolved white-backed background without integer rounding", () => {
  const r = checkContrast("rgba(255 0 0 / .5)", "rgba(0 0 0 / .5)");
  expect(r.background).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
  expect(r.foreground).toEqual({ r: 191.25, g: 63.75, b: 63.75, a: 1 });
  expect(checkContrast("transparent", "#000").ratio).toBe(1);
  expect(checkContrast("#000", "transparent").ratio).toBe(21);
});
it("does not pass a 4.499 ratio rounded to 4.50", () => {
  const luminance = 1.05 / 4.499 - 0.05;
  const alpha = 1 - (1.055 * luminance ** (1 / 2.4) - 0.055);
  const result = checkContrast(`rgba(0 0 0 / ${alpha})`, "white");
  expect(result.ratio).toBeCloseTo(4.499, 10);
  expect(result.ratio.toFixed(2)).toBe("4.50");
  expect(result.aaNormal).toBe(false);
});

it("covers explicit format selection, all modern function syntaxes and alpha rules", () => {
  expect(parseColor("#abc", "hex")).toEqual({ r: 170, g: 187, b: 204, a: 1 });
  expect(parseColor("rgb(10, 20, 30)", "rgb")).toEqual({
    r: 10,
    g: 20,
    b: 30,
    a: 1,
  });
  for (const input of [
    "hsv(120 100% 50%)",
    "hwb(120 0% 0%)",
    "lab(50 0 0)",
    "lch(50 20 120)",
    "cmyk(0%, 10%, 20%, 30%)",
  ])
    expect(parseColor(input)).toBeTruthy();
  expect(parseColor("rgba(1 2 3 / 50%)").a).toBe(0.5);
  expect(() => parseColor("rgb(1 2 3)", "hex")).toThrow("invalid_color");
  expect(() => parseColor("rgb(1 2 3 / .5 / .2)")).toThrow("invalid_color");
  expect(() => parseColor("cmyk(0 0 0 0 / .5)")).toThrow("invalid_color");
  expect(() => parseColor("red", "unknown" as never)).toThrow("invalid_color");
  expect(() => parseColor("rgb(1 2)")).toThrow("invalid_color");
});

it("covers numeric units, clamping, no-alpha formatting and conversion", () => {
  expect(parseColor("hsl(-90deg 100% 50%)")).toEqual({
    r: 127,
    g: 0,
    b: 255,
    a: 1,
  });
  expect(parseColor("rgb(100% 50% 0% / 25%)")).toEqual({
    r: 255,
    g: 128,
    b: 0,
    a: 0.25,
  });
  expect(convertColor("#1234", "hex", false).values.rgb).toBe(
    "rgb(17, 34, 51)",
  );
  expect(convertColor("red").color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  expect(colorValues({ r: 12, g: 34, b: 56, a: 0.25 }, false).hex).toBe(
    "#0C2238",
  );
});
