import { expect, it } from "vitest";
import {
  compareLists,
  DEFAULT_LIST_OPTIONS,
  generateSlug,
  listResult,
  MAX_LIST_ROWS,
} from "../../src/text/lists";

it("preserves first display values and tracks total/unique/duplicate occurrences", () => {
  const r = compareLists(" Alpha \nbeta\nALPHA\nalpha", "BETA\ngamma\ngamma", {
    ...DEFAULT_LIST_OPTIONS,
    ignoreCase: true,
  });
  expect(r.left).toMatchObject({
    totalCount: 4,
    uniqueCount: 2,
    duplicateCount: 2,
    duplicateItems: [{ value: "Alpha", count: 3 }],
  });
  expect(r.sharedItems).toEqual(["beta"]);
  expect(r.leftOnlyItems).toEqual(["Alpha"]);
  expect(r.rightOnlyItems).toEqual(["gamma"]);
  expect(r.allUniqueItems).toEqual(["Alpha", "beta", "gamma"]);
  expect(listResult(r, "right-duplicates").output).toBe("gamma\t2");
});
it("supports all delimiters, empty rows and numeric sorting", () => {
  for (const [delimiterMode, input] of [
    ["newline", "a\rb\r\nc"],
    ["comma", "a,b,c"],
    ["tab", "a\tb\tc"],
    ["custom", "a||b||c"],
  ] as const)
    expect(
      compareLists(input, "", {
        ...DEFAULT_LIST_OPTIONS,
        delimiterMode,
        customDelimiter: "||",
      }).left.uniqueCount,
    ).toBe(3);
  expect(
    compareLists("", "", { ...DEFAULT_LIST_OPTIONS, omitEmptyItems: false })
      .left.totalCount,
  ).toBe(0);
  expect(
    compareLists("item12,,item3", "item1", {
      ...DEFAULT_LIST_OPTIONS,
      delimiterMode: "comma",
      omitEmptyItems: false,
      sortResults: true,
    }).allUniqueItems,
  ).toEqual(["", "item1", "item3", "item12"]);
  expect(
    compareLists("whole string", "", {
      ...DEFAULT_LIST_OPTIONS,
      delimiterMode: "custom",
      customDelimiter: "",
    }).left.uniqueItems,
  ).toEqual(["whole string"]);
});
it("quotes duplicate TSV cells with embedded delimiters without dropping data", () => {
  const r = compareLists("a\tb||a\tb", "", {
    ...DEFAULT_LIST_OPTIONS,
    delimiterMode: "custom",
    customDelimiter: "||",
  });
  expect(listResult(r, "left-duplicates").output).toBe('"a\tb"\t2');
  expect(r.left.duplicateItems[0]?.value).toBe("a\tb");
});
it("keeps Unicode normalization semantics explicit and rejects malformed input", () => {
  expect(compareLists("é", "e\u0301").sharedItems).toEqual([]);
  expect(() => compareLists("\uD800", "")).toThrow("invalid_unicode");
  expect(() =>
    compareLists("a", "b", {
      ...DEFAULT_LIST_OPTIONS,
      locale: "invalid_locale",
    }),
  ).toThrow("invalid_options");
  expect(() => compareLists("\n".repeat(MAX_LIST_ROWS), "")).toThrow(
    "too_large",
  );
});
it("processes realistic large lists without truncating result sets", () => {
  const left = Array.from({ length: 100000 }, (_, i) => `item-${i}`).join("\n"),
    right = Array.from({ length: 100000 }, (_, i) => `item-${i + 50000}`).join(
      "\n",
    );
  const result = compareLists(left, right);
  expect(result.sharedItems).toHaveLength(50000);
  expect(result.allUniqueItems).toHaveLength(150000);
  expect(result.rightOnlyItems.at(-1)).toBe("item-149999");
});
it("transliterates Chinese, Cyrillic, accented Latin and case/separator options", () => {
  expect(generateSlug("你好世界")).toBe("ni-hao-shi-jie");
  expect(generateSlug("Привет мир")).toBe("privet-mir");
  expect(generateSlug("Café & Résumé", "_", "preserve")).toBe("Cafe_Resume");
  expect(generateSlug(" A -- B . C ", ".")).toBe("a.--.b.c");
  expect(generateSlug("  ")).toBe("");
  expect(() => generateSlug("\uDFFF")).toThrow("invalid_unicode");
});

it("validates options, capacities and all result selections", () => {
  for (const patch of [
    { delimiterMode: "bad" },
    { trimItems: 0 },
    { locale: 5 },
    { locale: "x".repeat(101) },
  ]) {
    expect(() =>
      compareLists("a", "b", {
        ...DEFAULT_LIST_OPTIONS,
        ...patch,
      } as typeof DEFAULT_LIST_OPTIONS),
    ).toThrow("invalid_options");
  }
  expect(() => compareLists("x".repeat(10_000_001), "")).toThrow("too_large");
  expect(() =>
    compareLists("a", "", {
      ...DEFAULT_LIST_OPTIONS,
      customDelimiter: "x".repeat(101),
    }),
  ).toThrow("too_large");
  const result = compareLists(
    " b \n\nitem10\nitem2\nitem10\nitem2",
    "item2\nx",
    {
      ...DEFAULT_LIST_OPTIONS,
      trimItems: false,
      sortResults: true,
      locale: "",
    },
  );
  expect(result.left.uniqueItems).toEqual([" b ", "item2", "item10"]);
  expect(result.left.duplicateItems).toEqual([
    { value: "item2", count: 2 },
    { value: "item10", count: 2 },
  ]);
  expect(listResult(result, "shared")).toEqual({
    count: 1,
    output: "item2",
    extension: "txt",
  });
  expect(listResult(result, "left-only").output).toBe(" b \nitem10");
  expect(listResult(result, "right-only").output).toBe("x");
  expect(listResult(result, "all-unique").count).toBe(4);
  expect(() => listResult(result, "bad" as "shared")).toThrow(
    "invalid_options",
  );
  expect(() => generateSlug("x".repeat(2_000_001))).toThrow("too_large");
  expect(() => generateSlug("x", "/" as "-")).toThrow("invalid_options");
  expect(() => generateSlug("x", "-", "bad" as "lower")).toThrow(
    "invalid_options",
  );
  // Each U+3316 expands to nine ASCII letters in the real dependency.
  expect(() => generateSlug("㌖".repeat(1_800_000))).toThrow("too_large");
});
