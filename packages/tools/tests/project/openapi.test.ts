import { describe, expect, it } from "vitest";
import { generateOpenapi, parseOpenapi } from "../../src/project/openapi";
import {
  openapiOptionsSchema,
  ProjectConfigError,
} from "../../src/project/openapi-contract";

const document = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths:
  /pets/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: A pet
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
components:
  schemas:
    Pet:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
      required: [id]
`;

function expectProjectError(action: () => unknown, code: string) {
  try {
    action();
    throw new Error("expected ProjectConfigError");
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectConfigError);
    expect((error as ProjectConfigError).code).toBe(code);
  }
}

describe("OpenAPI parser", () => {
  it("checks original numeric text for plain and explicitly tagged scalars", () => {
    for (const scalar of ["1.25", "!!float '1.25'", '!!float "1.25"']) {
      const parsed = parseOpenapi(`openapi: 3.1.0\npaths: {}\nx: ${scalar}\n`);
      expect((parsed as unknown as { x: number }).x).toBe(1.25);
    }
    for (const scalar of ["1.0000000000000001", "!!float '1.0000000000000001'"])
      expectProjectError(
        () => parseOpenapi(`openapi: 3.1.0\npaths: {}\nx: ${scalar}\n`),
        "precision_loss",
      );
  });

  it("rejects unresolved YAML tags instead of silently discarding their meaning", () => {
    expectProjectError(
      () =>
        parseOpenapi(
          "openapi: 3.1.0\ninfo: {title: Demo, version: 1}\npaths: {}\nx: !unknown value\n",
        ),
      "invalid_input",
    );
    expect(parseOpenapi(document).openapi).toBe("3.1.0");
  });

  it("parses OpenAPI 3.0 and 3.1 documents with internal references", () => {
    expect(
      parseOpenapi(
        "openapi: 3.0.3\ninfo: {title: Demo, version: 1}\npaths: {}\n",
      ).openapi,
    ).toBe("3.0.3");
    const parsed = parseOpenapi(document);
    expect(parsed.openapi).toBe("3.1.0");
    expect(
      (parsed.components as { schemas: Record<string, unknown> }).schemas.Pet,
    ).toBeDefined();
  });

  it("rejects unsupported, malformed, scalar, and surrogate input", () => {
    expectProjectError(
      () => parseOpenapi("openapi: 2.0\npaths: {}"),
      "unsupported_version",
    );
    expectProjectError(
      () => parseOpenapi("openapi: [3.1.0]\npaths: {}"),
      "unsupported_version",
    );
    expectProjectError(
      () => parseOpenapi("openapi: 3.1.0\npaths: {\n"),
      "invalid_input",
    );
    expectProjectError(
      () => parseOpenapi("openapi: 3.1.0\npaths: {}\nvalue: \uD800"),
      "invalid_input",
    );
    expectProjectError(
      () => parseOpenapi("openapi: 3.1.0\npaths: {}\nvalue: 9007199254740993"),
      "precision_loss",
    );
  });

  it("rejects external references and preserves the first ten reference locations", () => {
    expectProjectError(
      () =>
        parseOpenapi(
          "openapi: 3.1.0\npaths: {}\nexternal:\n  $ref: ./other.yaml",
        ),
      "external_ref",
    );
    let error: unknown;
    try {
      parseOpenapi(
        `openapi: 3.1.0\npaths: {}\n${Array.from(
          { length: 11 },
          (_, index) => `ref${index}:\n  $ref: ./other-${index}.yaml`,
        ).join("\n")}`,
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ProjectConfigError);
    expect(error).toMatchObject({ code: "external_ref" });
    expect((error as ProjectConfigError).refs.slice(0, 3)).toEqual([
      "./other-0.yaml",
      "./other-1.yaml",
      "./other-2.yaml",
    ]);
    expect((error as ProjectConfigError).refs).toHaveLength(10);
  });

  it("rejects empty, scalar, array-root, cyclic, and excessively deep YAML", () => {
    for (const input of ["", "hello", "- openapi"])
      expectProjectError(() => parseOpenapi(input), "invalid_input");
    expectProjectError(
      () =>
        parseOpenapi(
          "openapi: 3.1.0\npaths: {}\ncycle: &cycle\n  self: *cycle",
        ),
      "invalid_input",
    );
    const deep = ["openapi: 3.1.0", "paths: {}", "deep:"];
    for (let index = 0; index < 130; index += 1)
      deep.push(`${"  ".repeat(index + 1)}level${index}:`);
    deep.push(`${"  ".repeat(131)}value`);
    expectProjectError(() => parseOpenapi(deep.join("\n")), "too_deep");
  });

  it("rejects alias expansion and non-finite numeric scalars", () => {
    const aliases = [
      "openapi: 3.1.0",
      "paths: {}",
      "base: &base {value: 1}",
      "refs:",
    ];
    for (let index = 0; index < 1001; index += 1) aliases.push(`  - *base`);
    expectProjectError(() => parseOpenapi(aliases.join("\n")), "too_large");
    expectProjectError(
      () => parseOpenapi("openapi: 3.1.0\npaths: {}\nvalue: .nan"),
      "precision_loss",
    );
    expectProjectError(
      () => parseOpenapi("openapi: 3.1.0\npaths: {}\nvalue: .inf"),
      "precision_loss",
    );
  });
});

describe("OpenAPI TypeScript generation", () => {
  it("resolves shared parameter definitions into required path parameters", () => {
    const result = generateOpenapi(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "References", version: "1" },
        paths: {
          "/users/{id}": {
            get: {
              parameters: [{ $ref: "#/components/parameters/UserId" }],
              responses: { "204": { description: "Found" } },
            },
          },
        },
        components: {
          parameters: {
            UserId: {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
            },
          },
        },
      }),
    );
    expect(result.output).toContain("path: {");
    expect(result.output).toContain('id: components["parameters"]["UserId"];');
    expect(result.output).toContain("UserId: number;");
  });

  it("maps malformed schema properties to a domain generation error", () => {
    for (const property of ["string", ["string"], 42]) {
      expectProjectError(
        () =>
          generateOpenapi(
            JSON.stringify({
              openapi: "3.1.0",
              info: { title: "Invalid schema", version: "1" },
              paths: {},
              components: {
                schemas: {
                  Item: { type: "object", properties: { value: property } },
                },
              },
            }),
          ),
        "generation_failed",
      );
    }
  });

  it("rejects excessive alias expansion before transforming the document", () => {
    expectProjectError(
      () =>
        parseOpenapi(
          [
            "openapi: 3.1.0",
            "paths: {}",
            "a: &a [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]",
            "b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]",
            "c: [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]",
          ].join("\n"),
        ),
      "invalid_input",
    );
  });

  it("generates typed paths and components with byte-accurate output", () => {
    const result = generateOpenapi(document);
    expect(result.output).toContain("Generated by openapi-typescript");
    expect(result.output).toContain("export interface paths {");
    expect(result.output).toContain('"/pets/{id}"');
    expect(result.output).toContain("export interface components {");
    expect(result.output).toContain("Pet:");
    expect(result.bytes).toBe(new TextEncoder().encode(result.output).length);
  });

  it("honors header, export, enum, path parameter, immutable, and deprecated options", () => {
    const source = `${document.replace(
      "responses:",
      "deprecated: true\n      responses:",
    )}`;
    const result = generateOpenapi(source, {
      includeHeader: false,
      exportType: true,
      enum: true,
      pathParamsAsTypes: true,
      generatePathParams: true,
      immutable: true,
      excludeDeprecated: true,
    });
    expect(result.output).not.toContain("Generated by openapi-typescript");
    expect(result.output).toContain("export type paths =");
    expect(result.output).toContain("readonly");
    expect(result.output).not.toContain('"/pets/{id}"');
  });

  it("applies schema option changes and rejects unknown options", () => {
    const withExtras = generateOpenapi(
      `${document.replace(
        "type: string",
        "type: string\n          additionalProperties: false",
      )}`,
      {
        additionalProperties: true,
        propertiesRequiredByDefault: true,
        defaultNonNullable: false,
        rootTypes: true,
        makePathsEnum: true,
      },
    );
    expect(withExtras.output).toContain("export type");
    expect(() => generateOpenapi(document, { unknown: true })).toThrow(
      "invalid_input",
    );
    expect(() => openapiOptionsSchema.parse({ unknown: true })).toThrow();
  });

  it("rejects invalid decimal precision and oversized input before generation", () => {
    expectProjectError(
      () =>
        generateOpenapi("openapi: 3.1.0\npaths: {}\nvalue: 1.0000000000000001"),
      "precision_loss",
    );
    expectProjectError(
      () => generateOpenapi("x".repeat(32 * 1048576 + 1)),
      "too_large",
    );
  });
});

it("rejects excessive YAML nodes even when the source is below the byte limit", () => {
  const input = `openapi: 3.1.0\npaths: {}\nx-values: [${"0,".repeat(1_000_000)}0]\n`;
  expect(new TextEncoder().encode(input).length).toBeLessThan(32 * 1048576);
  expectProjectError(() => parseOpenapi(input), "too_large");
}, 30_000);

it("limits expanded object depth across individually shallow YAML anchors", () => {
  const source = (depth: number) => {
    const nest = (leaf: string) =>
      "{child: ".repeat(depth) + leaf + "}".repeat(depth);
    return `openapi: 3.1.0\npaths: {}\nx-a: &a ${nest("value")}\nx-b: &b ${nest("*a")}\nx-c: &c ${nest("*b")}\nx-d: ${nest("*c")}\n`;
  };
  const parsed = parseOpenapi(source(31)) as unknown as Record<string, unknown>;
  let leaf = parsed["x-d"];
  for (let index = 0; index < 124; index++)
    leaf = (leaf as Record<string, unknown>).child;
  expect(leaf).toBe("value");
  expectProjectError(() => parseOpenapi(source(32)), "too_deep");
});

it("rejects generated output enlarged by repeated schema aliases", () => {
  const input = `openapi: 3.1.0\npaths: {}\ncomponents:\n  schemas:\n    Base: &base\n      type: string\n      description: ${"a".repeat(2 * 1048576)}\n${Array.from({ length: 64 }, (_, index) => `    Item${index}: *base\n`).join("")}`;
  expect(new TextEncoder().encode(input).length).toBeLessThan(32 * 1048576);
  expect(
    Object.keys(parseOpenapi(input).components?.schemas ?? {}),
  ).toHaveLength(65);
  expectProjectError(() => generateOpenapi(input), "too_large");
}, 30_000);
