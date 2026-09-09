import { expect, it } from "vitest";
import { evaluateJmes } from "../../src/json/jmes";
import { formatQueryValue, parseQueryJson } from "../../src/json/value";

it("queries standard projections and preserves exact numeric literals", () => {
  const data = parseQueryJson(
    '{"items":[{"n":9007199254740993,"name":"a"},{"n":2,"name":"b"}]}',
  );
  expect(evaluateJmes(data, "items[?n > `9007199254740992`].name")).toEqual([
    "a",
  ]);
  expect(formatQueryValue(evaluateJmes(data, "items[0].n")).output).toBe(
    "9007199254740993",
  );
  expect(evaluateJmes(data, "sort(items[].n)")).toEqual([2, 9007199254740993n]);
});
it("preserves own prototype keys and excludes inherited properties", () => {
  const data = parseQueryJson('{"__proto__":{"x":1},"constructor":2}');
  expect(evaluateJmes(data, '"__proto__".x')).toBe(1);
  expect(evaluateJmes(data, "toString")).toBe(null);
  expect(
    formatQueryValue(
      evaluateJmes(data, '{__proto__: "__proto__", constructor: constructor}'),
    ).output,
  ).toContain('"__proto__"');
  expect(
    formatQueryValue(evaluateJmes(data, 'merge(@, `{"a":1}`)')).output,
  ).toContain('"__proto__"');
});
it("bounds allocating extensions and keeps BigInt expression functions exact", () => {
  const data = parseQueryJson(
    '[{"n":9007199254740993},{"n":9007199254740992}]',
  );
  expect(evaluateJmes(data, "sort_by(@, &n)[0].n")).toBe(9007199254740992n);
  expect(evaluateJmes(data, "sum(@[].n)")).toBe(18014398509481985n);
  expect(() => evaluateJmes(data, "pad_left('x', `1000000000000`)")).toThrow();
  expect(() =>
    evaluateJmes(data, "replace('x', 'x', 'y', `1000000000000`)"),
  ).toThrow();
  expect(
    evaluateJmes(parseQueryJson('[{"k":"__proto__"}]'), "group_by(@,&k)"),
  ).toHaveProperty("__proto__");
});

it.each([
  ["(-a) // b", -4503599627370497n],
  ["a // b", 4503599627370496n],
  ["a - a", 0n],
  ["+a", 9007199254740993n],
  ["-a", -9007199254740993n],
  ["abs(-a)", 9007199254740993n],
  ["abs(a)", 9007199254740993n],
  ["ceil(a)", 9007199254740993n],
  ["floor(a)", 9007199254740993n],
] as const)("keeps bigint arithmetic exact: %s", (expression, expected) => {
  expect(evaluateJmes({ a: 9007199254740993n, b: 2n }, expression)).toBe(
    expected,
  );
});

it.each([
  ["sum(@)", 0],
  ["avg(@)", null],
  ["min(@)", null],
  ["max(@)", null],
  ["sort(@)", []],
] as const)("defines empty numeric aggregate %s", (expression, expected) => {
  expect(evaluateJmes([], expression)).toEqual(expected);
});

it.each([
  ["min(@)", -9007199254740993n],
  ["max(@)", 9007199254740993n],
  ["sum(@)", 0n],
  ["avg(@)", 0n],
  ["sort(@)", [-9007199254740993n, 0, 9007199254740993n, 9007199254740993n]],
] as const)("aggregates mixed exact integers: %s", (expression, expected) => {
  const values = [9007199254740993n, -9007199254740993n, 9007199254740993n, 0];
  const input =
    expression === "sum(@)" || expression === "avg(@)"
      ? [9007199254740993n, -9007199254740993n]
      : values;
  expect(evaluateJmes(input, expression)).toEqual(expected);
  expect(values).toEqual([
    9007199254740993n,
    -9007199254740993n,
    9007199254740993n,
    0,
  ]);
});

it.each([
  [1n, 1, true],
  [1, 1n, true],
  [2n, 1, false],
  [1, 2n, false],
  [1n, "1", false],
  ["1", 1n, false],
  [1n, 1.5, false],
] as const)(
  "compares bigint and %s without lossy conversion",
  (a, b, equal) => {
    expect(evaluateJmes({ a, b }, "a == b")).toBe(equal);
    expect(evaluateJmes({ a, b }, "a != b")).toBe(!equal);
  },
);

it.each([
  ["a > b", true],
  ["a >= b", true],
  ["a < b", false],
  ["a <= b", false],
] as const)("orders bigint exactly: %s", (expression, expected) => {
  expect(
    evaluateJmes({ a: 9007199254740993n, b: 9007199254740992n }, expression),
  ).toBe(expected);
  expect(evaluateJmes({ a: 1n, b: "1" }, expression)).toBe(null);
});

it.each([
  ["to_number('')", null],
  ["to_number('no-number')", null],
  ["to_number(`null`)", null],
  ["to_number(' 42 ')", 42],
  ["to_number('9007199254740993')", 9007199254740993n],
  ["to_string('unchanged')", "unchanged"],
  ["to_string(`9007199254740993`)", "9007199254740993"],
] as const)("converts values precisely: %s", (expression, expected) => {
  expect(evaluateJmes(null, expression)).toBe(expected);
});

