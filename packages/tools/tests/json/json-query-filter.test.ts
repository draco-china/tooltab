import { JSONPath } from "jsonpath-plus";
import { afterEach, expect, it, vi } from "vitest";
import { createFilterEvaluator } from "../../src/json/filter";

afterEach(() => vi.unstubAllGlobals());
const query = (path: string, json: object) =>
  JSONPath({
    path,
    json,
    eval: createFilterEvaluator(),
    resultType: "value",
    wrap: true,
  });
it("keeps comparisons, logical filters, regex and dynamic last-index scripts without code generation", () => {
  vi.stubGlobal("eval", () => {
    throw Error("eval forbidden");
  });
  vi.stubGlobal("Function", () => {
    throw Error("Function forbidden");
  });
  expect(
    query('$[?(@.price < 10 && @.title.includes("x"))].title', [
      { price: 2, title: "x" },
      { price: 20, title: "x" },
    ]),
  ).toEqual(["x"]);
  expect(query("$[(@.length-1)]", [1, 2, 3])).toEqual([3]);
  expect(
    query("$[?(/x/i.test(@.title))].title", [{ title: "X" }, { title: "y" }]),
  ).toEqual(["X"]);
});
it("blocks arbitrary methods, inherited objects, bound constructor chains and allocating calls", () => {
  for (const expression of [
    '"x".repeat(1e12)',
    '"x".padStart(1e12)',
    '[].constructor.constructor("return globalThis")()',
    '[].map.constructor("return globalThis")()',
    "[].map.bind(null)",
    "@.toString()",
    "@.x=1",
  ])
    expect(() => query(`$[?(${expression})]`, [{ x: 1 }])).toThrow();
  expect(query("$[?(@.__proto__)]", [{ x: 1 }])).toEqual([]);
});
it("reads own prototype-looking data without treating it as executable and bounds join allocation", () => {
  expect(
    query('$[?(@.constructor === "sample")]', [
      JSON.parse('{"constructor":"sample"}'),
    ]),
  ).toHaveLength(1);
  const evaluate = createFilterEvaluator();
  expect(() =>
    evaluate("_$_v.join(_$_separator)", {
      _$_v: Array(100).fill("x"),
      _$_separator: "a".repeat(200000),
    }),
  ).toThrow("too_large");
});

it("evaluates the bounded string, array, regex, property, and unary surface", () => {
  const evaluate = createFilterEvaluator();
  expect(evaluate("obj[key]", { obj: { x: 4 }, key: "x" })).toBe(4);
  expect(evaluate("text.includes('x')", { text: "text" })).toBe(true);
  for (const expression of [
    "text.startsWith('t')",
    "text.endsWith('t')",
    "text.indexOf('e')",
    "text.lastIndexOf('t')",
    "text.charAt(0)",
    "text.charCodeAt(0)",
    "text.codePointAt(0)",
    "text.slice(1)",
    "text.substring(1)",
    "text.toLowerCase()",
    "text.toUpperCase()",
    "text.trim()",
    "text.trimStart()",
    "text.trimEnd()",
    "text.normalize()",
  ])
    expect(() => evaluate(expression, { text: " text " })).not.toThrow();
  expect(evaluate("/x/.exec(text)[0]", { text: "x" })).toBe("x");
  expect(evaluate("/x/.test(text)", { text: "x" })).toBe(true);
  expect(evaluate("arr.includes(2)", { arr: [1, 2] })).toBe(true);
  expect(evaluate("arr.indexOf(2)", { arr: [1, 2] })).toBe(1);
  expect(evaluate("arr.lastIndexOf(2)", { arr: [1, 2, 2] })).toBe(2);
  expect(evaluate("arr.slice(1)", { arr: [1, 2] })).toEqual([2]);
  expect(evaluate("arr.at(0)", { arr: [1, 2] })).toBe(1);
  expect(evaluate("arr.join('-')", { arr: [1, "x", true, null] })).toBe(
    "1-x-true-",
  );
  expect(evaluate("!flag", { flag: false })).toBe(true);
  expect(evaluate("typeof text", { text: "x" })).toBe("string");
  expect(evaluate("void text", { text: "x" })).toBeUndefined();
  expect(evaluate("+number", { number: 2 })).toBe(2);
  expect(evaluate("-number", { number: 2 })).toBe(-2);
  expect(evaluate("~number", { number: 2 })).toBe(-3);
  expect(evaluate("flag ? 1 : 2", { flag: true })).toBe(1);
});

