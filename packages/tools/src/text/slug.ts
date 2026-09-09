import { slugify } from "transliteration";

export type SlugSeparator = "-" | "_" | ".";
export type SlugCase = "lower" | "preserve";

export const DEFAULT_SEPARATOR: SlugSeparator = "-";
export const DEFAULT_CASE: SlugCase = "lower";
export const SLUG_SEPARATORS = ["-", "_", "."] as const;
export const SLUG_CASES = ["lower", "preserve"] as const;

export function generateSlug(
  input: string,
  separator: SlugSeparator = DEFAULT_SEPARATOR,
  slugCase: SlugCase = DEFAULT_CASE,
) {
  return slugify(input.trim(), {
    separator,
    lowercase: slugCase === "lower",
    trim: true,
  });
}

export function isSlugSeparator(value: string): value is SlugSeparator {
  return (SLUG_SEPARATORS as readonly string[]).includes(value);
}

export function isSlugCase(value: string): value is SlugCase {
  return (SLUG_CASES as readonly string[]).includes(value);
}
