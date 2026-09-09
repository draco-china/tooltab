import { expect, it } from "vitest";
import {
  analyzeText,
  assertText,
  clipText,
  normalizeFlags,
  splitLines,
} from "../../src/text/analysis";

function diff(original: string, modified: string, options = {}) {
  const r = analyzeText({ kind: "diff", original, modified, ...options });
  if (r.kind !== "diff") throw Error();
  return r;
}
function regex(input: string, pattern: string, flags = "g", replacement = "") {
  const r = analyzeText({ kind: "regex", input, pattern, flags, replacement });
  if (r.kind !== "regex") throw Error();
  return r;
}
it("aligns replace/add/remove/equal and preserves inline whitespace", () => {
  const r = diff("alpha\nbeta\ngamma", "alpha\nbeta 2\ngamma\nextra");
  expect(r.rows.map((x) => x.kind)).toEqual([
    "equal",
    "replace",
    "equal",
    "add",
  ]);
  expect(r.rows[1]?.original.tokens).toEqual([
    { kind: "equal", value: "beta" },
  ]);
  expect(r.rows[1]?.modified.tokens).toEqual([
    { kind: "equal", value: "beta" },
    { kind: "add", value: " 2" },
  ]);
  expect(r.stats).toMatchObject({
    unchanged: 2,
    changed: 1,
    added: 1,
    removed: 0,
  });
  expect(diff("x", "").rows[0]?.kind).toBe("remove");
  expect(diff("x", "y").rows[0]?.original.tokens).toEqual([
    { kind: "remove", value: "x" },
  ]);
});
it("normalizes all whitespace and case only when requested while preserving actual text", () => {
  expect(
    diff("Hello world\r\nconst  value = 1", "hello world\nconst value=1", {
      ignoreWhitespace: true,
      ignoreCase: true,
    }).stats.unchanged,
  ).toBe(2);
  expect(diff("x\n", "x").stats.removed).toBe(1);
  expect(diff("\nnext", "filled\nnext").rows[0]?.original.tokens).toEqual([]);
});
it("captures named/optional groups and summaries", () => {
  const r = regex(
    "Order #123-ABC\nOrder #456-DEF",
    "#(\\d+)-(?<code>[A-Z]+)",
    "g",
    "ID:$1 / $<code>",
  );
  expect(r.summary).toEqual({
    matchCount: 2,
    groupCount: 4,
    zeroLengthCount: 0,
  });
  expect(r.replacementOutput).toBe("Order ID:123 / ABC\nOrder ID:456 / DEF");
  expect(r.matchesTsv).toContain('"code":"ABC"');
  expect(regex("b", "(a)?b").matches[0]?.groups).toEqual([null]);
  expect(regex("b", "(a)?b", "g", "$1").replacementOutput).toBe("");
  expect(
    regex("b", "(?<optional>a)?b", "g", "$<optional>").replacementOutput,
  ).toBe("");
  expect(regex("x", "(?<x>x)", "g", "$<missing").replacementOutput).toBe(
    "$<missing",
  );
});
it.each(["g", "", "y", "gy", "gu"])(
  "follows native replacement semantics for flags %s",
  (flags) => {
    for (const [input, pattern] of [
      ["abab", "(?<letter>a)(b)?"],
      ["😀x", "(?=.)"],
      ["aa", "a"],
      ["abc", "(a)(b)"],
    ]) {
      for (const replacement of [
        "$1|$2|$3|$10|$01|$0|$99",
        "$<letter>|$<missing>|$$|$&",
        "$`-$'",
        "<b>",
      ]) {
        expect(
          regex(input ?? "", pattern ?? "", flags, replacement)
            .replacementOutput,
        ).toBe((input ?? "").replace(new RegExp(pattern, flags), replacement));
      }
    }
  },
);
it("advances zero-length matches by Unicode codepoint and handles sticky", () => {
  expect(regex("😀x", "(?:)", "gu").matches.map((x) => x.index)).toEqual([
    0, 2, 3,
  ]);
  expect(regex("ba", "a", "y").summary.matchCount).toBe(0);
  expect(regex("a a", "a", "gy").summary.matchCount).toBe(1);
});
it("exports full reports beyond the UI match and text preview", () => {
  const r = regex("a".repeat(6000), "a", "g", "b");
  expect(r.matches).toHaveLength(200);
  expect(r.summary.matchCount).toBe(6000);
  expect(r.matchesTsv.split("\n")).toHaveLength(6001);
  expect(r.replacementOutput).toBe("b".repeat(6000));
  expect(r.matchesTruncated).toBe(true);
  expect(r.previewTruncated).toBe(true);
});
it("rejects invalid patterns/flags and keeps blank patterns idle", () => {
  expect(() => regex("x", "(")).toThrow("invalid_pattern");
  expect(() => regex("x", "x", "x")).toThrow("invalid_options");
  expect(regex("abc", " ", "g", "x").replacementOutput).toBe("abc");
});
it("keeps complete unified output beyond visible rows", () => {
  const r = diff(
    "",
    Array.from({ length: 1100 }, (_, i) => `line-${i}`).join("\n"),
  );
  expect(r.rows).toHaveLength(1000);
  expect(r.rowsTruncated).toBe(true);
  expect(r.unifiedText).toContain("+ line-1099");
});
it("applies i/m/s and reports UTF16 positions", () => {
  expect(regex("A\nx\nb", "^a.*b$", "gims").summary.matchCount).toBe(1);
  expect(regex("😀a", "a").matches[0]?.index).toBe(2);
});
it("preserves special named group keys in matching and replacement", () => {
  expect(
    regex("x", "(?<__proto__>x)", "g", "$<__proto__>").replacementOutput,
  ).toBe("x");
  expect(
    Object.keys(regex("x", "(?<__proto__>x)").matches[0]?.namedGroups ?? {}),
  ).toEqual(["__proto__"]);
});
it("locates changed rows beyond the normal preview when unchanged rows are hidden", () => {
  const original = "same\n".repeat(1500);
  const result = diff(original, `${original}change`, { hideUnchanged: true });
  expect(result.rows.every((r) => r.kind !== "equal")).toBe(true);
  expect(result.rows.at(-1)?.modified.text).toBe("change");
  expect(result.unifiedText).toContain("  same");
});
it("bounds long diff-line previews while preserving full export", () => {
  const original = "x".repeat(100000);
  const result = diff(original, original);
  expect(result.rows[0]?.original.text).toHaveLength(5000);
  expect(result.rowsTruncated).toBe(true);
  expect(result.unifiedText).toBe(`  ${original}`);
});
it("rejects invalid types, UTF8 limits and excessive line counts", () => {
  expect(() => diff("x\n".repeat(200001), "")).toThrow("too_large");
  expect(() => regex("中".repeat(5600000), ".")).toThrow("too_large");
  expect(() => regex("\ud800", ".")).toThrow("invalid_input");
});
it("bounds prefix/suffix replacement expansion before constructing an unbounded string", () => {
  expect(() => regex("a".repeat(20000), "a", "g", "$'")).toThrow("too_large");
});
it("offers lossless JSON export when native non-Unicode replacement splits surrogate pairs", () => {
  const result = regex("😀", "(?=.)", "g", "-");
  expect(result.replacementJson).not.toBeNull();
  expect(JSON.parse(result.replacementJson ?? "null")).toBe(
    "😀".replace(/(?=.)/g, "-"),
  );
  expect(regex("😀", "(?=.)", "gu", "-").replacementJson).toBeNull();
});
it("never splits a valid surrogate pair just to fit the visual preview", () => {
  const input = `${"x".repeat(4999)}😀`;
  const result = diff(input, input);
  expect(result.rows[0]?.original.text).toBe("x".repeat(4999));
  expect(
    regex(input, "z")
      .segments.map((s) => s.text)
      .join(""),
  ).toBe("x".repeat(4999));
});

