import {
  generateSlug as transliterateSlug,
  isSlugCase,
  isSlugSeparator,
  DEFAULT_SEPARATOR,
  DEFAULT_CASE,
  type SlugSeparator,
  type SlugCase,
} from "./slug";
export const MAX_LIST_TEXT = 10_000_000;
export const MAX_LIST_ROWS = 500_000;
export const MAX_SLUG_TEXT = 2_000_000;
export const MAX_SLUG_OUTPUT = 16_000_000;
export class ListSlugError extends Error {
  constructor(
    public readonly code:
      | "too_large"
      | "invalid_options"
      | "invalid_unicode"
      | "unsupported"
      | "read_failed",
  ) {
    super(code);
  }
}
export const DELIMITERS = ["newline", "comma", "tab", "custom"] as const;
export const RESULT_KEYS = [
  "shared",
  "left-only",
  "right-only",
  "all-unique",
  "left-duplicates",
  "right-duplicates",
] as const;
export type ResultKey = (typeof RESULT_KEYS)[number];
export type ListOptions = {
  delimiterMode: (typeof DELIMITERS)[number];
  customDelimiter: string;
  trimItems: boolean;
  ignoreCase: boolean;
  omitEmptyItems: boolean;
  sortResults: boolean;
  locale: string;
};
export const DEFAULT_LIST_OPTIONS: ListOptions = {
  delimiterMode: "newline",
  customDelimiter: "|",
  trimItems: true,
  ignoreCase: false,
  omitEmptyItems: true,
  sortResults: false,
  locale: "en-US",
};
function validateUnicode(s: string, max: number) {
  if (s.length > max) throw new ListSlugError("too_large");
  for (const c of s) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const n = c.codePointAt(0)!;
    if (n >= 0xd800 && n <= 0xdfff) throw new ListSlugError("invalid_unicode");
  }
}
export type ListSummary = {
  totalCount: number;
  uniqueCount: number;
  duplicateCount: number;
  uniqueItems: string[];
  duplicateItems: { value: string; count: number }[];
};
export function compareLists(
  leftText: string,
  rightText: string,
  options: ListOptions = DEFAULT_LIST_OPTIONS,
) {
  validateUnicode(leftText, MAX_LIST_TEXT);
  validateUnicode(rightText, MAX_LIST_TEXT);
  validateUnicode(options.customDelimiter, 100);
  if (
    !DELIMITERS.includes(options.delimiterMode) ||
    ["trimItems", "ignoreCase", "omitEmptyItems", "sortResults"].some(
      (k) => typeof options[k as keyof ListOptions] !== "boolean",
    ) ||
    typeof options.locale !== "string" ||
    options.locale.length > 100
  )
    throw new ListSlugError("invalid_options");
  let collator: Intl.Collator;
  try {
    collator = new Intl.Collator(options.locale || "en-US", {
      numeric: true,
      sensitivity: "variant",
    });
  } catch {
    throw new ListSlugError("invalid_options");
  }
  const order = (a: string, b: string) => collator.compare(a, b);
  function collect(source: string) {
    const separator =
      options.delimiterMode === "newline"
        ? /\r\n|\r|\n/
        : options.delimiterMode === "comma"
          ? ","
          : options.delimiterMode === "tab"
            ? "\t"
            : options.customDelimiter;
    const rows =
      source === ""
        ? []
        : separator === ""
          ? [source]
          : source.split(separator, MAX_LIST_ROWS + 1);
    if (rows.length > MAX_LIST_ROWS) throw new ListSlugError("too_large");
    const map = new Map<string, { value: string; count: number }>();
    let totalCount = 0;
    for (const row of rows) {
      const value = options.trimItems ? row.trim() : row;
      if (options.omitEmptyItems && value === "") continue;
      totalCount++;
      const key = options.ignoreCase ? value.toLowerCase() : value;
      const prior = map.get(key);
      if (prior) prior.count++;
      else map.set(key, { value, count: 1 });
    }
    const uniqueItems = Array.from(map.values(), (v) => v.value),
      duplicateItems = Array.from(map.values()).filter((v) => v.count > 1);
    if (options.sortResults) {
      uniqueItems.sort(order);
      duplicateItems.sort((a, b) => order(a.value, b.value));
    }
    const summary: ListSummary = {
      totalCount,
      uniqueCount: map.size,
      duplicateCount: totalCount - map.size,
      uniqueItems,
      duplicateItems,
    };
    return { map, summary };
  }
  const left = collect(leftText),
    right = collect(rightText);
  const sharedItems: string[] = [],
    leftOnlyItems: string[] = [],
    rightOnlyItems: string[] = [],
    allUniqueItems = [...left.summary.uniqueItems];
  for (const [key, value] of left.map)
    (right.map.has(key) ? sharedItems : leftOnlyItems).push(value.value);
  for (const [key, value] of right.map)
    if (!left.map.has(key)) {
      rightOnlyItems.push(value.value);
      allUniqueItems.push(value.value);
    }
  if (options.sortResults)
    for (const result of [
      sharedItems,
      leftOnlyItems,
      rightOnlyItems,
      allUniqueItems,
    ])
      result.sort(order);
  return {
    left: left.summary,
    right: right.summary,
    sharedItems,
    leftOnlyItems,
    rightOnlyItems,
    allUniqueItems,
  };
}
export type ListComparison = ReturnType<typeof compareLists>;
function tsvField(value: string) {
  return /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
export function listResult(result: ListComparison, key: ResultKey) {
  if (!RESULT_KEYS.includes(key)) throw new ListSlugError("invalid_options");
  if (key === "left-duplicates" || key === "right-duplicates") {
    const values = (key === "left-duplicates" ? result.left : result.right)
      .duplicateItems;
    return {
      count: values.length,
      output: values.map((v) => `${tsvField(v.value)}\t${v.count}`).join("\n"),
      extension: "tsv" as const,
    };
  }
  const values =
    key === "shared"
      ? result.sharedItems
      : key === "left-only"
        ? result.leftOnlyItems
        : key === "right-only"
          ? result.rightOnlyItems
          : result.allUniqueItems;
  return {
    count: values.length,
    output: values.join("\n"),
    extension: "txt" as const,
  };
}
export function generateSlug(
  input: string,
  separator: SlugSeparator = DEFAULT_SEPARATOR,
  caseMode: SlugCase = DEFAULT_CASE,
) {
  validateUnicode(input, MAX_SLUG_TEXT);
  if (!isSlugSeparator(separator) || !isSlugCase(caseMode))
    throw new ListSlugError("invalid_options");
  const output = transliterateSlug(input, separator, caseMode);
  if (output.length > MAX_SLUG_OUTPUT) throw new ListSlugError("too_large");
  return output;
}
