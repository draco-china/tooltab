import { expect, it } from "vitest";
import {
  convertStructured,
  MAX_STRUCTURED_INPUT,
  StructuredError,
  type StructuredFormat,
} from "../../src/encoding/structured";

const samples = {
  json: '{"name":"ToolTab","items":[1,2],"nested":{"ok":true}}',
  yaml: "name: ToolTab\nitems: [1, 2]\nnested:\n  ok: true",
  toml: 'name = "ToolTab"\nitems = [1,2]\n[nested]\nok = true',
};
it.each([
  ["json", "yaml"],
  ["yaml", "json"],
  ["json", "toml"],
  ["toml", "json"],
  ["yaml", "toml"],
  ["toml", "yaml"],
] as [StructuredFormat, StructuredFormat][])(
  "converts nested %s to%s",
  (from, to) => {
    const result = convertStructured({ from, to, input: samples[from] });
    expect(result.bytes).toBeGreaterThan(0);
    const json =
      to === "json"
        ? result.output
        : convertStructured({ from: to, to: "json", input: result.output })
            .output;
    expect(JSON.parse(json)).toEqual(JSON.parse(samples.json));
  },
);
it("preserves integers aboveIEEE53 and signed64 values", () => {
  const input = '{"id":9223372036854775807}';
  for (const to of ["yaml", "toml"] as const) {
    const output = convertStructured({ from: "json", to, input }).output;
    expect(output).toContain("9223372036854775807");
    expect(
      convertStructured({ from: to, to: "json", input: output }).output,
    ).toContain("9223372036854775807");
  }
});
it.each([
  ["json", "yaml", '{"x":1.234567890123456789}'],
  ["yaml", "json", "x: 1.234567890123456789"],
  ["toml", "json", "x=1.234567890123456789"],
  ["toml", "yaml", "x=1e999"],
  ["yaml", "json", "x: 1e999"],
] as [StructuredFormat, StructuredFormat, string][])(
  "rejects precision loss from%s",
  (from, to, input) => {
    expect(() => convertStructured({ from, to, input })).toThrowError(
      "precision_loss",
    );
  },
);
it("handles date kinds and rejects invalid dates before normalization", () => {
  const result = JSON.parse(
    convertStructured({
      from: "toml",
      to: "json",
      input:
        "d=1979-05-27\nt=07:32:00\nlocal=1979-05-27T07:32:00\noffset=1979-05-27T07:32:00-08:00",
    }).output,
  );
  expect(result.d).toBe("1979-05-27");
  expect(result.t).toBe("07:32:00");
  expect(result.local).toBe("1979-05-27T07:32:00");
  expect(result.offset).toContain("-08:00");
  for (const [from, input] of [
    ["toml", "d=2023-02-30"],
    ["yaml", "d: 2023-02-30"],
  ] as const)
    expect(() => convertStructured({ from, to: "json", input })).toThrow();
});
it("supports explicit nonfinite floats only where representable and rejects TOML null", () => {
  expect(
    convertStructured({ from: "toml", to: "yaml", input: "x=inf\ny=nan" })
      .output,
  ).toContain(".inf");
  expect(() =>
    convertStructured({ from: "toml", to: "json", input: "x=inf" }),
  ).toThrowError(new StructuredError("unsupported_value"));
  expect(() =>
    convertStructured({ from: "json", to: "toml", input: '{"lost":null}' }),
  ).toThrowError(new StructuredError("unsupported_value"));
});
it("rejects custom tags, recursive aliases and bounded expansion", () => {
  for (const input of [
    "x: !unsafe value",
    "x: &x [*x]",
    "a: &a [1,2,3,4,5,6,7,8,9]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c]",
  ])
    expect(() =>
      convertStructured({ from: "yaml", to: "json", input }),
    ).toThrow();
  expect(
    JSON.parse(
      convertStructured({
        from: "yaml",
        to: "json",
        input: "base: &base {x: 2}\ncopy: *base",
      }).output,
    ),
  ).toEqual({ base: { x: 2 }, copy: { x: 2 } });
});
it("retains dangerous-looking object keys without prototype mutation", () => {
  const result = convertStructured({
    from: "json",
    to: "yaml",
    input: '{"__proto__":{"safe":"value"},"constructor":"text"}',
  });
  expect(result.output).toContain("__proto__");
  expect(({} as { safe?: string }).safe).toBeUndefined();
});
it("reports positions and bounds nesting", () => {
  try {
    convertStructured({ from: "yaml", to: "json", input: "a: [1,\n bad" });
  } catch (e) {
    expect((e as StructuredError).line).toBeGreaterThan(0);
  }
  expect(() =>
    convertStructured({
      from: "json",
      to: "yaml",
      input: `${"[".repeat(130)}0${"]".repeat(130)}`,
    }),
  ).toThrow();
});
it("falls back safely when JSON reviver source context is unavailable", () => {
  const native = JSON.parse;
  JSON.parse = ((text: string, reviver?: Parameters<typeof JSON.parse>[1]) =>
    native(
      text,
      reviver
        ? function (key, value) {
            return reviver.call(this, key, value);
          }
        : undefined,
    )) as typeof JSON.parse;
  try {
    expect(
      convertStructured({
        from: "json",
        to: "yaml",
        input: '{"__proto__":{"id":9223372036854775807}}',
      }).output,
    ).toContain("9223372036854775807");
  } finally {
    JSON.parse = native;
  }
});
it("preserves negative zero rather than silently changing its sign", () => {
  expect(
    convertStructured({ from: "yaml", to: "json", input: "x: -0.0" }).output,
  ).toContain("-0");
  expect(
    convertStructured({ from: "json", to: "yaml", input: '{"x":-0}' }).output,
  ).toContain("-0");
});

