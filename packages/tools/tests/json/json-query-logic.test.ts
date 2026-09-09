import { expect, it, vi } from "vitest";
import { executeQuery } from "../../src/json/query";
import { parseQueryJson } from "../../src/json/value";

it("returns exact values, complete paths, and root scalars", () => {
  const result = executeQuery({
    kind: "jsonpath",
    input: '{"items":[{"n":9007199254740993},{"n":2}]}',
    query: "$.items[?(@.n > 9007199254740992)].n",
  });
  expect(result.output).toBe("[\n  9007199254740993\n]");
  expect(result.paths).toBe("[\n  \"$['items'][0]['n']\"\n]");
  expect(
    executeQuery({ kind: "jmespath", input: "42", query: "@" }).output,
  ).toBe("42");
  expect(
    executeQuery({ kind: "jsonpath", input: "42", query: "$" }).output,
  ).toBe("[\n  42\n]");
});
it("retains primitive loose equality but rejects code", () => {
  expect(
    executeQuery({
      kind: "jsonpath",
      input: '[{"n":"10"}]',
      query: "$[?(@.n == 10)]",
    }).count,
  ).toBe(1);
  expect(() =>
    executeQuery({
      kind: "jsonpath",
      input: "[{}]",
      query: '$[?(@.constructor.constructor("return process")())]',
    }),
  ).toThrow();
});
it.each(["null", "false", "0", '""'])(
  "accepts JSON scalar root %s",
  (input) => {
    const result = executeQuery({ kind: "jsonpath", input, query: "$" });
    expect(JSON.parse(result.output)).toEqual([JSON.parse(input)]);
    expect(result.count).toBe(1);
  },
);
it("preserves standard numeric sorting and reports precision loss", () => {
  expect(
    executeQuery({ kind: "jmespath", input: "[2,10,1]", query: "sort(@)" })
      .output,
  ).toBe("[\n  1,\n  2,\n  10\n]");
  expect(() =>
    executeQuery({
      kind: "jmespath",
      input: "{}",
      query: 'to_number(`"0.123456789012345678901"`)',
    }),
  ).toThrow();
});

it("rejects empty and oversized queries before parsing input", () => {
  expect(() =>
    executeQuery({ kind: "jsonpath", input: "{", query: " " }),
  ).toThrow("invalid_query");
  expect(() =>
    executeQuery({ kind: "jmespath", input: "{", query: "x".repeat(65537) }),
  ).toThrow("invalid_query");
});

it.each([
  '{"n":1,"middle":true,"n":9007199254740993,"nested":{"x":9007199254740995,"x":2},"__proto__":{"safe":1},"__proto__":{"safe":2}}',
  '{"n":0.12345678901234567890123456789,"middle":true,"n":9007199254740993,"nested":{"x":1e999999999,"x":2},"__proto__":{"safe":1},"__proto__":{"safe":2}}',
  `{"n":${"[".repeat(160)}0${"]".repeat(160)},"middle":true,"n":9007199254740993,"nested":{"x":1,"x":2},"__proto__":{"safe":1},"__proto__":{"safe":2}}`,
])(
  "preserves JSON last-key-wins and ignores discarded values across reviver runtimes: %s",
  (input) => {
    const nativeParse = JSON.parse;
    const check = () => {
      const result = parseQueryJson(input) as Record<string, unknown>;
      expect(Object.keys(result)).toEqual([
        "n",
        "middle",
        "nested",
        "__proto__",
      ]);
      expect(result.n).toBe(9007199254740993n);
      expect(result.nested).toEqual({ x: 2 });
      expect(
        Object.getOwnPropertyDescriptor(result, "__proto__")?.value,
      ).toEqual({ safe: 2 });
      expect(Object.getPrototypeOf(result)).toBeNull();
      expect(Object.hasOwn(Object.prototype, "safe")).toBe(false);
      expect(() => parseQueryJson('{"n":1,}')).toThrow(
        expect.objectContaining({ code: "invalid_json" }),
      );
    };
    check();
    const platform = vi
      .spyOn(JSON, "parse")
      .mockImplementation((text, reviver) =>
        nativeParse(
          text,
          reviver
            ? function (this: unknown, key: string, value: unknown) {
                return reviver.call(this, key, value);
              }
            : undefined,
        ),
      );
    try {
      check();
    } finally {
      platform.mockRestore();
    }
  },
);

it.each(
  [70, 128, 129].flatMap((depth) =>
    ["object", "array", "mixed"].map((kind) => ({ depth, kind })),
  ),
)(
  "uses JSON value depth on both reviver runtimes at $depth $kind levels",
  ({ depth, kind }) => {
    const containers = Array.from({ length: depth }, (_, index) =>
      kind === "array" || (kind === "mixed" && index % 2 === 0)
        ? ["[", "]", "item"]
        : ['{"a":', "}", "a"],
    );
    const input = `${containers.map((value) => value[0]).join("")}1${containers
      .map((value) => value[1])
      .reverse()
      .join("")}`;
    const nativeParse = JSON.parse;
    const check = () => {
      if (depth > 128)
        expect(() => parseQueryJson(input)).toThrow(
          expect.objectContaining({ code: "too_deep" }),
        );
      else {
        let result = parseQueryJson(input);
        for (let index = 0; index < depth; index++)
          result = Array.isArray(result)
            ? result[0]
            : (result as Record<string, unknown>).a;
        expect(result).toBe(1);
      }
    };
    check();
    const platform = vi
      .spyOn(JSON, "parse")
      .mockImplementation((text, reviver) =>
        nativeParse(
          text,
          reviver
            ? function (this: unknown, key: string, value: unknown) {
                return reviver.call(this, key, value);
              }
            : undefined,
        ),
      );
    try {
      check();
    } finally {
      platform.mockRestore();
    }
  },
);

it("rejects empty and oversized queries before parsing input", () => {
  for (const query of [" ", "a".repeat(65537)]) {
    expect(() =>
      executeQuery({ kind: "jsonpath", input: "invalid", query }),
    ).toThrow(expect.objectContaining({ code: "invalid_query" }));
  }
});

it("bounds the combined value and path output using real repeated ancestors", () => {
  let data: unknown = "x".repeat(1024 * 1024);
  const key = "k".repeat(512 * 1024);
  for (let depth = 0; depth < 16; depth++) data = { [key]: data };
  const input = JSON.stringify(data);
  expect(input.length).toBeLessThan(32 * 1024 * 1024);
  expect(() =>
    executeQuery({ kind: "jsonpath", input, query: "$..*" }),
  ).toThrow(expect.objectContaining({ code: "too_large" }));
}, 30000);

it("returns empty counts for missing JMES fields and JSONPath scalars", () => {
  expect(
    executeQuery({ kind: "jmespath", input: "{}", query: "missing" }).count,
  ).toBe(0);
  for (const input of ["null", "false", "0", '""']) {
    expect(
      executeQuery({ kind: "jsonpath", input, query: "$.missing" }).count,
    ).toBe(0);
  }
});