it("accounts for surrogate halves that arrive across result chunks", () => {
  expect(regex("😀", "(?=.)", "g", "$`").replacementOutput).toHaveLength(3);
});

it("covers text boundary helpers and invalid diff options", () => {
  expect(splitLines("")).toEqual([]);
  expect(splitLines("a\r\nb\rc")).toEqual(["a", "b", "c"]);
  expect(clipText("😀x", 1)).toBe("");
  expect(clipText("😀x", 2)).toBe("😀");
  expect(normalizeFlags("mig")).toBe("gim");
  expect(() => normalizeFlags("z")).toThrow("invalid_options");
  expect(() => assertText(42 as never)).toThrow("invalid_input");
  expect(() =>
    analyzeText({
      kind: "diff",
      original: "a",
      modified: "b",
      ignoreCase: "yes" as never,
    }),
  ).toThrow("invalid_options");
});

it("uses default regex options when omitted", () => {
  const result = analyzeText({ kind: "regex", input: "a a", pattern: "a" });
  expect(result.kind === "regex" ? result.flags : "").toBe("g");
});

it("maps non-Error native RegExp failures to invalid patterns", () => {
  const NativeRegExp = globalThis.RegExp;
  function ThrowingRegExp() {
    throw "native failure";
  }
  Object.defineProperty(globalThis, "RegExp", {
    configurable: true,
    value: ThrowingRegExp,
  });
  try {
    expect(() =>
      analyzeText({ kind: "regex", input: "x", pattern: "(" }),
    ).toThrow("invalid_pattern");
  } finally {
    Object.defineProperty(globalThis, "RegExp", {
      configurable: true,
      value: NativeRegExp,
    });
  }
});