it("preserves full TOML fractional dates and offsets in nested values", () => {
  const input =
    "dates=[1979-05-27T07:32:00.123456789-08:00,07:32:00.123456789]\n[nested]\nd=1979-05-27 07:32:00.123456789Z";
  for (const to of ["json", "yaml"] as const) {
    const output = convertStructured({ from: "toml", to, input }).output;
    expect(output).toContain("1979-05-27T07:32:00.123456789-08:00");
    expect(output).toContain("07:32:00.123456789");
    expect(output).toContain("1979-05-27T07:32:00.123456789Z");
  }
});

it("covers format validation, empty inputs, surrogate rejection and TOML dates", () => {
  expect(convertStructured({ from: "json", to: "yaml", input: "" })).toEqual({
    output: "",
    bytes: 0,
  });
  expect(() =>
    convertStructured({ from: "json", to: "json", input: "{}" }),
  ).toThrowError("invalid_input");
  expect(() =>
    convertStructured({ from: "xml" as never, to: "json", input: "{}" }),
  ).toThrowError("invalid_input");
  expect(() =>
    convertStructured({ from: "json", to: "yaml", input: "\ud800" }),
  ).toThrowError("invalid_input");
  expect(
    convertStructured({
      from: "yaml",
      to: "toml",
      input: "d: 2024-01-02\n",
    }).output,
  ).toContain("2024-01-02");
});

it("rejects unsupported exact values and preserves parser position errors", () => {
  expect(() =>
    convertStructured({
      from: "json",
      to: "toml",
      input: '{"n":9223372036854775808}',
    }),
  ).toThrowError("unsupported_value");
  expect(() =>
    convertStructured({
      from: "yaml",
      to: "json",
      input: "x: !!binary SGVsbG8=\n",
    }),
  ).toThrowError("unsupported_value");
  expect(() =>
    convertStructured({ from: "toml", to: "json", input: "x = [" }),
  ).toThrowError(StructuredError);
  expect(() =>
    convertStructured({ from: "json", to: "toml", input: "1" }),
  ).toThrowError("unsupported_value");
});

it("covers YAML numeric and date validation paths", () => {
  expect(
    convertStructured({ from: "yaml", to: "json", input: "x: -0" }).output,
  ).toContain("-0");
  expect(() =>
    convertStructured({
      from: "yaml",
      to: "json",
      input: "d: 2024-01-02T07:32:00.1234567Z",
    }),
  ).toThrowError("precision_loss");
});

it("enforces TOML traversal depth", () => {
  const result = convertStructured({
    from: "toml",
    to: "json",
    input: `x = ${"[".repeat(124)}1${"]".repeat(124)}`,
  });
  let value = JSON.parse(result.output).x;
  for (let depth = 0; depth < 124; depth++) {
    expect(Array.isArray(value)).toBe(true);
    expect(value).toHaveLength(1);
    value = value[0];
  }
  expect(value).toBe(1);
  expect(() =>
    convertStructured({
      from: "toml",
      to: "json",
      input: `x = ${"[".repeat(125)}1${"]".repeat(125)}`,
    }),
  ).toThrowError("too_deep");
});

it("rejects input exceeding either character or UTF-8 byte capacity", () => {
  for (const input of [
    " ".repeat(MAX_STRUCTURED_INPUT + 1),
    `"${"界".repeat(Math.ceil(MAX_STRUCTURED_INPUT / 3))}"`,
  ]) {
    expect(() =>
      convertStructured({ from: "json", to: "yaml", input }),
    ).toThrowError(new StructuredError("too_large"));
  }
});

it("limits UTF-8 output after expanding non-ASCII aliases", () => {
  const input = `text: &text ${"界".repeat(1024 * 1024)}\nitems: [${Array(43).fill("*text").join(", ")}]`;
  expect(new TextEncoder().encode(input).length).toBeLessThan(
    MAX_STRUCTURED_INPUT,
  );
  expect(() =>
    convertStructured({ from: "yaml", to: "json", input }),
  ).toThrowError(new StructuredError("too_large"));
}, 30_000);

