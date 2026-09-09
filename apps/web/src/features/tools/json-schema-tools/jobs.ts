export type SchemaJob =
  | {
      kind: "diff";
      input: string;
      modified: string;
      operations: ("add" | "remove" | "replace")[];
      mode: "paths" | "patch";
    }
  | { kind: "generate"; input: string; options: SchemaOptions }
  | {
      kind: "validate";
      input: string;
      schema: string;
      allErrors: boolean;
      validateFormats: boolean;
    };
export type SchemaResult = {
  kind: SchemaJob["kind"];
  output: string;
  bytes: number;
  count: number;
  valid: boolean | null;
  draft: string | null;
};

import {
  QueryError,
  formatQueryValue,
  parseQueryJson,
} from "@workspace/tools/json/value";
import { diffJsonValues, toJsonPatch } from "@workspace/tools/json/diff";
import { generateJsonSchema } from "@workspace/tools/json/schema-generate";
import {
  type SchemaOptions,
  SchemaToolError,
} from "@workspace/tools/json/schema-contract";
import { validateSchema } from "@workspace/tools/json/schema-validate";
export function executeSchemaTool(job: SchemaJob): SchemaResult {
  try {
    const input = parseQueryJson(job.input);
    let value: unknown,
      count = 0,
      valid: boolean | null = null,
      draft: string | null = null;
    if (job.kind === "diff") {
      const entries = diffJsonValues(
        input,
        parseQueryJson(job.modified),
      ).filter((entry) => job.operations.includes(entry.op));
      count = entries.length;
      value = job.mode === "patch" ? toJsonPatch(entries) : entries;
    } else if (job.kind === "generate") {
      value = generateJsonSchema(input, job.options);
      count = 1;
      draft = job.options.draft;
    } else {
      value = validateSchema(
        parseQueryJson(job.schema),
        input,
        job.allErrors,
        job.validateFormats,
      );
      const checked = value as ReturnType<typeof validateSchema>;
      count = checked.issues.length;
      valid = checked.valid;
      draft = checked.detectedDraft;
    }
    const formatted = formatQueryValue(value);
    return { kind: job.kind, ...formatted, count, valid, draft };
  } catch (error) {
    if (error instanceof QueryError)
      throw new SchemaToolError(
        error.code === "invalid_query" ? "invalid_options" : error.code,
      );
    throw error;
  }
}
