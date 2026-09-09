import { SchemaToolError } from "./schema-contract";
import formats from "ajv-formats";

// Adapted from InBrowserApp fixed snapshot c1a30774a8fd459377deb1b466d689ffeb8a8ba5.
export type JsonSchemaDraft = "2020-12" | "2019-09" | "draft-07";

interface JsonSchemaGenerateOptions {
  draft?: JsonSchemaDraft;
  inferRequired?: boolean;
  allowAdditionalProperties?: boolean;
  detectFormat?: boolean;
}

type SchemaObject = Record<string, unknown>;

const DRAFT_SCHEMA_IDS: Record<JsonSchemaDraft, string> = {
  "2020-12": "https://json-schema.org/draft/2020-12/schema",
  "2019-09": "https://json-schema.org/draft/2019-09/schema",
  "draft-07": "http://json-schema.org/draft-07/schema",
};

function generateJsonSchema(
  data: unknown,
  options: JsonSchemaGenerateOptions = {},
): SchemaObject {
  const draft = options.draft ?? "2020-12";
  const schema = buildSchema(data, options, 0);

  return {
    $schema: DRAFT_SCHEMA_IDS[draft],
    ...schema,
  };
}

function buildSchema(
  data: unknown,
  options: JsonSchemaGenerateOptions,
  depth: number,
): SchemaObject {
  if (depth > 128) throw new SchemaToolError("too_deep");
  if (data === null) {
    return { type: "null" };
  }

  if (Array.isArray(data)) {
    return buildArraySchema(data, options, depth);
  }

  switch (typeof data) {
    case "string":
      return buildStringSchema(data, options);
    case "bigint":
      return { type: "integer" };
    case "number":
      return { type: Number.isInteger(data) ? "integer" : "number" };
    case "boolean":
      return { type: "boolean" };
    case "object":
      return buildObjectSchema(data as Record<string, unknown>, options, depth);
    default:
      return {};
  }
}

function buildStringSchema(
  value: string,
  options: JsonSchemaGenerateOptions,
): SchemaObject {
  const schema: SchemaObject = { type: "string" };

  if (options.detectFormat !== false) {
    const format = detectStringFormat(value);
    if (format) {
      schema.format = format;
    }
  }

  return schema;
}

function buildArraySchema(
  values: unknown[],
  options: JsonSchemaGenerateOptions,
  depth: number,
): SchemaObject {
  if (values.length === 0) {
    return { type: "array", items: {} };
  }

  const items = Array.from(values, (value) =>
    buildSchema(value, options, depth + 1),
  );

  return {
    type: "array",
    items: mergeSchemas(items, options),
  };
}

function buildObjectSchema(
  value: Record<string, unknown>,
  options: JsonSchemaGenerateOptions,
  depth: number,
): SchemaObject {
  const properties: Record<string, SchemaObject> = Object.create(null);
  const keys = Object.keys(value);

  for (const key of keys) {
    properties[key] = buildSchema(value[key], options, depth + 1);
  }

  const schema: SchemaObject = {
    type: "object",
    properties,
  };

  if (options.inferRequired !== false && keys.length > 0) {
    schema.required = keys;
  }

  if (options.allowAdditionalProperties === false) {
    schema.additionalProperties = false;
  }

  return schema;
}

function mergeSchemas(
  schemas: SchemaObject[],
  options: JsonSchemaGenerateOptions,
): SchemaObject {
  const uniqueSchemas = dedupeSchemas(schemas);

  if (uniqueSchemas.length === 1) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    return uniqueSchemas[0]!;
  }

  const types = uniqueSchemas.map(getSchemaType);

  if (types.every((type) => type === "object")) {
    return mergeObjectSchemas(uniqueSchemas, options);
  }

  if (types.every((type) => type === "array")) {
    return mergeArraySchemas(uniqueSchemas, options);
  }

  if (types.every((type) => type === "number" || type === "integer")) {
    return { type: "number" };
  }

  if (types.every((type) => type === "string")) {
    return { type: "string" };
  }

  return { anyOf: uniqueSchemas };
}

function mergeObjectSchemas(
  schemas: SchemaObject[],
  options: JsonSchemaGenerateOptions,
): SchemaObject {
  const propertyMap = new Map<string, SchemaObject[]>();
  const propertyOrder: string[] = [];
  const requiredSets: Set<string>[] = [];

  for (const schema of schemas) {
    const properties = schema.properties as Record<string, SchemaObject>;

    for (const key of Object.keys(properties)) {
      if (!propertyMap.has(key)) {
        propertyMap.set(key, []);
        propertyOrder.push(key);
      }

      propertyMap.get(key)?.push(properties[key]);
    }

    if (options.inferRequired !== false) {
      const required = Array.isArray(schema.required)
        ? schema.required.filter(
            (item): item is string => typeof item === "string",
          )
        : Object.keys(properties);
      requiredSets.push(new Set(required));
    }
  }

  const mergedProperties: Record<string, SchemaObject> = Object.create(null);

  for (const key of propertyOrder) {
    // propertyOrder only records keys after their entry is created in propertyMap.
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    mergedProperties[key] = mergeSchemas(propertyMap.get(key)!, options);
  }

  const mergedSchema: SchemaObject = {
    type: "object",
    properties: mergedProperties,
  };

  if (options.inferRequired !== false && requiredSets.length > 0) {
    const required = propertyOrder.filter((key) =>
      requiredSets.every((requiredSet) => requiredSet.has(key)),
    );

    if (required.length > 0) {
      mergedSchema.required = required;
    }
  }

  if (options.allowAdditionalProperties === false) {
    mergedSchema.additionalProperties = false;
  }

  return mergedSchema;
}

function mergeArraySchemas(
  schemas: SchemaObject[],
  options: JsonSchemaGenerateOptions,
): SchemaObject {
  const itemSchemas = schemas.map((schema) => schema.items as SchemaObject);

  return {
    type: "array",
    items: mergeSchemas(itemSchemas, options),
  };
}

function getSchemaType(schema: SchemaObject): string {
  return typeof schema.type === "string" ? schema.type : "";
}

function dedupeSchemas(schemas: SchemaObject[]): SchemaObject[] {
  const seen = new Map<string, SchemaObject>();

  for (const schema of schemas) {
    const key = stableStringify(schema);
    if (!seen.has(key)) {
      seen.set(key, schema);
    }
  }

  return Array.from(seen.values());
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );

    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

// These concrete validator shapes are provided by the pinned ajv-formats full mode.
const emailFormat = formats.get("email") as RegExp;
const dateTimeFormat = formats.get("date-time") as {
  validate: (value: string) => boolean;
};
const uriFormat = formats.get("uri") as (value: string) => boolean;

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const DATE_TIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function detectStringFormat(value: string): string | undefined {
  const trimmed = value.trim();

  if (!trimmed || trimmed !== value) {
    return undefined;
  }

  if (UUID_REGEX.test(trimmed)) {
    return "uuid";
  }

  if (emailFormat.test(value)) {
    return "email";
  }

  if (DATE_TIME_REGEX.test(value) && dateTimeFormat.validate(value)) {
    return "date-time";
  }

  if (isUri(value) && uriFormat(value)) {
    return "uri";
  }

  return undefined;
}

function isUri(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export { generateJsonSchema };
