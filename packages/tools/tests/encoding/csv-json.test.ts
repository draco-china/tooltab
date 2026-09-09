import { describe, expect, it } from "vitest";
import {
  CsvJsonError,
  type CsvOptions,
  convertCsvJson,
  MAX_INPUT_BYTES,
  MAX_ROWS,
} from "../../src/encoding/csv-json";

function csv(input: string, options?: Partial<CsvOptions>) {
  return convertCsvJson({ kind: "csv-to-json", input, options });
}
function json(
  input: string,
  options?: Partial<import("../../src/encoding/csv-json").JsonOptions>,
) {
  return convertCsvJson({ kind: "json-to-csv", input, options });
}
describe("CSV parsing", () => {
  it("handles RFC4180 CRLF, escaped quotes, multiline cells and Unicode", () => {
    expect(
      JSON.parse(
        csv('name,note\r\n小明,"hello, ""world""\r\nsecond line"').output,
      ),
    ).toEqual([{ name: "小明", note: 'hello, "world"\r\nsecond line' }]);
  });
  it("preserves unsafe integers and infers supported types only when selected", () => {
    expect(
      JSON.parse(
        csv("a,b,c,d,e\n9007199254740993,true,42,,2024-01-01T00:00:00Z", {
          checkType: true,
        }).output,
      )[0],
    ).toEqual({
      a: "9007199254740993",
      b: true,
      c: 42,
      d: null,
      e: "2024-01-01T00:00:00.000Z",
    });
    expect(JSON.parse(csv("a\n001").output)).toEqual([{ a: "001" }]);
  });
  it("supports custom headers, type inference, trimming, filtering, row limit and compact output", () => {
    expect(
      csv(" Ada ; 36 ; keep \n Linus ; 32 ; drop ", {
        noHeader: true,
        headersText: "name,age,tag",
        delimiter: ";",
        checkType: true,
        includeColumns: "name|age",
        preview: 1,
        indentSize: 0,
      }),
    ).toMatchObject({
      output: '[{"name":"Ada","age":36}]',
      rows: 1,
      limited: true,
    });
  });
  it("supports no-header arrays and ignores object column filters", () => {
    expect(
      csv("1,2\n3,4", {
        noHeader: true,
        includeColumns: "absent",
        indentSize: 0,
      }).output,
    ).toBe('[["1","2"],["3","4"]]');
  });
  it("supports custom quote and escape characters", () => {
    expect(
      JSON.parse(
        csv("a|b\nx|'one\\'two'", {
          delimiter: "|",
          quoteChar: "'",
          escapeChar: "\\",
        }).output,
      ),
    ).toEqual([{ a: "x", b: "one'two" }]);
  });
  it("keeps whitespace when trimming disabled", () => {
    expect(
      JSON.parse(
        csv('" name "|" age "\n" Ada "|" 36 "', {
          delimiter: "|",
          trim: false,
          quoteChar: "",
          escapeChar: "",
        }).output,
      ),
    ).toEqual([{ " name ": " Ada ", " age ": " 36 " }]);
  });
  it("supports physical line skip, comments, CRLF, tabs, fast mode and greedy empties", () => {
    expect(
      JSON.parse(
        csv("# comment\r\nskip-me\r\n1\t2\r\n\r\n3\t4", {
          noHeader: true,
          delimiter: "\\t",
          newline: "\\r\\n",
          skipEmptyLines: "greedy",
          comments: "#",
          skipFirstNLines: 1,
          fastMode: true,
        }).output,
      ),
    ).toEqual([["skip-me"], ["1", "2"], ["3", "4"]]);
  });
  it("supports auto delimiter and fallback guesses", () => {
    expect(
      JSON.parse(
        csv("a;b\n1;2", {
          delimiter: "auto",
          delimitersToGuessText: ",,\\t,|,;",
        }).output,
      ),
    ).toEqual([{ a: "1", b: "2" }]);
  });
  it("supports both skip empty modes and exclusion regex", () => {
    expect(
      csv("1\n\n2", { noHeader: true, skipEmptyLines: "true", indentSize: 0 })
        .output,
    ).toBe('[["1"],["2"]]');
    expect(
      JSON.parse(csv("a,b,c\n1,2,3", { ignoreColumns: "b" }).output),
    ).toEqual([{ a: "1", c: "3" }]);
  });
  it("renames duplicate headers and retains all values", () => {
    const result = csv("a,a\n1,2");
    expect(JSON.parse(result.output)).toEqual([{ a: "1", a_1: "2" }]);
    expect(result.renamedHeaders).toEqual({ a_1: "a" });
  });
  it("does not mutate prototypes from hostile headers", () => {
    const result = csv("__proto__,constructor,toString\nx,y,z");
    expect(Object.keys(JSON.parse(result.output)[0])).toEqual([
      "__proto__",
      "constructor",
      "toString",
    ]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
  it.each(['a,b\n"unterminated', "a,b\n1", "a,b\n1,2,3"])(
    "rejects malformed CSV: %s",
    (input) => {
      expect(() => csv(input)).toThrow(CsvJsonError);
    },
  );
  it("rejects invalid regex, delimiter, quote, limits and custom header configurations", () => {
    for (const options of [
      { includeColumns: "[" },
      { delimiter: "\n" },
      { quoteChar: "xx" },
      { indentSize: 9 },
      { preview: -1 },
      { newline: "\\t" },
      { noHeader: true, headersText: " , " },
      { noHeader: true, headersText: "a,b", delimiter: "auto" },
    ])
      expect(() => csv("a,b\n1,2", options)).toThrow(CsvJsonError);
    expect(() => csv("a,b\n1,2", { noHeader: "yes" as never })).toThrow(
      CsvJsonError,
    );
    expect(() => csv("a,b\n1,2", { headersText: "x".repeat(8193) })).toThrow(
      CsvJsonError,
    );
  });
  it("keeps fast mode literal quotes and pretty indentation consistent", () => {
    expect(
      JSON.parse(csv('"a",b', { noHeader: true, fastMode: true }).output),
    ).toEqual([['"a"', "b"]]);
    const r = csv("a,b\n1,2", { indentSize: 8 });
    expect(r.output).toBe(JSON.stringify([{ a: "1", b: "2" }], null, 8));
    expect(csv("   ").output).toBe("[]");
    expect(
      csv("Ada;36", {
        noHeader: true,
        headersText: "name,age",
        delimiter: ";",
        newline: "\\n",
        indentSize: 0,
      }).output,
    ).toBe('[{"name":"Ada","age":"36"}]');
  });
});
describe("CSV export", () => {
  it("exports all three input shapes", () => {
    for (const input of [
      '[{"name":"Ada","age":36}]',
      '{"fields":["name","age"],"data":[["Ada",36]]}',
      '{"fields":["name","age"],"data":[{"age":36,"name":"Ada"}]}',
    ])
      expect(json(input).output).toBe("name,age\r\nAda,36");
    expect(json('[["Ada",36]]').output).toBe("Ada,36");
  });
  it("supports delimiters, no header and quote characters", () => {
    expect(
      json('[{"a":"x;y"}]', {
        delimiter: ";",
        quoteChar: "'",
        includeHeaderRow: false,
      }).output,
    ).toBe("'x;y'");
    expect(json('[{"a":"x,y"}]', { quoteChar: "" }).output).toBe('a\r\n"x,y"');
  });
  it("rejects invalid JSON options and oversized field metadata", () => {
    expect(() => json("[]", { delimiter: 1 as never })).toThrow(CsvJsonError);
    expect(() =>
      json(JSON.stringify({ fields: Array(1001).fill("x"), data: [] })),
    ).toThrow(CsvJsonError);
  });
  it("escapes all spreadsheet formula prefixes by default, including headers", () => {
    for (const v of ["=1+1", "+cmd", "-1", "@sum", "\tcmd", "\rcmd"]) {
      const result = json(JSON.stringify([{ a: v }])).output;
      expect(result).toContain("'");
      expect(JSON.parse(csv(result).output)[0].a).toBe(`'${v}`);
    }
    expect(json('[{"a":"=1"}]', { escapeFormulae: false }).output).toBe(
      "a\r\n=1",
    );
  });
  it("preserves multiline, commas and quotes in a roundtrip", () => {
    const value = [{ name: "你好", note: 'one\r\ntwo, "three"' }];
    expect(JSON.parse(csv(json(JSON.stringify(value)).output).output)).toEqual(
      value,
    );
  });
  it("defines first-object columns, missing cells, and nested stringification", () => {
    expect(json('[{"a":1,"b":null},{"a":2,"c":3}]').output).toBe(
      "a,b\r\n1,\r\n2,",
    );
    expect(json('[{"a":{"x":1},"b":[1,2]}]').output).toBe(
      'a,b\r\n[object Object],"1,2"',
    );
  });
  it.each([
    "null",
    "1",
    '{"a":1}',
    "[1,2]",
    '[[1],{"a":2}]',
    '{"fields":[1],"data":[]}',
    '{"fields":[],"data":[null]}',
    "not json",
  ])("rejects unsupported shape: %s", (input) =>
    expect(() => json(input)).toThrow(CsvJsonError),
  );
  it("handles empty arrays and UTF-8 BOM", () => {
    expect(json("[]").output).toBe("");
    expect(JSON.parse(csv("\uFEFFa\n1").output)).toEqual([{ a: "1" }]);
    expect(json("\uFEFF[[1]]").output).toBe("1");
  });
});
describe("resource limits", () => {
  it("checks UTF-8 size and malformed surrogate input", () => {
    expect(() => csv("中".repeat(Math.ceil(MAX_INPUT_BYTES / 3)))).toThrow(
      CsvJsonError,
    );
    expect(() => csv("\ud800")).toThrow(CsvJsonError);
  });
  it("allows exactly 1M rows, rejects overflow, and does not apply output preview limit silently", () => {
    expect(
      csv(`${"x\n".repeat(MAX_ROWS - 1)}x`, { noHeader: true, indentSize: 0 })
        .rows,
    ).toBe(MAX_ROWS);
    expect(() =>
      csv(`${"x\n".repeat(MAX_ROWS)}x`, { noHeader: true, indentSize: 0 }),
    ).toThrow(CsvJsonError);
  });
  it("bounds column count and expanded output", () => {
    expect(() =>
      csv(Array(1001).fill("x").join(","), { noHeader: true }),
    ).toThrow(CsvJsonError);
    const header = "a".repeat(1600);
    expect(() =>
      csv(`${header}\n${"x\n".repeat(85000)}`, {
        skipEmptyLines: "true",
        indentSize: 0,
      }),
    ).toThrow(CsvJsonError);
  });
});
it("rejects numeric precision loss before export, preserving valid negative number semantics", () => {
  for (const token of [
    "9007199254740993",
    "1e400",
    "1e-400",
    "0.10000000000000001",
    "-9007199254740993",
  ]) {
    try {
      json(`[[${token}]]`);
      throw new Error("accepted unsafe number");
    } catch (e) {
      expect(e).toBeInstanceOf(CsvJsonError);
      expect((e as CsvJsonError).code).toBe("precision_loss");
    }
  }
  expect(json("[[0.1,-42,1e3,1.00,9007199254740992]]").output).toBe(
    "0.1,-42,1000,1,9007199254740992",
  );
  expect(json('[["9007199254740993"]]').output).toBe("9007199254740993");
});
it("does not export inherited values for missing object fields", () => {
  expect(
    json('{"fields":["constructor","toString","__proto__"],"data":[{}]}')
      .output,
  ).toBe("constructor,toString,__proto__\r\n,,");
});
it("preserves hostile duplicate headers without collisions", () => {
  expect(
    JSON.parse(csv("__proto__,__proto__,__TOOLTAB_PROTO__\nx,y,z").output),
  ).toEqual([{ ["__proto__"]: "x", __proto___1: "y", __TOOLTAB_PROTO__: "z" }]);
});
it("rejects excessive nested JSON depth before parsing", () => {
  expect(() => json(`${"[".repeat(257)}0${"]".repeat(257)}`)).toThrow(
    CsvJsonError,
  );
});
it("protects inferred CSV decimal precision while preserving out-of-range text", () => {
  for (const value of ["0.10000000000000001", "1e-400"]) {
    expect(() => csv(`a\n${value}`, { checkType: true })).toThrow(
      "precision_loss",
    );
  }
  expect(
    JSON.parse(
      csv("a,b,c,d,e\n.5,+2,1.,9007199254740993,1e400", { checkType: true })
        .output,
    ),
  ).toEqual([{ a: 0.5, b: "+2", c: 1, d: "9007199254740993", e: "1e400" }]);
  expect(() => csv("a\n1e-123456789", { checkType: true })).toThrow(
    "precision_loss",
  );
});

it("counts cells across rows and rejects the aggregate cell limit", () => {
  const row = `[${Array(1000).fill('"x"').join(",")}]`;
  const input = `[${Array(4001).fill(row).join(",")}]`;
  expect(() => json(input)).toThrow(CsvJsonError);
});

it("keeps a concrete row for delimiter errors without parser row metadata", () => {
  expect(() =>
    convertCsvJson({
      kind: "csv-to-json",
      input: "hello\nworld",
      options: { noHeader: true, delimiter: "auto" },
    }),
  ).toThrow(expect.objectContaining({ code: "invalid_input", row: 1 }));
});
