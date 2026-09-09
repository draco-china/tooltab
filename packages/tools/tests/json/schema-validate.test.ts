import { describe, expect, it, vi } from "vitest";
import { validateSchema } from "../../src/json/schema-validate";
import { SchemaToolError } from "../../src/json/schema-contract";

describe("JSON Schema validation", () => {
  it.each([
    ["draft-07", "http://json-schema.org/draft-07/schema#"],
    ["2019-09", "https://json-schema.org/draft/2019-09/schema"],
    ["2020-12", "https://json-schema.org/draft/2020-12/schema"],
  ])(
    "validates declared %s schemas and reports escaped property paths",
    (draft, uri) => {
      const schema = {
        $schema: uri,
        type: "object",
        required: ["a/b~c"],
        properties: { "a/b~c": { type: "integer" } },
        additionalProperties: false,
      };
      expect(validateSchema(schema, { "a/b~c": 3 }, true, true)).toEqual({
        valid: true,
        detectedDraft: draft,
        issues: [],
      });
      expect(validateSchema(schema, {}, true, true)).toMatchObject({
        valid: false,
        issues: [
          {
            path: "/a~1b~0c",
            keyword: "required",
            message: "must have required property 'a/b~c'",
          },
        ],
      });
      expect(
        validateSchema(schema, { "a/b~c": "x" }, true, true),
      ).toMatchObject({
        valid: false,
        issues: [
          { path: "/a~1b~0c", keyword: "type", message: "must be integer" },
        ],
      });
    },
  );

  it("supports boolean schemas and defaults to 2020-12", () => {
    expect(validateSchema(true, null, false, false)).toEqual({
      valid: true,
      detectedDraft: "2020-12",
      issues: [],
    });
    expect(validateSchema(false, null, false, false)).toMatchObject({
      valid: false,
      issues: [{ keyword: "false schema", path: "" }],
    });
  });

  it("honors all-errors and format validation without changing input", () => {
    const schema = {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        count: { type: "integer" },
      },
      required: ["email", "count"],
    };
    const data = { email: "invalid", count: "2" };
    expect(validateSchema(schema, data, true, true).issues).toHaveLength(2);
    expect(validateSchema(schema, data, false, true).issues).toHaveLength(1);
    expect(
      validateSchema(schema, { ...data, count: 2 }, true, false).valid,
    ).toBe(true);
    expect(data).toEqual({ email: "invalid", count: "2" });
  });

  it("rejects unsupported schema structures and unresolved references", () => {
    for (const schema of [
      null,
      [],
      { type: "unknown" },
      { $ref: "https://example.invalid/missing" },
    ])
      expect(() => validateSchema(schema, {}, true, false)).toThrow(
        "invalid_schema",
      );
  });

  it("rejects nested bigint values before AJV can lose numeric precision", () => {
    expect(() => validateSchema({ minimum: 1n }, 1, false, false)).toThrow(
      "precision_loss",
    );
    expect(() => validateSchema(true, { values: [1n] }, false, false)).toThrow(
      "precision_loss",
    );
  });

  it("caps actual accumulated validation issues", () => {
    expect(() =>
      validateSchema(
        { type: "array", items: { type: "integer" } },
        Array(100001).fill("invalid"),
        true,
        false,
      ),
    ).toThrow("too_large");
  }, 30000);
});

it("reports unavailable dynamic compilation and validates again once the runtime recovers", () => {
  const NativeFunction = globalThis.Function;
  vi.stubGlobal("Function", function FunctionMock() {
    throw new EvalError("unsafe-eval disabled");
  });
  try {
    expect(() => validateSchema({ type: "integer" }, 1, false, false)).toThrow(
      "unsupported",
    );
  } finally {
    vi.stubGlobal("Function", NativeFunction);
    vi.unstubAllGlobals();
  }
  expect(validateSchema({ type: "integer" }, 1, false, false).valid).toBe(true);
});

it("preserves domain failures raised while reading an own non-enumerable data property", () => {
  const failure = new SchemaToolError("read_failed");
  const data = Object.defineProperty({}, "value", {
    get() {
      throw failure;
    },
    enumerable: false,
  });
  expect(() =>
    validateSchema(
      { type: "object", properties: { value: { type: "string" } } },
      data,
      true,
      false,
    ),
  ).toThrow(failure);
  expect(
    validateSchema(
      { type: "object", properties: { value: { type: "string" } } },
      { value: "recovered" },
      true,
      false,
    ).valid,
  ).toBe(true);
});

it("bounds the input walk and recovers after cyclic or excessive-depth values", () => {
  let atLimit: unknown = 1;
  for (let i = 0; i < 128; i++) atLimit = { value: atLimit };
  expect(validateSchema(true, atLimit, false, false).valid).toBe(true);
  expect(() => validateSchema(true, { value: atLimit }, false, false)).toThrow(
    expect.objectContaining({ code: "too_deep" }),
  );
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  for (const [schema, data] of [
    [true, cyclic],
    [cyclic, null],
  ]) {
    expect(() => validateSchema(schema, data, false, false)).toThrow(
      expect.objectContaining({ code: "too_deep" }),
    );
  }
  const shared = { value: 1 };
  expect(
    validateSchema(true, { first: shared, second: shared }, false, false).valid,
  ).toBe(true);
});
