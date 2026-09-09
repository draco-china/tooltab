import { validateSchema } from "../../src/json/schema-validate";
import { describe, expect, it } from "vitest";
import { generateJsonSchema } from "../../src/json/schema-generate";

type Schema = Record<string, unknown>;

function propertiesOf(schema: Schema) {
  return schema.properties as Record<string, Schema>;
}

describe("generateJsonSchema", () => {
  it("generates primitive schemas and uses the selected draft", () => {
    expect(generateJsonSchema(null).type).toBe("null");
    expect(generateJsonSchema(true).type).toBe("boolean");
    expect(generateJsonSchema(1).type).toBe("integer");
    expect(generateJsonSchema(1.5).type).toBe("number");
    expect(generateJsonSchema(1n).type).toBe("integer");
    expect(generateJsonSchema(undefined)).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
    });

    expect(generateJsonSchema({}, { draft: "2019-09" }).$schema).toBe(
      "https://json-schema.org/draft/2019-09/schema",
    );
    expect(generateJsonSchema({}, { draft: "draft-07" }).$schema).toBe(
      "http://json-schema.org/draft-07/schema",
    );
  });

  it("generates object properties, required fields, and option-controlled extras", () => {
    const schema = generateJsonSchema(
      { id: 1, name: "Ada", tags: ["a", "b"] },
      {
        inferRequired: true,
        allowAdditionalProperties: false,
        detectFormat: false,
      },
    );

    expect(schema).toMatchObject({
      type: "object",
      required: ["id", "name", "tags"],
      additionalProperties: false,
    });
    expect(propertiesOf(schema).id).toEqual({ type: "integer" });
    expect(propertiesOf(schema).tags).toEqual({
      type: "array",
      items: { type: "string" },
    });

    const optional = generateJsonSchema(
      { count: 1, maybe: undefined },
      { inferRequired: false, detectFormat: false },
    );
    expect(optional.required).toBeUndefined();
    expect(propertiesOf(optional).maybe).toEqual({});
  });

  it("merges heterogeneous object, nested array, and numeric schemas", () => {
    const objects = generateJsonSchema(
      [
        { id: 1, name: "Ada" },
        { id: 2, email: "ada@example.com" },
      ],
      { detectFormat: false },
    );
    const objectItems = objects.items as Schema;
    expect(objectItems).toMatchObject({ type: "object", required: ["id"] });
    expect(Object.keys(propertiesOf(objectItems))).toEqual([
      "id",
      "name",
      "email",
    ]);

    const nested = generateJsonSchema([[1, 2], [3.5]], {
      detectFormat: false,
    });
    expect(nested).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      items: { type: "array", items: { type: "number" } },
    });

    expect(
      (
        generateJsonSchema([1, "two", null, true], {
          detectFormat: false,
        }).items as Schema
      ).anyOf,
    ).toHaveLength(4);
    expect(generateJsonSchema([])).toMatchObject({ type: "array", items: {} });
    expect(
      generateJsonSchema([{}, { id: 1 }], { detectFormat: false }).items,
    ).toMatchObject({
      type: "object",
    });
  });

  it("deduplicates schemas and respects disabled required inference", () => {
    const schema = generateJsonSchema(
      [
        { id: 1, name: "Ada" },
        { name: "Ada", id: 2 },
      ],
      { detectFormat: false },
    );
    expect(Object.keys(propertiesOf(schema.items as Schema))).toEqual([
      "id",
      "name",
    ]);

    const noRequired = generateJsonSchema([{}, { id: 1 }], {
      inferRequired: false,
      allowAdditionalProperties: false,
      detectFormat: false,
    });
    expect(noRequired.items).toEqual({
      type: "object",
      properties: { id: { type: "integer" } },
      additionalProperties: false,
    });
  });

  it("detects formats, drops mixed formats, and accepts only valid email shapes", () => {
    const schema = generateJsonSchema(
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "ada@example.com",
        url: "https://example.com",
        timestamp: "2024-01-20T10:12:30Z",
      },
      { detectFormat: true },
    );
    expect(propertiesOf(schema).id?.format).toBe("uuid");
    expect(propertiesOf(schema).email?.format).toBe("email");
    expect(propertiesOf(schema).url?.format).toBe("uri");
    expect(propertiesOf(schema).timestamp?.format).toBe("date-time");

    expect(
      (
        generateJsonSchema(["ada@example.com", "grace@example.com"])
          .items as Schema
      ).format,
    ).toBe("email");
    expect(
      (
        generateJsonSchema(["ada@example.com", "https://example.com", "   "])
          .items as Schema
      ).format,
    ).toBeUndefined();

    const invalid = propertiesOf(
      generateJsonSchema({
        spaced: "ada @example.com",
        missingLocal: "@example.com",
        missingDomain: "ada@",
        noDot: "ada@example",
        leadingDot: "ada@.example.com",
        trailingDot: "ada@example.com.",
        doubleDot: "ada@example..com",
      }),
    );
    for (const property of Object.values(invalid)) {
      expect(property).toEqual({ type: "string" });
    }
    expect(
      propertiesOf(generateJsonSchema({ id: "x" }, { detectFormat: false })).id
        ?.format,
    ).toBeUndefined();
  });

  it("preserves escaped and prototype-like property names as own schema properties", () => {
    const input = JSON.parse(
      '{"__proto__":{"n":1},"a/b":{"x":true},"a~b":"v"}',
    ) as Record<string, unknown>;
    const schema = generateJsonSchema(input);
    const properties = propertiesOf(schema);

    expect(Object.keys(properties)).toEqual(["__proto__", "a/b", "a~b"]);
    expect(
      Object.getOwnPropertyDescriptor(properties, "__proto__")?.value,
    ).toEqual({
      type: "object",
      properties: { n: { type: "integer" } },
      required: ["n"],
    });
    expect(properties["a/b"]).toEqual({
      type: "object",
      properties: { x: { type: "boolean" } },
      required: ["x"],
    });
  });
});

