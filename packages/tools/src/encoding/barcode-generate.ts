import JsBarcode from "jsbarcode";
import {
  BARCODE_PIXEL_LIMIT,
  BarcodeError,
  type BarcodeImage,
  barcodeOptionsSchema,
} from "./barcode-contract";

// JsBarcode's object renderer merges validated options and library defaults
// into every encoding, including EAN/UPC sections with adjusted dimensions.
type Encoding = {
  data: string;
  text: string;
  options: JsBarcode.Options &
    Required<Pick<JsBarcode.Options, "fontSize" | "height" | "textMargin">>;
};
const escapeXml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export async function generateBarcode(
  raw: unknown,
  measureText: (text: string, fontSize: number) => number,
): Promise<BarcodeImage> {
  const options = barcodeOptionsSchema.parse(raw);

  if (
    options.text.length * options.width * options.height >
    BARCODE_PIXEL_LIMIT
  )
    throw new BarcodeError("too_large");
  const encoded: { encodings?: Encoding[] } = {};
  try {
    // Supply the safe caption before encoding: CODE128 strips controls from its
    // default caption. The data argument retains the original control bytes.
    const text = Array.from(options.text, (c) => {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      const n = c.codePointAt(0)!;
      return n < 32 ? String.fromCodePoint(0x2400 + n) : n === 127 ? "␡" : c;
    }).join("");
    JsBarcode(encoded, options.text || " ", { ...options, text });
  } catch {
    throw new BarcodeError("invalid_input");
  }
  // Every fixed encoder returns at least one section; object rendering assigns it on success.
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const encodings = encoded.encodings!;
  // Layout is bounded before SVG nodes or raster pixels are created.
  const barWidth = encodings.reduce(
    (sum, e) => sum + e.data.length * options.width,
    0,
  );
  if (barWidth * (options.height + 2 * options.margin) > BARCODE_PIXEL_LIMIT)
    throw new BarcodeError("too_large");
  const sections = encodings.map((e) => {
    const o = { ...options, ...e.options };
    const width = Math.ceil(
      Math.max(
        e.data.length * options.width,
        o.displayValue ? measureText(e.text, o.fontSize) : 0,
      ),
    );
    const height =
      o.height +
      (o.displayValue && e.text.length ? o.fontSize + o.textMargin : 0) +
      2 * options.margin;
    return { e, o, width, height };
  });
  const width = sections.reduce((sum, e) => sum + e.width, 2 * options.margin),
    height = Math.max(...sections.map((e) => e.height));
  if (
    !Number.isSafeInteger(width) ||
    width * height > BARCODE_PIXEL_LIMIT ||
    width > 65535
  )
    throw new BarcodeError("too_large");
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${options.background}"/>`,
  ];
  let offset = options.margin;
  for (const { e, o, width: w } of sections) {
    const fontSize = o.fontSize,
      textMargin = o.textMargin,
      barHeight = o.height;
    const gap = w - e.data.length * options.width,
      padding =
        o.textAlign === "right"
          ? gap
          : o.textAlign === "left"
            ? 0
            : Math.floor(gap / 2);
    const y =
      options.margin +
      (o.displayValue && e.text.length && o.textPosition === "top"
        ? fontSize + textMargin
        : 0);
    let start = -1;
    for (let i = 0; i <= e.data.length; i++) {
      if (e.data[i] === "1" && start < 0) start = i;
      if (e.data[i] !== "1" && start >= 0) {
        parts.push(
          `<rect x="${offset + padding + start * options.width}" y="${y}" width="${(i - start) * options.width}" height="${barHeight}" fill="${options.lineColor}"/>`,
        );
        start = -1;
      }
    }
    if (o.displayValue) {
      const align =
        o.textAlign === "left" || padding > 0
          ? "start"
          : o.textAlign === "right"
            ? "end"
            : "middle";
      const x =
        align === "start"
          ? offset
          : align === "end"
            ? offset + w - 1
            : offset + w / 2;
      const ty =
        options.margin +
        (o.textPosition === "top"
          ? fontSize - textMargin
          : barHeight + textMargin + fontSize);
      parts.push(
        `<text x="${x}" y="${ty}" fill="${options.lineColor}" font-family="monospace" font-size="${fontSize}" text-anchor="${align}">${escapeXml(e.text)}</text>`,
      );
    }
    offset += w;
  }
  parts.push("</svg>");
  return { svg: parts.join(""), width, height };
}
