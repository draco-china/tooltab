import { DOMParser, XMLSerializer, type Element } from "@xmldom/xmldom";
import { expect, it } from "vitest";
import {
  outputDimensions,
  type SvgXmlRuntime,
  svgViewport,
  validateSvg,
} from "../../src/image/svg";

const xml: SvgXmlRuntime = {
  parse(source) {
    const doc = new DOMParser({
      onError: () => {
        throw Error("svgInvalid");
      },
    }).parseFromString(source, "application/xml");
    if (!doc.documentElement) throw Error("svgInvalid");
    return doc as unknown as ReturnType<SvgXmlRuntime["parse"]>;
  },
  serialize(root) {
    return new XMLSerializer().serializeToString(root as unknown as Element);
  },
};

const svg = (body: string, attrs = 'viewBox="0 0 200 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

it("accepts real SVG content and normalizes dimensions", () => {
  const result = validateSvg(svg("<text>hello &amp; 世界</text>"), xml);
  expect(result).toMatchObject({ width: 200, height: 100 });
  expect(result.source).toContain('width="200"');
  expect(result.source).toContain('height="100"');
  expect(validateSvg(svg("<g/>", 'width="20" height="10"'), xml)).toEqual(
    expect.objectContaining({ width: 20, height: 10 }),
  );
});

it.each([
  '<image href="https://example.test/a.png"/>',
  '<rect onclick="evil()"/>',
  '<rect fill="url(//example.test/x)"/>',
  '<rect style="fill:red"/>',
  '<rect filter="url(#x)"/>',
  '<g xmlns="urn:other"/>',
  "<script>alert(1)</script>",
])("rejects unsafe or unsupported markup: %s", (body) => {
  expect(() => validateSvg(svg(body), xml)).toThrow("svgInvalid");
});

it.each([
  "",
  '<?xml version="1.0"?>',
  "<!-- only comment -->",
  "<html/>",
  "<svg>",
  "<svg/>",
  "<!DOCTYPE svg><svg/>",
  '<!ENTITY x "x"><svg/>',
])("rejects malformed roots and declarations: %s", (source) => {
  expect(() => validateSvg(source, xml)).toThrow("svgInvalid");
});

it.each([
  "\u0000",
  "\u0001",
  "\u000B",
  "\u001F",
  "\uD800",
  "\uDC00",
  "\uFFFE",
  "\uFFFF",
])("rejects XML-forbidden literal character %s", (character) => {
  expect(() => validateSvg(svg(`<text>${character}</text>`), xml)).toThrow(
    "svgInvalid",
  );
});

it("rejects excessive nodes and invalid dimensions", () => {
  expect(() => validateSvg(svg("<g/>".repeat(10000)), xml)).toThrow(
    "svgInvalid",
  );
  expect(() => validateSvg(svg("", 'width="0" height="10"'), xml)).toThrow(
    "invalidDimensions",
  );
  expect(() => validateSvg(svg("", 'viewBox="0 0 0 10"'), xml)).toThrow(
    "svgInvalid",
  );
});

it("enforces output dimensions and builds the same viewport used by raster export", () => {
  expect(outputDimensions(8192, 1, 1)).toEqual({ width: 8192, height: 1 });
  expect(outputDimensions(4000, 2000, 2)).toEqual({
    width: 8000,
    height: 4000,
  });
  expect(() => outputDimensions(8193, 1, 1)).toThrow("invalidDimensions");
  expect(() => outputDimensions(4000, 2000, 3)).toThrow("invalidDimensions");
  const viewport = svgViewport(svg("<rect/>"), 40, 20, 2, xml);
  expect(viewport).toContain('width="80"');
  expect(viewport).toContain('height="40"');
});

it("preserves local references and astral Unicode without permitting remote references", () => {
  const result = validateSvg(
    svg(
      '<defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(\'#paint\')"/><text>😀</text><textPath href="#path">hi</textPath>',
    ),
    xml,
  );
  expect(result.source).toContain("😀");
  expect(result.source).toContain('href="#path"');
  for (const value of [
    "https://example.test/x",
    "data:image/svg+xml,x",
    "#bad space",
    "javascript:alert(1)",
  ])
    expect(() => validateSvg(svg(`<textPath href="${value}"/>`), xml)).toThrow(
      "svgInvalid",
    );
  for (const value of [
    "expression(x)",
    "@import",
    "bad\\value",
    "url(#ok) url(https://example.test/x)",
  ])
    expect(() => validateSvg(svg(`<rect fill="${value}"/>`), xml)).toThrow(
      "svgInvalid",
    );
});

it("normalizes missing, pixel and percentage dimensions using the existing viewport rules", () => {
  expect(validateSvg(svg("", ""), xml)).toMatchObject({
    width: 300,
    height: 150,
  });
  const result = validateSvg(svg("", 'width="20.6px" height="10.4px"'), xml);
  expect(result).toMatchObject({ width: 21, height: 10 });
  expect(result.source).toContain('viewBox="0 0 21 10"');
  expect(
    validateSvg(
      svg("", 'viewBox="-2, -3, 40, 50" width="100%" height=""'),
      xml,
    ),
  ).toMatchObject({ width: 40, height: 50 });
  for (const viewBox of [
    "",
    "0 0 1",
    "0 0 NaN 1",
    "0 0 1 Infinity",
    "0 0 -1 1",
    "0 0 1 0",
  ])
    expect(() => validateSvg(svg("", `viewBox="${viewBox}"`), xml)).toThrow(
      "svgInvalid",
    );
  for (const dimensions of [
    [0, 1, 1],
    [1, -1, 1],
    [1.5, 1, 1],
    [1, 1, 4],
    [1, 1, NaN],
  ])
    expect(() =>
      outputDimensions(...(dimensions as [number, number, number])),
    ).toThrow("invalidDimensions");
});

it("applies character, UTF-8 byte and node limits to actual XML inputs", () => {
  expect(() => validateSvg(svg("x".repeat(2_000_001)), xml)).toThrow(
    "svgInvalid",
  );
  const multiByte = svg(`<text>${"界".repeat(700_000)}</text>`);
  expect(multiByte.length).toBeLessThan(2_000_000);
  expect(() => validateSvg(multiByte, xml)).toThrow("svgInvalid");
  expect(validateSvg(svg("<g/>".repeat(9999)), xml).width).toBe(200);
  expect(() => validateSvg(`<?processing data?>${svg("")}`, xml)).toThrow(
    "svgInvalid",
  );
  expect(() => validateSvg('<svg xmlns="urn:other"/>', xml)).toThrow(
    "svgInvalid",
  );
  expect(() => validateSvg(svg("<parsererror/>"), xml)).toThrow("svgInvalid");
});

it.each(["element", "attribute"] as const)(
  "rejects a missing %s local name from the XML runtime contract",
  (kind) => {
    const incomplete: SvgXmlRuntime = {
      ...xml,
      parse(source) {
        const doc = xml.parse(source);
        const node = doc.documentElement.getElementsByTagName("g")[0];
        const target = kind === "element" ? node : node.attributes[0];
        Object.defineProperty(target, "localName", { value: null });
        expect(xml.serialize(doc.documentElement)).toContain('onload="run()"');
        return doc;
      },
    };
    // The adapter contract permits nullable names; serialization still retains
    // the original attribute name, so validation must reject an unnamed attribute.
    expect(() => validateSvg(svg('<g onload="run()"/>'), incomplete)).toThrow(
      "svgInvalid",
    );
    expect(validateSvg(svg('<g fill="red"/>'), xml).source).toContain(
      'fill="red"',
    );
  },
);
