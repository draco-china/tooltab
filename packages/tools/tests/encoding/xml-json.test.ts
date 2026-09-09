import { expect, it, vi } from "vitest";
import {
  convertXmlJson,
  MAX_XML_INPUT,
  XmlJsonError,
} from "../../src/encoding/xml-json";

const xml = (input: string, options = {}) =>
  JSON.parse(
    convertXmlJson({ direction: "xml-to-json", input, options }).output,
  );
it("matches compact attributes, repeated elements, CDATA, comments and mixed text", () => {
  expect(
    xml(
      '<?xml version="1.0"?><r a="yes">before<x>1</x><![CDATA[<raw>]]><!--note--><x>2</x>after</r>',
    ),
  ).toEqual({
    _declaration: { _attributes: { version: "1.0" } },
    r: {
      _attributes: { a: "yes" },
      _text: ["before", "after"],
      x: [{ _text: "1" }, { _text: "2" }],
      _cdata: "<raw>",
      _comment: "note",
    },
  });
});
it("preserves ordered noncompact mixed children and alwaysChildren", () => {
  expect(
    xml("<r>a<x/>b</r>", { compact: false, alwaysChildren: true }),
  ).toEqual({
    elements: [
      {
        type: "element",
        name: "r",
        elements: [
          { type: "text", text: "a" },
          { type: "element", name: "x", elements: [] },
          { type: "text", text: "b" },
        ],
      },
    ],
  });
});
it("supports all ignore switches, trims, exact native values and arrays", () => {
  expect(
    xml(
      '<?xml version="1.0"?><?go now?><!DOCTYPE r><r a="v">42<![CDATA[x]]><!--y--></r>',
      {
        ignoreDeclaration: true,
        ignoreInstruction: true,
        ignoreDoctype: true,
        ignoreAttributes: true,
        ignoreText: true,
        ignoreCdata: true,
        ignoreComment: true,
      },
    ),
  ).toEqual({ r: {} });
  expect(
    xml("<r><a>  true  </a><b>42</b></r>", {
      trim: true,
      nativeType: true,
      alwaysArray: true,
    }),
  ).toEqual({ r: [{ a: [{ _text: [true] }], b: [{ _text: [42] }] }] });
  expect(
    convertXmlJson({
      direction: "xml-to-json",
      input: "<r>9007199254740993</r>",
      options: { nativeType: true },
    }).output,
  ).toContain("9007199254740993");
});
it("retains doctype metadata without fetching external references and rejects unresolved entities", () => {
  expect(
    xml('<!DOCTYPE r SYSTEM "https://invalid.test/external"><r/>')._doctype,
  ).toContain("https://invalid.test/external");
  for (const input of [
    '<!DOCTYPE r [<!ENTITY a "hello">]><r>&a;</r>',
    "<r>&unknown;</r>",
    "<r>&#0;</r>",
    "<r><x></r>",
  ])
    expect(() => xml(input)).toThrow(XmlJsonError);
});
it("treats inherited-looking XML and JSON keys as own data", () => {
  const result = xml(
    "<r><__proto__>ok</__proto__><constructor>x</constructor></r>",
  );
  expect(Object.hasOwn(result.r, "__proto__")).toBe(true);
  const output = convertXmlJson({
    direction: "json-to-xml",
    input: '{"__proto__":1,"bad key":2,"big":9007199254740993}',
  }).output;
  expect(output).toContain("<__proto__>1</__proto__>");
  expect(output).toContain('<property name="bad key">2</property>');
  expect(output).toContain("9007199254740993");
});
it("supports every JSON XML option and rejects invalid XML characters", () => {
  expect(
    convertXmlJson({
      direction: "json-to-xml",
      input: '[null,{},[],"<&"]',
      options: {
        rootElementName: "data",
        arrayItemTag: "entry",
        indentSize: 0,
        includeXmlDeclaration: false,
        fullTagEmptyElement: true,
      },
    }).output,
  ).toBe(
    "<data><entry></entry><entry></entry><entry></entry><entry>&lt;&amp;</entry></data>",
  );
  expect(() =>
    convertXmlJson({ direction: "json-to-xml", input: '"\\u0000"' }),
  ).toThrow("invalid_character");
});
it("preserves whitespace/native hexadecimal integers and reports parser positions", () => {
  for (const value of [
    " 9007199254740993 ",
    "+9007199254740993",
    "0x20000000000001",
  ])
    expect(
      convertXmlJson({
        direction: "xml-to-json",
        input: `<r>${value}</r>`,
        options: { nativeType: true },
      }).output,
    ).toContain("9007199254740993");
  expect(() => xml("<r>\n<x></r>")).toThrow("invalid_input");
});