it("preserves native JSON syntax positions when the engine provides them", () => {
  expect(() =>
    convertStructured({
      from: "json",
      to: "yaml",
      input: '{\n"x": 1\n "y": 2}',
    }),
  ).toThrowError(new StructuredError("invalid_input", 3, 2));
});

it("preserves safe fractional JSON numbers and YAML timestamp instants", () => {
  expect(
    convertStructured({ from: "json", to: "yaml", input: '{"x":1.25}' }).output,
  ).toBe("x: 1.25\n");
  expect(
    JSON.parse(
      convertStructured({
        from: "yaml",
        to: "json",
        input: "date: 2024-01-02T03:04:05.123Z",
      }).output,
    ),
  ).toEqual({ date: "2024-01-02T03:04:05.123Z" });
});

it("enforces YAML visit depth and allows null outside TOML", () => {
  const nested = `${"[".repeat(130)}0${"]".repeat(130)}`;
  expect(() =>
    convertStructured({ from: "yaml", to: "json", input: nested }),
  ).toThrowError("too_deep");
  expect(
    convertStructured({ from: "json", to: "yaml", input: "null" }).output,
  ).toContain("null");
});

it("limits actual normalized node count independently of input bytes", () => {
  expect(() =>
    convertStructured({
      from: "json",
      to: "yaml",
      input: `[${"0,".repeat(999_999)}0]`,
    }),
  ).toThrowError("too_large");
}, 30_000);

it("limits repeated alias string content before serialization", () => {
  const input = `text: &text ${"a".repeat(4 * 1024 * 1024)}\nitems: [${Array(33).fill("*text").join(", ")}]`;
  expect(() =>
    convertStructured({ from: "yaml", to: "json", input }),
  ).toThrowError("too_large");
}, 30_000);

it.each(["2023-02-29", "2024-02-30", "2024-13-01", "2024-00-01", "2024-01-00"])(
  "rejects YAML calendar rollover instead of changing %s",
  (date) => {
    expect(() =>
      convertStructured({ from: "yaml", to: "json", input: `date: ${date}` }),
    ).toThrowError("invalid_input");
  },
);
it("preserves a valid YAML leap day", () => {
  const result = convertStructured({
    from: "yaml",
    to: "json",
    input: "date: 2024-02-29",
  });
  expect(JSON.parse(result.output)).toEqual({
    date: "2024-02-29T00:00:00.000Z",
  });
});

it.each(["2024-2-30", "2023-2-29T03:04:05Z", "2024-0-2"])(
  "rejects calendar rollover with single-digit fields: %s",
  (date) => {
    expect(() =>
      convertStructured({ from: "yaml", to: "json", input: `date: ${date}` }),
    ).toThrowError(new StructuredError("invalid_input"));
  },
);

it.each([
  ["0024-01-02", "0024-01-02T00:00:00.000Z"],
  ["0000-2-29", "0000-02-29T00:00:00.000Z"],
  ["0099-12-31T23:30:00-02:00", "0100-01-01T01:30:00.000Z"],
  ["2024-1-2T03:04:05+02:00", "2024-01-02T01:04:05.000Z"],
])("preserves the actual YAML year and offset: %s", (date, expected) => {
  const result = convertStructured({
    from: "yaml",
    to: "json",
    input: `date: ${date}`,
  });
  expect(JSON.parse(result.output)).toEqual({ date: expected });
});

it.each([
  "2024-01-02T24:00:00Z",
  "2024-01-02T23:60:00Z",
  "2024-01-02T23:59:60Z",
  "2024-01-02T99:99:99Z",
  "2024-01-02T00:00:00+24",
  "2024-01-02T00:00:00-29:00",
  "2024-01-02T00:00:00+01:60",
])("rejects timestamp field rollover: %s", (date) => {
  expect(() =>
    convertStructured({ from: "yaml", to: "json", input: `date: ${date}` }),
  ).toThrowError(new StructuredError("invalid_input"));
});

