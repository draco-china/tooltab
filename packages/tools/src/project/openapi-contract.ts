import { z } from "zod";
export const openapiOptionsSchema = z.strictObject({
  additionalProperties: z.boolean().default(false),
  defaultNonNullable: z.boolean().default(true),
  propertiesRequiredByDefault: z.boolean().default(false),
  exportType: z.boolean().default(false),
  enum: z.boolean().default(false),
  pathParamsAsTypes: z.boolean().default(false),
  rootTypes: z.boolean().default(false),
  makePathsEnum: z.boolean().default(false),
  generatePathParams: z.boolean().default(false),
  immutable: z.boolean().default(false),
  excludeDeprecated: z.boolean().default(false),
  includeHeader: z.boolean().default(true),
});
export const OPENAPI_INPUT_LIMIT = 32 * 1048576,
  OPENAPI_OUTPUT_LIMIT = 128 * 1048576;
export class ProjectConfigError extends Error {
  constructor(
    public code:
      | "invalid_input"
      | "unsupported_version"
      | "external_ref"
      | "precision_loss"
      | "too_large"
      | "too_deep"
      | "generation_failed"
      | "timeout"
      | "busy"
      | "unsupported"
      | "artifact_required",
    public refs: string[] = [],
  ) {
    super(code);
  }
}

export type OpenapiJob = { input: string; options?: unknown };
export type OpenapiResult = { output: string; bytes: number };
