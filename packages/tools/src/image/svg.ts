import { validateDimensions } from "./options";

export function outputDimensions(width: number, height: number, scale = 1) {
  if (
    ![width, height].every((n) => Number.isInteger(n) && n > 0) ||
    ![1, 2, 3].includes(scale)
  )
    throw new Error("invalidDimensions");
  return validateDimensions({ width: width * scale, height: height * scale });
}

const elements = new Set(
  "svg g defs path rect circle ellipse line polyline polygon text tspan textPath linearGradient radialGradient stop clipPath mask pattern title desc"
    .toLowerCase()
    .split(" "),
);

export interface SvgXmlElement {
  localName: string | null;
  namespaceURI: string | null;
  attributes: ArrayLike<{ localName: string | null; value: string }>;
  getElementsByTagName(name: string): ArrayLike<SvgXmlElement>;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
}
export interface SvgXmlRuntime {
  parse(source: string): {
    documentElement: SvgXmlElement;
    getElementsByTagName(name: string): ArrayLike<SvgXmlElement>;
  };
  serialize(root: SvgXmlElement): string;
}

const invalidXmlCharacters =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject XML 1.0 forbidden characters before either parser can replace them.
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u;

/** Parse in a detached XML document; only serialize vetted SVG into an image Blob. */
export function validateSvg(source: string, xml: SvgXmlRuntime) {
  if (
    !source.trim() ||
    source.length > 2_000_000 ||
    new TextEncoder().encode(source).byteLength > 2_000_000 ||
    invalidXmlCharacters.test(source) ||
    /<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(source)
  )
    throw new Error("svgInvalid");
  const doc = xml.parse(source);
  const root = doc.documentElement;
  if (
    doc.getElementsByTagName("parsererror").length ||
    root.localName !== "svg" ||
    root.namespaceURI !== "http://www.w3.org/2000/svg"
  )
    throw new Error("svgInvalid");
  const nodes = [root, ...Array.from(root.getElementsByTagName("*"))];
  if (nodes.length > 10000) throw new Error("svgInvalid");
  for (const node of nodes) {
    if (
      node.namespaceURI !== root.namespaceURI ||
      !elements.has((node.localName ?? "").toLowerCase())
    )
      throw new Error("svgInvalid");
    for (const attr of Array.from(node.attributes)) {
      // Do not serialize attributes whose names the runtime cannot identify.
      if (!attr.localName) throw new Error("svgInvalid");
      const name = attr.localName.toLowerCase();
      const value = attr.value.trim();
      if (
        name.startsWith("on") ||
        ["base", "src", "style", "filter"].includes(name) ||
        /[\\@]|expression\s*\(|javascript\s*:/i.test(value)
      )
        throw new Error("svgInvalid");
      if (name === "href" && !/^#[\w:.-]+$/.test(value))
        throw new Error("svgInvalid");
      const withoutLocalUrls = value.replace(
        /url\s*\(\s*(['"]?)(#[\w:.-]+)\1\s*\)/gi,
        "",
      );
      if (/url\s*\(/i.test(withoutLocalUrls)) throw new Error("svgInvalid");
    }
  }
  const viewBox = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const validViewBox =
    viewBox?.length === 4 &&
    viewBox.every(Number.isFinite) &&
    viewBox[2] > 0 &&
    viewBox[3] > 0;
  if (viewBox && !validViewBox) throw new Error("svgInvalid");
  const dimension = (name: string, fallback: number) => {
    const value = root.getAttribute(name);
    return value && /^\d*\.?\d+(px)?$/.test(value)
      ? Number.parseFloat(value)
      : fallback;
  };
  const width = Math.round(dimension("width", validViewBox ? viewBox[2] : 300));
  const height = Math.round(
    dimension("height", validViewBox ? viewBox[3] : 150),
  );
  outputDimensions(width, height);
  if (!root.hasAttribute("viewBox"))
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  return { source: xml.serialize(root), width, height };
}

/** Build the preview viewport exactly as the raster export viewport. */
export function svgViewport(
  source: string,
  width: number,
  height: number,
  scale: number,
  xml: SvgXmlRuntime,
) {
  const size = outputDimensions(width, height, scale);
  const doc = xml.parse(source);
  doc.documentElement.setAttribute("width", String(size.width));
  doc.documentElement.setAttribute("height", String(size.height));
  return xml.serialize(doc.documentElement);
}
