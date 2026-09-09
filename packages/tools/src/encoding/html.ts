import { decodeHTMLStrict, encodeHTML } from "entities";
export const MAX_CODEC_TEXT = 100_000;
export const MAX_CODEC_ENCODED = 3_200_000;
export class TextCodecError extends Error {
  constructor(
    public readonly code:
      | "too_large"
      | "invalid_unicode"
      | "invalid_escape"
      | "invalid_option",
  ) {
    super(code);
  }
}
function validate(input: string, limit = MAX_CODEC_TEXT) {
  if (input.length > limit) throw new TextCodecError("too_large");
  for (const c of input) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const cp = c.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff)
      throw new TextCodecError("invalid_unicode");
  }
}
export type HtmlFormat = "named" | "decimal" | "hex";
export type HtmlRange = "minimal" | "non-ascii" | "all-special";
export function encodeHtmlText(
  input: string,
  format: HtmlFormat = "named",
  range: HtmlRange = "minimal",
) {
  validate(input);
  if (
    !["named", "decimal", "hex"].includes(format) ||
    !["minimal", "non-ascii", "all-special"].includes(range)
  )
    throw new TextCodecError("invalid_option");
  return Array.from(input, (c) => {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const cp = c.codePointAt(0)!;
    const needed =
      /[&<>"']/.test(c) ||
      (range === "non-ascii" && cp > 127) ||
      (range === "all-special" && !/[a-z0-9\s]/i.test(c));
    if (!needed) return c;
    if (format === "decimal") return `&#${cp};`;
    if (format === "hex") return `&#x${cp.toString(16).toUpperCase()};`;
    const named = encodeHTML(c);
    return named === c ? `&#x${cp.toString(16).toUpperCase()};` : named;
  }).join("");
}
export function decodeHtmlText(input: string) {
  validate(input, MAX_CODEC_ENCODED);
  return input.replace(
    /&(?:#[xX][\da-fA-F]+|#\d+|[A-Za-z][A-Za-z\d]+);/g,
    (entity) => {
      if (entity.startsWith("&#")) {
        const hex = /^&#x/i.test(entity);
        const cp = Number.parseInt(
          entity.slice(hex ? 3 : 2, -1),
          hex ? 16 : 10,
        );
        if (
          !Number.isFinite(cp) ||
          cp === 0 ||
          cp > 0x10ffff ||
          (cp >= 0xd800 && cp <= 0xdfff)
        )
          return entity;
        return String.fromCodePoint(cp);
      }
      return decodeHTMLStrict(entity);
    },
  );
}
