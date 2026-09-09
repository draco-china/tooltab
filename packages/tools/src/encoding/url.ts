export type UrlMode = "component" | "uri";
export type UrlOperation = "encode" | "decode";
export const MAX_URL_INPUT = 1_000_000;
export class UrlCodecError extends Error {
  constructor(
    public readonly code: "invalid_unicode" | "invalid_encoding" | "too_large",
  ) {
    super(code);
  }
}
export function transformUrl(
  input: string,
  operation: UrlOperation,
  mode: UrlMode = "component",
): string {
  if (input.length > MAX_URL_INPUT) throw new UrlCodecError("too_large");
  if (
    !["encode", "decode"].includes(operation) ||
    !["component", "uri"].includes(mode)
  )
    throw new Error("Invalid URL codec option");
  for (const character of input) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff)
      throw new UrlCodecError("invalid_unicode");
  }
  try {
    if (operation === "encode")
      return mode === "component"
        ? encodeURIComponent(input)
        : encodeURI(input);
    return mode === "component" ? decodeURIComponent(input) : decodeURI(input);
  } catch {
    throw new UrlCodecError("invalid_encoding");
  }
}
