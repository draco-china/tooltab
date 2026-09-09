export const MAX_CASE_INPUT = 100_000;
export const caseStyles = [
  "camel",
  "pascal",
  "snake",
  "constant",
  "kebab",
  "cobol",
  "dot",
  "path",
  "title",
  "sentence",
  "upper",
  "lower",
] as const;
export type CaseStyle = (typeof caseStyles)[number];
export class CaseConversionError extends Error {
  constructor(public readonly code: "too_large" | "invalid_unicode") {
    super(code);
  }
}
/** Naming styles tokenize Unicode letters/digits and normalize separators. */
export function convertTextCases(input: string): Record<CaseStyle, string> {
  if (input.length > MAX_CASE_INPUT) throw new CaseConversionError("too_large");
  for (const point of input) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const code = point.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff)
      throw new CaseConversionError("invalid_unicode");
  }
  const words = input
    .replace(/[_\-./\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  const capitalize = (word: string) => {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const first = String.fromCodePoint(word.codePointAt(0)!);
    return first.toUpperCase() + word.slice(first.length);
  };
  const title = words.map(capitalize);
  return {
    camel: (words[0] ?? "") + title.slice(1).join(""),
    pascal: title.join(""),
    snake: words.join("_"),
    constant: words.join("_").toUpperCase(),
    kebab: words.join("-"),
    cobol: words.join("-").toUpperCase(),
    dot: words.join("."),
    path: words.join("/"),
    title: title.join(" "),
    sentence: words.length ? [title[0], ...words.slice(1)].join(" ") : "",
    upper: words.join(" ").toUpperCase(),
    lower: words.join(" "),
  };
}