it.each([
  ["false", false],
  ["FALSE", false],
  ["True", true],
  ["plain", "plain"],
  ["+12", 12],
  ["0012", 12],
  ["0b11", 3],
  ["0o17", 15],
  [".5", 0.5],
  ["2.", 2],
  ["1e2", 100],
] as const)(
  "converts native scalar %s with exact JSON semantics",
  (value, expected) => {
    expect(xml(`<r>${value}</r>`, { nativeType: true })).toEqual({
      r: { _text: expected },
    });
  },
);

it.each(["Infinity", "-Infinity", "1e9999", ".12345678901234567890123456789"])(
  "rejects nonfinite or inexact noncanonical scalar %s",
  (value) => {
    expect(() => xml(`<r>${value}</r>`, { nativeType: true })).toThrow(
      expect.objectContaining({ code: "invalid_input" }),
    );
  },
);

it("retains and trims noncompact declaration, doctype, instruction, attributes, CDATA and comments", () => {
  expect(
    xml(
      '<?xml version="1.0"?><!DOCTYPE r><?go  now ?><r a=" padded "><![CDATA[ raw ]]><!-- note --><x/></r>',
      { compact: false, trim: true },
    ),
  ).toEqual({
    declaration: { attributes: { version: "1.0" } },
    elements: [
      { type: "doctype", doctype: "r" },
      { type: "instruction", name: "go", instruction: "now" },
      {
        type: "element",
        name: "r",
        attributes: { a: "padded" },
        elements: [
          { type: "cdata", cdata: "raw" },
          { type: "comment", comment: "note" },
          { type: "element", name: "x" },
        ],
      },
    ],
  });
});

it("appends three repeated nodes and preserves compact processing instructions", () => {
  expect(
    xml("<?one first?><?two second?><r><x>1</x><x>2</x><x>3</x></r>"),
  ).toEqual({
    _instruction: [{ one: "first" }, { two: "second" }],
    r: { x: [{ _text: "1" }, { _text: "2" }, { _text: "3" }] },
  });
});

it("escapes invalid JSON property names and preserves declaration without indentation", () => {
  const result = convertXmlJson({
    direction: "json-to-xml",
    input: '{"bad \\" key":"<&>\\"","empty":null}',
    options: {
      rootElementName: " root ",
      arrayItemTag: " entry ",
      indentSize: 0,
    },
  });
  expect(result.output).toBe(
    '<?xml version="1.0" encoding="UTF-8"?><root><property name="bad &quot; key">&lt;&amp;&gt;"</property><empty /></root>',
  );
  expect(result.bytes).toBe(new TextEncoder().encode(result.output).length);
});

it.each([
  { indentSize: -1 },
  { indentSize: 9 },
  { indentSize: 0.5 },
  { rootElementName: "1root" },
  { arrayItemTag: "bad tag" },
])("rejects invalid JSON XML output options %j", (options) => {
  expect(() =>
    convertXmlJson({ direction: "json-to-xml", input: "{}", options }),
  ).toThrow(expect.objectContaining({ code: "invalid_options" }));
});

it("returns empty output for whitespace and rejects malformed JSON or deep XML", () => {
  for (const direction of ["json-to-xml", "xml-to-json"] as const)
    expect(convertXmlJson({ direction, input: " \n\t " })).toEqual({
      output: "",
      bytes: 0,
    });
  expect(() =>
    convertXmlJson({ direction: "json-to-xml", input: '{"a":' }),
  ).toThrow(expect.objectContaining({ code: "invalid_input" }));
  expect(() => xml("<r>".repeat(130) + "</r>".repeat(130))).toThrow(
    expect.objectContaining({ code: "too_deep" }),
  );
  expect(() =>
    convertXmlJson({
      direction: "json-to-xml",
      input: `${"[".repeat(130)}"value"${"]".repeat(130)}`,
    }),
  ).toThrow(expect.objectContaining({ code: "too_deep" }));
});

it("preserves numeric source on platforms whose JSON reviver has no context", () => {
  const nativeParse = JSON.parse;
  const platform = vi
    .spyOn(JSON, "parse")
    .mockImplementation((input, reviver) =>
      nativeParse(
        input,
        reviver
          ? function (this: unknown, key: string, value: unknown) {
              return reviver.call(this, key, value);
            }
          : undefined,
      ),
    );
  try {
    const result = convertXmlJson({
      direction: "json-to-xml",
      input:
        '{"safe":2,"large":9007199254740993,"decimal":0.1234567890123456789,"items":[true,null,"text"]}',
      options: { indentSize: 0, includeXmlDeclaration: false },
    });
    expect(result.output).toBe(
      "<root><safe>2</safe><large>9007199254740993</large><decimal>0.1234567890123456789</decimal><items><item>true</item><item /><item>text</item></items></root>",
    );
    expect(() =>
      convertXmlJson({
        direction: "json-to-xml",
        input: `${"[".repeat(130)}1${"]".repeat(130)}`,
      }),
    ).toThrow(expect.objectContaining({ code: "too_deep" }));
  } finally {
    platform.mockRestore();
  }
});

