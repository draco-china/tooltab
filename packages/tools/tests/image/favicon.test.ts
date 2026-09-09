import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  type FaviconSite,
  faviconHead,
  faviconManifest,
  faviconNames,
  clampPercent,
  encodePngIco,
  normalizePath,
  squareLayout,
} from "../../src/image/favicon";

describe("favicon asset planning", () => {
  it("normalizes asset paths and layout margins", () => {
    expect(normalizePath("icons")).toBe("/icons/");
    expect(clampPercent(140)).toBe(100);
    expect(squareLayout(200, 100, 100, 20)).toEqual({
      x: 10,
      y: 30,
      width: 80,
      height: 40,
    });
  });
});

it("encodes actual PNG images with valid ICO directory offsets and 256px markers", async () => {
  const entries = [];
  for (const size of [16, 32, 256]) {
    entries.push({
      size,
      bytes: new Uint8Array(
        await sharp({
          create: {
            width: size,
            height: size,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
      ),
    });
  }
  const output = encodePngIco(entries);
  const header = new DataView(
    output.buffer,
    output.byteOffset,
    output.byteLength,
  );
  expect(header.getUint16(0, true)).toBe(0);
  expect(header.getUint16(2, true)).toBe(1);
  expect(header.getUint16(4, true)).toBe(3);
  let expectedOffset = 54;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const directory = 6 + index * 16;
    expect(output[directory]).toBe(entry.size === 256 ? 0 : entry.size);
    expect(output[directory + 1]).toBe(entry.size === 256 ? 0 : entry.size);
    expect(header.getUint16(directory + 4, true)).toBe(1);
    expect(header.getUint16(directory + 6, true)).toBe(32);
    const length = header.getUint32(directory + 8, true);
    const offset = header.getUint32(directory + 12, true);
    expect(length).toBe(entry.bytes.length);
    expect(offset).toBe(expectedOffset);
    const png = output.subarray(offset, offset + length);
    expect(png).toEqual(entry.bytes);
    const { data, info } = await sharp(png)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(entry.size);
    expect(info.height).toBe(entry.size);
    expect(Array.from(data.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expectedOffset += length;
  }
  expect(output.length).toBe(expectedOffset);
});

const site: FaviconSite = {
  name: " Example ",
  shortName: " Ex ",
  description: " Description ",
  startUrl: " /launch?q=1 ",
  assetPath: " icons ",
  themeColor: "#ffffff",
  darkThemeColor: "#000000",
  backgroundColor: "#eeeeee",
  includeMaskable: true,
};

it("produces a manifest whose icon references exist in the generated file set", () => {
  for (const includeMaskable of [false, true]) {
    const manifest = faviconManifest({
      ...site,
      includeMaskable,
      display: "browser",
    });
    expect(manifest).toMatchObject({
      name: "Example",
      short_name: "Ex",
      description: "Description",
      start_url: "/launch?q=1",
      display: "browser",
      theme_color: "#ffffff",
      background_color: "#eeeeee",
    });
    expect(manifest.icons).toHaveLength(includeMaskable ? 4 : 2);
    const names = faviconNames(includeMaskable);
    for (const icon of manifest.icons) {
      expect(names).toContain(icon.src.slice("/icons/".length));
      expect(icon.type).toBe("image/png");
      expect(icon.sizes).toMatch(/^(192x192|512x512)$/);
      expect(icon.purpose).toBe(
        icon.src.includes("maskable") ? "maskable" : "any",
      );
    }
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("head.html");
    expect(names).toContain("site.webmanifest");
    expect(names).not.toContain("favicon.svg");
    expect(faviconNames(includeMaskable, true)).toEqual(
      expect.arrayContaining([...names, "favicon.svg"]),
    );
  }
});

it("uses usable manifest defaults without emitting an empty description", () => {
  const blank = faviconManifest({
    ...site,
    name: " ",
    shortName: " ",
    description: " ",
    startUrl: " ",
    assetPath: " ",
    includeMaskable: false,
  });
  expect(blank).toMatchObject({
    name: "App",
    short_name: "App",
    start_url: "/",
    display: "standalone",
  });
  expect(blank).not.toHaveProperty("description");
  expect(blank.icons[0].src).toBe("/pwa-192x192.png");
  expect(faviconManifest({ ...site, shortName: " " }).short_name).toBe(
    "Example",
  );
});

it("escapes every HTML attribute delimiter and emits the requested theme and SVG links", () => {
  const dangerous = `&"'<>`;
  const head = faviconHead(
    {
      ...site,
      assetPath: dangerous,
      themeColor: dangerous,
      darkThemeColor: dangerous,
    },
    true,
  );
  expect(head).toContain('href="/&amp;&quot;&#39;&lt;&gt;/favicon.svg"');
  expect(head).toContain(
    'content="&amp;&quot;&#39;&lt;&gt;" media="(prefers-color-scheme: light)"',
  );
  expect(head).toContain(
    'content="&amp;&quot;&#39;&lt;&gt;" media="(prefers-color-scheme: dark)"',
  );
  expect(head).not.toContain(dangerous);
  const lightOnly = faviconHead({ ...site, enableDarkThemeColor: false });
  expect(lightOnly).toContain('<meta name="theme-color" content="#ffffff">');
  expect(lightOnly).not.toContain("prefers-color-scheme");
  expect(lightOnly).not.toContain("favicon.svg");
  expect(lightOnly.split("\n")).toHaveLength(6);
});

it("bounds margins and centers portrait icons even at degenerate dimensions", () => {
  for (const value of [NaN, Infinity, -Infinity, -1])
    expect(clampPercent(value)).toBe(0);
  expect(clampPercent(25)).toBe(25);
  expect(normalizePath(" /icons/ ")).toBe("/icons/");
  expect(normalizePath("")).toBe("/");
  expect(squareLayout(100, 200, 100, 0)).toEqual({
    x: 25,
    y: 0,
    width: 50,
    height: 100,
  });
  expect(squareLayout(0, -1, 0, 100)).toEqual({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
});