it("covers primitive comparison, logical, arithmetic, and compound operators", () => {
  const evaluate = createFilterEvaluator();
  for (const [operator, expected] of [
    ["===", false],
    ["!==", true],
    ["==", false],
    ["!=", true],
    ["<", true],
    ["<=", true],
    [">", false],
    [">=", false],
  ] as const)
    expect(evaluate(`a ${operator} b`, { a: 1, b: 2 })).toBe(expected);
  expect(evaluate("false && missing", {})).toBe(false);
  expect(evaluate("true || missing", {})).toBe(true);
  expect(evaluate("null ?? value", { value: 3 })).toBe(3);
  for (const operator of [
    "+",
    "-",
    "*",
    "/",
    "%",
    "**",
    "&",
    "|",
    "^",
    "<<",
    ">>",
    ">>>",
  ])
    expect(() => evaluate(`a ${operator} b`, { a: 6, b: 2 })).not.toThrow();
  expect(evaluate("1; 2", {})).toBe(2);
});

it("rejects unsafe members, invalid calls, operands, and unary forms", () => {
  const evaluate = createFilterEvaluator();
  for (const expression of [
    "missing",
    "obj.x",
    "obj.x()",
    "obj[key]",
    "obj.fn",
    "text.repeat(2)",
    "text.includes(obj)",
    "arr.map(1)",
    "arr.includes({})",
    "arr.join({})",
    "-text",
    "~text",
    "+big",
    "a < obj",
    "a in b",
  ])
    expect(() =>
      evaluate(expression, {
        obj: null,
        key: {},
        fn: () => 1,
        text: "x",
        arr: [1],
        big: 1n,
        a: 1,
        b: 2,
      }),
    ).toThrow();
  expect(() => evaluate("obj.fn", { obj: { fn: () => 1 } })).toThrow();
  expect(() => evaluate("/x/.test(1)", {})).toThrow();
  expect(() => evaluate("text.includes({})", { text: "x" })).toThrow();
  expect(evaluate("flag ? 1 : 2", { flag: false })).toBe(2);
  expect(evaluate("[1, 2]", {})).toEqual([1, 2]);
  expect(() => evaluate("arr.join(1)", { arr: [1] })).toThrow();
  expect(() => evaluate("arr.slice({})", { arr: [1] })).toThrow();
});

it("rejects object arguments resolved from context without invoking coercion", () => {
  const evaluate = createFilterEvaluator();
  expect(() => evaluate("arr.slice(value)", { arr: [1], value: {} })).toThrow(
    expect.objectContaining({ code: "invalid_query" }),
  );
});

it("enforces cumulative allocation and step budgets across a filter session", () => {
  const allocate = createFilterEvaluator();
  const text = "x".repeat(16 * 1024 * 1024);
  for (let index = 0; index < 8; index++)
    expect(allocate("text.slice()", { text })).toBe(text);
  expect(() => allocate("text.slice()", { text })).toThrow(
    expect.objectContaining({ code: "too_large" }),
  );
  const step = createFilterEvaluator();
  for (let index = 0; index < 2_000_000; index++) step("1", {});
  expect(() => step("1", {})).toThrow(
    expect.objectContaining({ code: "too_large" }),
  );
}, 30000);

it("handles primitive and unary context boundaries", () => {
  const evaluate = createFilterEvaluator();
  expect(evaluate("arr.join()", { arr: [1, 2] })).toBe("1,2");
  expect(() => evaluate("+value", { value: "1" })).toThrow(
    expect.objectContaining({ code: "invalid_query" }),
  );
  expect(evaluate("-value", { value: 9007199254740993n })).toBe(
    -9007199254740993n,
  );
  expect(evaluate("a || b", { a: false, b: 2 })).toBe(2);
  expect(evaluate("a == b", { a: {}, b: {} })).toBe(false);
  expect(() => evaluate("a".repeat(65537), {})).toThrow(
    expect.objectContaining({ code: "too_large" }),
  );
});
