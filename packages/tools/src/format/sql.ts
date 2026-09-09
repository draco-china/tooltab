import { format } from "sql-formatter";
import { z } from "zod";
import {
  FORMATTER_INPUT_LIMIT,
  FORMATTER_OUTPUT_LIMIT,
  FormatterError,
} from "./contract";
export const sqlDialects = [
  "sql",
  "bigquery",
  "clickhouse",
  "db2",
  "db2i",
  "hive",
  "mariadb",
  "mysql",
  "n1ql",
  "plsql",
  "postgresql",
  "redshift",
  "singlestoredb",
  "snowflake",
  "spark",
  "sqlite",
  "tidb",
  "trino",
  "tsql",
] as const;
const sqlCase = z.enum(["preserve", "upper", "lower"]);
export const sqlOptionsSchema = z.strictObject({
  dialect: z.enum(sqlDialects).default("sql"),
  tabWidth: z.number().int().min(1).max(8).default(2),
  useTabs: z.boolean().default(false),
  linesBetweenQueries: z.number().int().min(1).max(5).default(1),
  expressionWidth: z.number().int().min(20).max(240).default(50),
  keywordCase: sqlCase.default("preserve"),
  dataTypeCase: sqlCase.default("preserve"),
  functionCase: sqlCase.default("preserve"),
});
export const sqlLintSchema = z.strictObject({
  checkSelectStar: z.boolean().default(true),
  checkUnsafeMutation: z.boolean().default(true),
  requireSemicolon: z.boolean().default(true),
  maxLineLength: z.number().int().min(0).max(300).default(100),
  keywordCase: sqlCase.default("preserve"),
});
export type SqlOptions = z.output<typeof sqlOptionsSchema>;
export type SqlLintOptions = z.output<typeof sqlLintSchema>;
export type SqlIssue = {
  code:
    | "parse-error"
    | "no-select-star"
    | "unsafe-update-delete"
    | "missing-semicolon"
    | "max-line-length"
    | "keyword-case-consistency";
  severity: "error" | "warning" | "info";
  message: string;
  line: number;
  column: number;
};

