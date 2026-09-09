import Ajv from "ajv";
import Ajv2019 from "ajv/dist/2019";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { SchemaToolError } from "./schema-contract";
export function validateSchema(
  schema: unknown,
  data: unknown,
  allErrors: boolean,
  validateFormats: boolean,
) {
  function safeNumbers(v: unknown, depth = 0) {
    if (depth > 128) throw new SchemaToolError("too_deep");
    if (typeof v === "bigint") throw new SchemaToolError("precision_loss");
    if (v && typeof v === "object")
      for (const value of Object.values(v)) safeNumbers(value, depth + 1);
  }
  safeNumbers(schema);
  safeNumbers(data);
  const uri =
    schema && typeof schema === "object" && !Array.isArray(schema)
      ? (schema as Record<string, unknown>).$schema
      : undefined;
  const draft =
    typeof uri === "string" && uri.includes("draft-07")
      ? "draft-07"
      : typeof uri === "string" && uri.includes("2019-09")
        ? "2019-09"
        : "2020-12";
  const Constructor =
    draft === "draft-07" ? Ajv : draft === "2019-09" ? Ajv2019 : Ajv2020;
  const ajv = new Constructor({
    allErrors,
    validateFormats,
    strict: false,
    ownProperties: true,
    messages: true,
    logger: false,
    code: {
      lines: true,
      process(source) {
        // Ajv8.20.0 emits this increment after every reported issue. Abort before
        // allErrors combinators can allocate an unbounded error list.
        return source
          .replace(
            /^[ \t]*errors\+\+;[ \t]*$/gm,
            'if (++errors > 100000) throw new Error("TOOLTAB_SCHEMA_ISSUE_LIMIT");',
          )
          .replace(
            /^[ \t]*errors \+= [^\n]+;[ \t]*$/gm,
            '$&\nif (errors > 100000) throw new Error("TOOLTAB_SCHEMA_ISSUE_LIMIT");',
          );
      },
    },
  });
  if (validateFormats) addFormats(ajv);
  try {
    const validate = ajv.compile(schema as object);
    const valid = Boolean(validate(data));
    const issues = (validate.errors ?? []).map((error) => ({
      path:
        error.instancePath +
        (typeof error.params.missingProperty === "string"
          ? "/" +
            error.params.missingProperty
              .replaceAll("~", "~0")
              .replaceAll("/", "~1")
          : ""),
      keyword: error.keyword,
      // Built-in Ajv errors include messages under the explicit messages option.
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      message: error.message!,
    }));
    return { valid, detectedDraft: draft, issues };
  } catch (error) {
    if (error instanceof SchemaToolError) throw error;
    if (error instanceof EvalError) throw new SchemaToolError("unsupported");
    if (
      error instanceof Error &&
      error.message === "TOOLTAB_SCHEMA_ISSUE_LIMIT"
    )
      throw new SchemaToolError("too_large");
    throw new SchemaToolError("invalid_schema");
  }
}
