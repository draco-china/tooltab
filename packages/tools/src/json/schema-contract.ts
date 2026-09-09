export class SchemaToolError extends Error {
  constructor(
    public code:
      | "invalid_json"
      | "invalid_options"
      | "invalid_schema"
      | "precision_loss"
      | "too_large"
      | "too_deep"
      | "unsupported"
      | "timeout"
      | "busy"
      | "read_failed",
  ) {
    super(code);
  }
}
export const MAX_SCHEMA_INPUT = 32 * 1024 * 1024,
  MAX_SCHEMA_OUTPUT = 128 * 1024 * 1024;
export type SchemaOptions = {
  draft: "2020-12" | "2019-09" | "draft-07";
  inferRequired: boolean;
  allowAdditionalProperties: boolean;
  detectFormat: boolean;
};
export const schemaDefaults: SchemaOptions = {
  draft: "2020-12",
  inferRequired: true,
  allowAdditionalProperties: true,
  detectFormat: true,
};
