import type {
  SqlIssue,
  SqlOptions,
  SqlLintOptions,
} from "@workspace/tools/format/sql";
import type { PrettierOptions } from "@workspace/tools/format/prettier-config";

export const FORMATTER_PREVIEW_LIMIT = 100_000;
export const FORMATTER_AUTO_LIMIT = 20_000;
export type FormatterId =
  | "prettier-code-formatter"
  | "sql-formatter-and-linter";
export type FormatterResult = {
  output: string;
  bytes: number;
  filename: string;
  highlighted: string;
  previewLimited: boolean;
  issues: SqlIssue[];
  formatError: string | null;
};
export type FormatterJob =
  | { kind: "prettier"; input: string; options: PrettierOptions }
  | { kind: "sql"; input: string; options: SqlOptions; lint: SqlLintOptions };