it.each([
  ["2024-01-02T23:59:59.999Z", "2024-01-02T23:59:59.999Z"],
  ["2024-01-02T00:00:00+00:01", "2024-01-01T23:59:00.000Z"],
  ["2024-01-02T00:00:00+00:29", "2024-01-01T23:31:00.000Z"],
  ["2024-01-02T00:00:00+00:30", "2024-01-01T23:30:00.000Z"],
  ["2024-01-02T00:00:00-00:01", "2024-01-02T00:01:00.000Z"],
  ["0024-01-02T03:04:05.123Z", "0024-01-02T03:04:05.123Z"],
  ["0000-02-29T00:00:00.001Z", "0000-02-29T00:00:00.001Z"],
  ["9999-12-31T23:59:59.999Z", "9999-12-31T23:59:59.999Z"],
  ["2024-01-02 2:03:04 -5", "2024-01-02T07:03:04.000Z"],
  ["2024-01-02t00:00:00+05:30", "2024-01-01T18:30:00.000Z"],
  ["2024-01-02T00:00:00-03:30", "2024-01-02T03:30:00.000Z"],
  ["2024-01-02 2:03:04", "2024-01-02T02:03:04.000Z"],
])("retains valid YAML clock and offset fields: %s", (date, expected) => {
  const result = convertStructured({
    from: "yaml",
    to: "json",
    input: `date: ${date}`,
  });
  expect(JSON.parse(result.output)).toEqual({ date: expected });
});

it("matches ISO timestamp instants for every valid signed minute offset", () => {
  for (const sign of ["+", "-"]) {
    for (let minutes = 0; minutes < 24 * 60; minutes++) {
      const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
      const remainder = String(minutes % 60).padStart(2, "0");
      const timestamp = `2024-02-29T00:00:00.123${sign}${hours}:${remainder}`;
      const result = convertStructured({
        from: "yaml",
        to: "json",
        input: `date: ${timestamp}`,
      });
      expect(JSON.parse(result.output).date, timestamp).toBe(
        new Date(timestamp).toISOString(),
      );
    }
  }
});

it("validates explicit timestamp tags before calendar reconstruction", () => {
  for (const value of ["not-a-date", "2024", "24-1-2", "2024-01-02junk"]) {
    expect(() =>
      convertStructured({
        from: "yaml",
        to: "json",
        input: `date: !!timestamp ${value}`,
      }),
    ).toThrow(StructuredError);
  }
  expect(
    JSON.parse(
      convertStructured({
        from: "yaml",
        to: "json",
        input: "date: !!timestamp 0024-1-2",
      }).output,
    ),
  ).toEqual({ date: "0024-01-02T00:00:00.000Z" });
  expect(
    JSON.parse(
      convertStructured({
        from: "yaml",
        to: "json",
        input: 'date: "not-a-date"',
      }).output,
    ),
  ).toEqual({ date: "not-a-date" });
});

it.each([
  '{"n":1.0000000000000000001,"n":2,"other":3}',
  '{"first":1,"nested":{"a":1,"a":9223372036854775807},"first":2}',
  '{"__proto__":{"n":1},"__proto__":{"n":2},"constructor":3}',
])(
  "preserves native duplicate-key semantics without reviver source: %s",
  (input) => {
    const native = JSON.parse;
    const modern = convertStructured({ input, from: "json", to: "yaml" });
    JSON.parse = ((text: string, reviver?: Parameters<typeof JSON.parse>[1]) =>
      native(
        text,
        reviver
          ? function (key, value) {
              return reviver.call(this, key, value);
            }
          : undefined,
      )) as typeof JSON.parse;
    try {
      expect(convertStructured({ input, from: "json", to: "yaml" })).toEqual(
        modern,
      );
      expect(() =>
        convertStructured({ input: "n: 1\nn: 2", from: "yaml", to: "json" }),
      ).toThrow("invalid_input");
    } finally {
      JSON.parse = native;
    }
  },
);

it.each([
  [
    "yaml",
    "isLosslessNumber: true\nvalue: 9223372036854775807\ntoString: text\ntoJSON: data\nnested: [{isLosslessNumber: true}]",
  ],
  [
    "toml",
    'isLosslessNumber = true\nvalue = 9223372036854775807\ntoString = "text"\ntoJSON = "data"\nnested = [{isLosslessNumber = true}]',
  ],
] as const)("preserves serializer-looking user keys from %s", (from, input) => {
  const result = convertStructured({ from, to: "json", input });
  expect(result.output).toContain('"value": 9223372036854775807');
  const parsed = JSON.parse(result.output);
  expect(parsed.isLosslessNumber).toBe(true);
  expect(parsed.toString).toBe("text");
  expect(parsed.toJSON).toBe("data");
  expect(parsed.nested).toEqual([{ isLosslessNumber: true }]);
  expect(result.bytes).toBe(new TextEncoder().encode(result.output).length);
});

it("preserves JSON indentation, empty containers, escapes and primitive values", () => {
  const value = {
    empty: {},
    list: [],
    values: [null, true, false, 1.25, '界\n"\\'],
    nested: { a: [1, 2] },
  };
  const yaml = convertStructured({
    from: "json",
    to: "yaml",
    input: JSON.stringify(value),
  }).output;
  expect(
    convertStructured({ from: "yaml", to: "json", input: yaml }).output,
  ).toBe(JSON.stringify(value, null, 2));
  expect(
    convertStructured({ from: "yaml", to: "json", input: "-0.0" }).output,
  ).toBe("-0");
});