it("preserves empty schemas for sparse and undefined array entries", () => {
  const sparse: unknown[] = [];
  sparse.length = 2;
  expect(generateJsonSchema(sparse)).toEqual({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "array",
    items: {},
  });
  const mixed: unknown[] = [];
  mixed.length = 2;
  mixed[1] = 1;
  expect(generateJsonSchema(mixed)).toEqual(generateJsonSchema([undefined, 1]));
  expect(generateJsonSchema([undefined, 1])).toEqual({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "array",
    items: { anyOf: [{}, { type: "integer" }] },
  });
});

it("does not infer formats that reject the source string", () => {
  for (const value of [
    " ada@example.com ",
    " https://example.com ",
    " 2024-01-01T00:00:00Z ",
    " 550e8400-e29b-41d4-a716-446655440000 ",
    "2024-99-99T00:00:00Z",
    "2023-02-29T00:00:00Z",
    "a\tb@example.com",
    "https://example.com/a b",
  ]) {
    const schema = generateJsonSchema(value);
    expect(schema).not.toHaveProperty("format");
    expect(validateSchema(schema, value, true, true).valid).toBe(true);
  }
  for (const value of [
    "ada@example.com",
    "https://example.com",
    "2024-02-29T00:00:00Z",
    "550e8400-e29b-41d4-a716-446655440000",
  ]) {
    const schema = generateJsonSchema(value);
    expect(schema).toHaveProperty("format");
    expect(validateSchema(schema, value, true, true).valid).toBe(true);
  }
});

it("bounds object and array depth without rejecting shared acyclic inputs", () => {
  for (const wrap of [
    (value: unknown) => ({ value }),
    (value: unknown) => [value],
  ]) {
    let data: unknown = "leaf";
    for (let i = 0; i < 128; i++) data = wrap(data);
    expect(() => generateJsonSchema(data)).not.toThrow();
    expect(() => generateJsonSchema(wrap(data))).toThrow(
      expect.objectContaining({ code: "too_deep" }),
    );
  }
  const cyclicObject: Record<string, unknown> = {};
  cyclicObject.self = cyclicObject;
  const cyclicArray: unknown[] = [];
  cyclicArray.push(cyclicArray);
  for (const data of [cyclicObject, cyclicArray])
    expect(() => generateJsonSchema(data)).toThrow(
      expect.objectContaining({ code: "too_deep" }),
    );
  const shared = { value: 1 };
  const result = generateJsonSchema({ a: shared, b: shared });
  expect(propertiesOf(result).a).toEqual(propertiesOf(result).b);
});