it("bounds escaped XML output before returning it", () => {
  const value = "&".repeat(27_000_000);
  expect(() =>
    convertXmlJson({ direction: "json-to-xml", input: JSON.stringify(value) }),
  ).toThrow(expect.objectContaining({ code: "too_large" }));
});

it("rejects source character and UTF8 byte limits before parsing", () => {
  expect(() =>
    convertXmlJson({
      direction: "xml-to-json",
      input: " ".repeat(MAX_XML_INPUT + 1),
    }),
  ).toThrow(expect.objectContaining({ code: "too_large" }));
  expect(() =>
    convertXmlJson({
      direction: "xml-to-json",
      input: "界".repeat(Math.floor(MAX_XML_INPUT / 3) + 1),
    }),
  ).toThrow(expect.objectContaining({ code: "too_large" }));
});

it("bounds XML node traversal independently of input bytes", () => {
  const input = `<r>${"<x/>".repeat(1_000_001)}</r>`;
  expect(() => convertXmlJson({ direction: "xml-to-json", input })).toThrow(
    expect.objectContaining({ code: "too_large" }),
  );
});

it.each([
  '{"n":1,"middle":true,"n":9007199254740993,"nested":{"x":9007199254740995,"x":2},"__proto__":{"safe":1},"__proto__":{"safe":2}}',
  '{"n":1e999999999,"middle":true,"n":9007199254740993,"nested":{"x":0.123456789012345678901,"x":2},"__proto__":{"safe":1},"__proto__":{"safe":2}}',
  `{"n":${"[".repeat(160)}0${"]".repeat(160)},"middle":true,"n":9007199254740993,"nested":{"x":1,"x":2},"__proto__":{"safe":1},"__proto__":{"safe":2}}`,
])(
  "exports identical duplicate-key JSON on modern and legacy reviver runtimes: %s",
  (input) => {
    const nativeParse = JSON.parse;
    const check = () => {
      const result = convertXmlJson({
        direction: "json-to-xml",
        input,
        options: { indentSize: 0, includeXmlDeclaration: false },
      });
      expect(result.output).toBe(
        "<root><n>9007199254740993</n><middle>true</middle><nested><x>2</x></nested><__proto__><safe>2</safe></__proto__></root>",
      );
      expect(Object.hasOwn(Object.prototype, "safe")).toBe(false);
      expect(() =>
        convertXmlJson({ direction: "json-to-xml", input: '{"n":1,}' }),
      ).toThrow(expect.objectContaining({ code: "invalid_input" }));
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
  [70, 128, 129, 1024, 2048, 3000].flatMap((depth) =>
    ["object", "array", "mixed"].map((kind) => ({ depth, kind })),
  ),
)(
  "enforces actual JSON XML depth on both reviver runtimes at $depth $kind levels",
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
      const run = () =>
        convertXmlJson({
          direction: "json-to-xml",
          input,
          options: { indentSize: 0, includeXmlDeclaration: false },
        });
      if (depth > 128)
        expect(run).toThrow(expect.objectContaining({ code: "too_deep" }));
      else
        expect(run().output).toBe(
          `<root>${containers.map((value) => `<${value[2]}>`).join("")}1${containers
            .map((value) => `</${value[2]}>`)
            .reverse()
            .join("")}</root>`,
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

it("preserves xmldom line and column diagnostics through parser wrapping", () => {
  expect(() =>
    convertXmlJson({
      direction: "xml-to-json",
      input: "<root>\n<child></root>",
    }),
  ).toThrow(
    expect.objectContaining({ code: "invalid_input", line: 2, column: 1 }),
  );
});

it("serializes non-XML processing instructions when they are not ignored", () => {
  const result = convertXmlJson({
    direction: "xml-to-json",
    input: "<?build release?><root />",
  });
  expect(JSON.parse(result.output)).toEqual({
    _instruction: { build: "release" },
    root: {},
  });
  expect(
    convertXmlJson({
      direction: "xml-to-json",
      input: "<?build release?><root />",
      options: { ignoreInstruction: true },
    }).output,
  ).toBe('{\n  "root": {}\n}');
});

it.each([30_000, 110_000])(
  "bounds serialized XML JSON output for %i nodes before allocating it",
  (nodes) => {
    const input = `${"<r>".repeat(80)}${"<x/>".repeat(nodes)}${"</r>".repeat(80)}`;
    expect(() =>
      convertXmlJson({
        direction: "xml-to-json",
        input,
        options: { compact: false, indentSize: 8 },
      }),
    ).toThrow(expect.objectContaining({ code: "too_large" }));
  },
  30_000,
);

it("checks UTF8 output bytes after XML escaping even below the character limit", () => {
  const value = "&".repeat(26_000_000) + "界".repeat(1_500_000);
  expect(() =>
    convertXmlJson({
      direction: "json-to-xml",
      input: JSON.stringify(value),
    }),
  ).toThrow(expect.objectContaining({ code: "too_large" }));
}, 30_000);

it.each([
  "\t1",
  "\n \t9007199254740993\r\n",
  "\t[1]",
  '\t{"n":1}',
  '{\n\t"n":9007199254740993,\n\t"m":-0\n}',
  ...[0x85, 0x2028, 0x2029, 0xfeff, 0xd800, 0xdfff].map(
    (code) =>
      `{"n":9007199254740993,"s":${JSON.stringify(`a${String.fromCharCode(code)}b`)}}`,
  ),
])(
  "preserves JSON whitespace and strings without reviver context: %j",
  (input) => {
    const job = { direction: "json-to-xml" as const, input };
    const convert = () => {
      try {
        return convertXmlJson(job);
      } catch (error) {
        if (!(error instanceof XmlJsonError)) throw error;
        return { code: error.code };
      }
    };
    const expected = convert();
    if (input.includes("\\ud800") || input.includes("\\udfff"))
      expect(expected).toEqual({ code: "invalid_character" });
    else expect(expected).toHaveProperty("output");
    const nativeParse = JSON.parse;
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
      expect(convert()).toEqual(expected);
    } finally {
      platform.mockRestore();
    }
  },
);

it.each([true, false])(
  "serializes XML without indentation (compact=%s)",
  (compact) => {
    const result = convertXmlJson({
      direction: "xml-to-json",
      input: '<root a="界"><n>1</n><n>2</n></root>',
      options: { compact, indentSize: 0, nativeType: true },
    });
    const expected = compact
      ? { root: { n: [{ _text: 1 }, { _text: 2 }], _attributes: { a: "界" } } }
      : {
          elements: [
            {
              type: "element",
              name: "root",
              elements: [
                {
                  type: "element",
                  name: "n",
                  elements: [{ type: "text", text: 1 }],
                },
                {
                  type: "element",
                  name: "n",
                  elements: [{ type: "text", text: 2 }],
                },
              ],
              attributes: { a: "界" },
            },
          ],
        };
    expect(result.output).toBe(JSON.stringify(expected));
    expect(result.bytes).toBe(
      new TextEncoder().encode(JSON.stringify(expected)).length,
    );
  },
);

it.each([0, 2, 8])(
  "preserves XML names resembling serializer metadata with indent %i",
  (indentSize) => {
    const input =
      "<root><isLosslessNumber>true</isLosslessNumber><toString>data</toString><toJSON>text</toJSON><value>9223372036854775807</value></root>";
    const result = convertXmlJson({
      direction: "xml-to-json",
      input,
      options: { nativeType: true, indentSize },
    });
    expect(result.output).toContain("9223372036854775807");
    const parsed = JSON.parse(result.output);
    expect(parsed.root.isLosslessNumber).toEqual({ _text: true });
    expect(parsed.root.toString).toEqual({ _text: "data" });
    expect(parsed.root.toJSON).toEqual({ _text: "text" });
    expect(result.bytes).toBe(new TextEncoder().encode(result.output).length);
    expect(xml("<isLosslessNumber>true</isLosslessNumber>")).toEqual({
      isLosslessNumber: { _text: "true" },
    });
  },
);

it("rejects a failed legacy parser document instead of exporting partial JSON", () => {
  const nativeParse = JSON.parse;
  const input = `{"discarded":${"[".repeat(10000)}0${"]".repeat(10000)},"discarded":1}`;
  expect(nativeParse(input)).toEqual({ discarded: 1 });
  const platform = vi.spyOn(JSON, "parse").mockImplementation((text, reviver) =>
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
    expect(() => convertXmlJson({ direction: "json-to-xml", input })).toThrow(
      expect.objectContaining({ code: "invalid_input" }),
    );
  } finally {
    platform.mockRestore();
  }
});
