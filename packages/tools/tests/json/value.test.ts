import { describe, expect, it, vi } from "vitest";
import {
  MAX_QUERY_INPUT,
  formatQueryValue,
  parseNumber,
  parseQueryJson,
  type QueryError,
  queryArithmetic,
} from "../../src/json/value";

function expectCode(run: () => unknown, code: QueryError["code"]) {
  expect(run).toThrow(expect.objectContaining({ code }));
}

describe("query JSON values", () => {
  it("preserves integer precision and negative zero", () => {
    expect(parseNumber("9007199254740993")).toBe(9007199254740993n);
    expect(Object.is(parseNumber("-0"), -0)).toBe(true);
    expect(parseQueryJson('{"id":9007199254740993,"n":-0}')).toEqual({
      id: 9007199254740993n,
      n: -0,
    });
  });

  it("uses the YAML fallback when JSON reviver source is unavailable", () => {
    const value = parseQueryJson('{"id":9007199254740993,"id":2}');
    expect(value).toEqual({ id: 2 });
    expect(Object.getPrototypeOf(value as object)).toBe(null);
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("classifies parse and precision failures", () => {
    expectCode(() => parseNumber("9007199254740993.1"), "precision_loss");
    expectCode(() => parseQueryJson("{"), "invalid_json");
    expectCode(
      () => parseQueryJson("[".repeat(130) + "]".repeat(130)),
      "too_deep",
    );
  });

  it("formats exact values and rejects lossy or unsupported ones", () => {
    expect(formatQueryValue({ id: 9007199254740993n, zero: -0 })).toEqual({
      output: '{\n  "id": 9007199254740993,\n  "zero": -0\n}',
      bytes: 42,
    });
    expectCode(() => formatQueryValue(Infinity), "precision_loss");
    expectCode(() => formatQueryValue(() => undefined), "invalid_query");
  });

  it("evaluates guarded arithmetic", () => {
    expect(queryArithmetic("+", 1n, 2)).toBe(3n);
    expectCode(() => queryArithmetic("/", 5n, 2n), "precision_loss");
    expect(queryArithmetic("+", "a", 2n)).toBe("a2");
    expectCode(() => queryArithmetic("**", 2n, 2048n), "too_large");
  });

  it.each([
    ["+", 7, 3, 10],
    ["-", 7, 3, 4],
    ["*", 7, 3, 21],
    ["/", 7, 2, 3.5],
    ["%", 7, 3, 1],
    ["**", 2, 3, 8],
    ["&", 7, 3, 3],
    ["|", 4, 3, 7],
    ["^", 7, 3, 4],
    ["<<", 3, 2, 12],
    [">>", 12, 2, 3],
    [">>>", -1, 1, 2147483647],
  ])("evaluates number %s", (op, a, b, expected) => {
    expect(queryArithmetic(op, a, b)).toBe(expected);
  });

  it.each([
    ["+", 7n, 3n, 10n],
    ["-", 7n, 3n, 4n],
    ["*", 7n, 3n, 21n],
    ["/", 8n, 2n, 4n],
    ["%", 7n, 3n, 1n],
    ["**", 2n, 3n, 8n],
    ["&", 7n, 3n, 3n],
    ["|", 4n, 3n, 7n],
    ["^", 7n, 3n, 4n],
    ["<<", 3n, 2n, 12n],
    [">>", 12n, 2n, 3n],
  ])("evaluates bigint %s", (op, a, b, expected) => {
    expect(queryArithmetic(op, a, b)).toBe(expected);
  });
});

describe("query value limits and arithmetic errors", () => {
  it.each([
    ["+", {}, "x", "invalid_query"],
    ["+", "x", null, "invalid_query"],
    ["-", "x", 1, "invalid_query"],
    ["-", 1, null, "invalid_query"],
    ["+", 0.5, 1n, "precision_loss"],
    ["+", 1n, 0.5, "precision_loss"],
    ["+", Number.MAX_SAFE_INTEGER, 2, "precision_loss"],
    ["**", 2, 1025, "too_large"],
    ["**", 2n, -1n, "too_large"],
    ["<<", 2n, 1025n, "too_large"],
    ["/", 2n, 0n, "precision_loss"],
    ["?", 1, 2, "invalid_query"],
    ["?", 1n, 2n, "invalid_query"],
  ] as const)("rejects %s on %s and %s", (op, a, b, code) => {
    expectCode(() => queryArithmetic(op, a, b), code);
  });

  it("bounds string and bigint computation before allocation", () => {
    expect(queryArithmetic("+", true, "x")).toBe("truex");
    expect(queryArithmetic("+", 1, 2n)).toBe(3n);
    expectCode(
      () => queryArithmetic("+", "x".repeat(16 * 1024 * 1024), "y"),
      "too_large",
    );
    expectCode(
      () => queryArithmetic("+", BigInt("1".repeat(65537)), 1n),
      "too_large",
    );
    expectCode(
      () => queryArithmetic("**", BigInt("1".repeat(100)), 1000n),
      "too_large",
    );
    expect(() => queryArithmetic("%", 1n, 0n)).toThrow(RangeError);
  });

  it("formats primitive, array, empty and undefined roots", () => {
    expect(formatQueryValue(undefined).output).toBe("null");
    expect(formatQueryValue([null, true, "x", 1.5]).output).toBe(
      '[\n  null,\n  true,\n  "x",\n  1.5\n]',
    );
    expect(formatQueryValue({}).output).toBe("{}");
    expect(formatQueryValue([]).output).toBe("[]");
    expectCode(
      () => formatQueryValue(Number.MAX_SAFE_INTEGER + 1),
      "precision_loss",
    );
    expectCode(() => formatQueryValue(Symbol()), "invalid_query");
    const circular: unknown[] = [];
    circular.push(circular);
    expectCode(() => formatQueryValue(circular), "too_deep");
  });
});

describe("precise parsing across runtime capabilities", () => {
  it("preserves unsafe integer-valued decimal and exponent inputs", () => {
    expect(parseNumber("9007199254740993.00")).toBe(9007199254740993n);
    expect(parseNumber("9007199254740993e2")).toBe(900719925474099300n);
    for (const raw of ["bad", "9007199254740993.5", "1e-9999"]) {
      expectCode(() => parseNumber(raw), "precision_loss");
    }
    for (const raw of ["1e999999999999999999", "1e33554433", "99e33554432"]) {
      expectCode(() => parseNumber(raw), "too_large");
    }
    expectCode(() => parseQueryJson("9007199254740993.5"), "precision_loss");
  });

  it("checks input characters and encoded byte limits", () => {
    expectCode(
      () => parseQueryJson(" ".repeat(MAX_QUERY_INPUT + 1)),
      "too_large",
    );
    expectCode(
      () => parseQueryJson(`"${"中".repeat(Math.ceil(MAX_QUERY_INPUT / 3))}"`),
      "too_large",
    );
    expectCode(() => parseQueryJson(`[${"0,".repeat(999999)}0]`), "too_large");
  });

  it("uses real YAML parsing when the native reviver has no source context", () => {
    const nativeParse = JSON.parse;
    const spy = vi.spyOn(JSON, "parse").mockImplementation((source, reviver) =>
      nativeParse(
        source,
        reviver
          ? function (key, value) {
              return reviver.call(this, key, value);
            }
          : undefined,
      ),
    );
    try {
      const value = parseQueryJson(
        '{"n":9007199254740993,"n":2,"big":9007199254740993,"list":[null,true,"x",1.5],"__proto__":1}',
      );
      expect(value).toEqual({
        n: 2,
        big: 9007199254740993n,
        list: [null, true, "x", 1.5],
        ["__proto__"]: 1,
      });
      expect(Object.getPrototypeOf(value as object)).toBe(null);
      expectCode(
        () => parseQueryJson(`${"[".repeat(130)}1${"]".repeat(130)}`),
        "too_deep",
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe("formatting resource limits", () => {
  it("rejects excessive output during its size pass", () => {
    const chunk = "x".repeat(1024 * 1024);
    expectCode(() => formatQueryValue(Array(129).fill(chunk)), "too_large");
  });

  it("rejects excessive traversal without requiring a giant serialized result", () => {
    const chunk = Array(1000).fill(null);
    expectCode(() => formatQueryValue(Array(2000).fill(chunk)), "too_large");
  });

  it.each([Infinity, () => 1, Symbol("late"), undefined])(
    "rejects values changed by accessors during serialization",
    (later) => {
      let reads = 0;
      const value = Object.defineProperty({}, "value", {
        enumerable: true,
        get: () => (++reads === 1 ? 0 : later),
      });
      expectCode(
        () => formatQueryValue(value),
        later === Infinity ? "precision_loss" : "invalid_query",
      );
    },
  );
});

describe("custom JSON serialization boundaries", () => {
  it.each([undefined, Infinity, Symbol("serialized"), () => 1])(
    "rejects unsupported toJSON output",
    (serialized) => {
      const input = Object.defineProperty({}, "toJSON", {
        value: () => serialized,
      });
      expectCode(
        () => formatQueryValue(input),
        serialized === Infinity ? "precision_loss" : "invalid_query",
      );
    },
  );

  it("enforces the final byte budget when toJSON expands a small object", () => {
    const expanded = "x".repeat(128 * 1024 * 1024);
    const input = Object.defineProperty({}, "toJSON", {
      value: () => expanded,
    });
    expectCode(() => formatQueryValue(input), "too_large");
  });
});

it("rejects an unsafe integer introduced by toJSON after measurement", () => {
  const input = Object.defineProperty({}, "toJSON", {
    value: () => Number.MAX_SAFE_INTEGER + 1,
  });
  expectCode(() => formatQueryValue(input), "precision_loss");
});