// Lexical masking only, not a SQL parser: preserve offsets while excluding quoted content.
function maskSql(source: string, dialect: SqlOptions["dialect"]) {
  const chunks: string[] = [];
  let cursor = 0;
  // Match the pinned sql-formatter dialects' additional line-comment markers.
  const extraComment =
    dialect === "snowflake"
      ? /\/\/[^\r\n]*|/.source
      : [
            "bigquery",
            "clickhouse",
            "mariadb",
            "mysql",
            "n1ql",
            "singlestoredb",
            "tidb",
          ].includes(dialect)
        ? /#[^\r\n]*|/.source
        : "";
  const quoted = new RegExp(
    extraComment +
      /--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:\]\]|[^\]])*\]|\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/
        .source,
    "g",
  );
  for (let match = quoted.exec(source); match; match = quoted.exec(source)) {
    chunks.push(source.slice(cursor, match.index));
    let end = quoted.lastIndex;
    if (match[0].startsWith("$")) {
      const closing = source.indexOf(match[0], end);
      end = closing < 0 ? source.length : closing + match[0].length;
      quoted.lastIndex = end;
    }
    chunks.push(source.slice(match.index, end).replace(/[^\r\n]/g, " "));
    cursor = end;
  }
  chunks.push(source.slice(cursor));
  return chunks.join("");
}
export function formatAndLintSql(
  input: string,
  optionsInput: z.input<typeof sqlOptionsSchema> = {},
  lintInput: z.input<typeof sqlLintSchema> = {},
) {
  if (typeof input !== "string" || /\p{Cs}/u.test(input))
    throw new FormatterError("invalid_input");
  if (new TextEncoder().encode(input).length > FORMATTER_INPUT_LIMIT)
    throw new FormatterError("too_large");
  const options = sqlOptionsSchema.parse(optionsInput);
  const lint = sqlLintSchema.parse(lintInput);
  let output = "",
    formatError: string | null = null;
  try {
    if (input.trim())
      output = format(input, {
        language: options.dialect,
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        linesBetweenQueries: options.linesBetweenQueries,
        expressionWidth: options.expressionWidth,
        keywordCase: options.keywordCase,
        dataTypeCase: options.dataTypeCase,
        functionCase: options.functionCase,
      });
  } catch (e) {
    // The pinned formatter and parser throw Error; only built-in dialects and
    // validated primitive options reach this call, with no user callbacks.
    formatError = (e as Error).message.slice(0, 16384);
  }
  const issues: SqlIssue[] = [];
  if (!input.trim()) return { output, formatError, issues };
  const starts = [0];
  for (let i = 0; i < input.length; i++)
    if (input[i] === "\n" || (input[i] === "\r" && input[i + 1] !== "\n"))
      starts.push(i + 1);
  const position = (offset: number) => {
    let lo = 0,
      hi = starts.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid;
    }
    return { line: lo + 1, column: offset - starts[lo] + 1 };
  };
  const add = (
    code: SqlIssue["code"],
    severity: SqlIssue["severity"],
    message: string,
    offset: number,
  ) =>
    issues.push({ code, severity, message, ...position(Math.max(0, offset)) });
  if (formatError) {
    const loc = formatError.match(/line (\d+) column (\d+)/i);
    issues.push({
      code: "parse-error",
      severity: "error",
      message: formatError,
      line: loc ? Number(loc[1]) : 1,
      column: loc ? Number(loc[2]) : 1,
    });
  }
  const masked = maskSql(input, options.dialect);
  if (lint.checkSelectStar)
    for (const m of masked.matchAll(/\bselect\s+\*/gi))
      add(
        "no-select-star",
        "warning",
        "Avoid SELECT * in production queries.",
        m.index,
      );
  if (lint.checkUnsafeMutation)
    for (const m of masked.matchAll(/\b(update|delete)\b[^;]*(?:;|$)/gi))
      if (!/\bwhere\b/i.test(m[0]))
        add(
          "unsafe-update-delete",
          "warning",
          `${m[1].toUpperCase()} without WHERE may affect every row.`,
          m.index,
        );
  if (lint.requireSemicolon && !masked.trimEnd().endsWith(";"))
    add(
      "missing-semicolon",
      "info",
      "Consider ending SQL statements with a semicolon.",
      input.length - 1,
    );
  if (lint.maxLineLength > 0)
    for (let i = 0; i < starts.length; i++) {
      let end = i + 1 < starts.length ? starts[i + 1] - 1 : input.length;
      if (end > starts[i] && input[end - 1] === "\r") end--;
      if (end - starts[i] > lint.maxLineLength)
        add(
          "max-line-length",
          "info",
          `Line exceeds ${lint.maxLineLength} characters.`,
          starts[i] + lint.maxLineLength,
        );
    }
  if (lint.keywordCase !== "preserve") {
    let count = 0;
    for (const m of masked.matchAll(
      /\b(select|from|where|group|order|by|having|limit|offset|join|inner|left|right|full|cross|on|insert|into|values|update|set|delete|create|alter|drop|table|with|union|and|or)\b/gi,
    )) {
      const expected =
        lint.keywordCase === "upper" ? m[0].toUpperCase() : m[0].toLowerCase();
      if (m[0] !== expected) {
        add(
          "keyword-case-consistency",
          "info",
          `Keyword should use ${lint.keywordCase} case.`,
          m.index,
        );
        if (++count === 20) break;
      }
    }
  }
  const rank = { error: 0, warning: 1, info: 2 };
  issues.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      a.line - b.line ||
      a.column - b.column ||
      a.code.localeCompare(b.code),
  );
  const bytes = new TextEncoder().encode(output).length;
  if (
    bytes + new TextEncoder().encode(JSON.stringify(issues)).length >
    FORMATTER_OUTPUT_LIMIT
  )
    throw new FormatterError("too_large");
  return { output, formatError, issues };
}