it.each([
  ["a // zero", { a: 9007199254740993n, zero: 0n }],
  ["-a", { a: "not-number" }],
  ["group_by(@,&k)", [{ k: 1 }]],
  ["sort_by(@,&k)", [{ k: 9007199254740993n }, { k: "x" }]],
  ["merge(@)", []],
  ["merge()", {}],
] as const)(
  "rejects invalid numeric/function operands: %s",
  (expression, input) => {
    expect(() => evaluateJmes(input, expression)).toThrow(
      expect.objectContaining({ code: "invalid_query" }),
    );
  },
);

it.each(["sum", "avg", "min", "max", "sort"])(
  "rejects mixed numeric and string inputs in %s without changing the input",
  (name) => {
    const input = parseQueryJson('[9007199254740993,"2"]');
    expect(() => evaluateJmes(input, `${name}(@)`)).toThrow();
    expect(input).toEqual([9007199254740993n, "2"]);
  },
);

it("preserves stable ordering and selects bigint extrema", () => {
  const input = [
    { id: "b", n: 9007199254740994n },
    { id: "a", n: 9007199254740993n },
    { id: "c", n: 9007199254740994n },
  ];
  expect(evaluateJmes(input, "sort_by(@,&n)[].id")).toEqual(["a", "b", "c"]);
  expect(evaluateJmes(input, "min_by(@,&n).id")).toBe("a");
  expect(evaluateJmes(input.slice(0, 2), "max_by(@,&n).id")).toBe("b");
});

it("rejects precision-losing numeric strings and bounded allocating functions", () => {
  expect(() => evaluateJmes(null, "to_number('9007199254740993.5')")).toThrow(
    expect.objectContaining({ code: "precision_loss" }),
  );
  expect(() =>
    evaluateJmes(
      { parts: ["a", "b", "c"], separator: "x".repeat(8 * 1024 * 1024) },
      "join(separator, parts)",
    ),
  ).toThrow(expect.objectContaining({ code: "too_large" }));
  expect(() =>
    evaluateJmes(
      { text: "aa", replacement: "x".repeat(8 * 1024 * 1024 + 1) },
      "replace(text, 'a', replacement)",
    ),
  ).toThrow(expect.objectContaining({ code: "too_large" }));
  expect(evaluateJmes(null, "replace('aaa', 'a', 'xy', `1`)")).toBe("xyaa");
  expect(evaluateJmes(null, "replace('ab', '', '-')")).toBe("a-b");
  expect(evaluateJmes(null, "join('-', `[]`)")).toBe("");
});

it("covers escaped literals, invalid JSON literals, AST precision, and depth", () => {
  expect(() => evaluateJmes(null, "to_string(`not-json`)")).toThrow();
  expect(() => evaluateJmes(null, "9007199254740993")).toThrow();
  expect(() =>
    evaluateJmes(null, `[${"[".repeat(130)}1${"]".repeat(130)}]`),
  ).toThrow(expect.objectContaining({ code: "too_deep" }));
});

it("preserves escaped literals and propagates literal precision failures", () => {
  expect(evaluateJmes({}, "'it\\'s'")).toBe("it's");
  expect(evaluateJmes({}, '`"a\\\\b"`')).toBe("a\\b");
  expect(() => evaluateJmes({}, "`1.1234567890123456789`")).toThrow(
    expect.objectContaining({ code: "precision_loss" }),
  );
});

it("handles ordinary numeric and nullable fields through the patched interpreter", () => {
  expect(evaluateJmes({}, "`5` // `2`")).toBe(2);
  expect(evaluateJmes({ a: null }, "a")).toBeNull();
  expect(evaluateJmes({ a: 1, b: 1 }, "a == b")).toBe(true);
  expect(evaluateJmes([{ n: 2 }, { n: 1 }], "sort_by(@, &n)")).toEqual([
    { n: 1 },
    { n: 2 },
  ]);
  expect(evaluateJmes(2, "to_number(@)")).toBe(2);
});

it("limits interpreter work and resets the budget for a new query", () => {
  const data = Array.from({ length: 1_000_001 }, () => ({ a: 1 }));
  expect(() => evaluateJmes(data, "[?a == `1`].a")).toThrow(
    expect.objectContaining({ code: "too_large" }),
  );
  expect(evaluateJmes({ a: 1 }, "a")).toBe(1);
}, 30000);

it("rejects unterminated raw literals even when the lexer accepts a token", () => {
  for (const expression of ["'unfinished", "'unfinished\\", "`123"]) {
    expect(() => evaluateJmes({}, expression)).toThrow(
      expect.objectContaining({ code: "invalid_query" }),
    );
  }
});

it("preserves nullable extrema and the existing duplicate-key literal fallback", () => {
  expect(evaluateJmes([null], "min_by(@, &`9007199254740993`)")).toBeNull();
  expect(evaluateJmes([null], "max_by(@, &`9007199254740993`)")).toBeNull();
  expect(evaluateJmes({}, '`{"a":1,"a":2}`')).toEqual({ a: 2 });
});
