import { describe, expect, it } from "vitest";
import {
  FORMATTER_INPUT_LIMIT,
  FormatterError,
} from "@workspace/tools/format/contract";
import {
  formatAndLintSql,
  sqlDialects,
  sqlLintSchema,
  sqlOptionsSchema,
} from "@workspace/tools/format/sql";

const defaultSql = sqlOptionsSchema.parse({});
const defaultLint = sqlLintSchema.parse({});

it.each(["\n", "\r\n", "\r"])(
  "preserves diagnostics with %j newlines",
  (newline) => {
    for (const [dialect, marker] of [
      ["sql", "--"],
      ["mysql", "#"],
      ["snowflake", "//"],
    ] as const) {
      const result = formatAndLintSql(
        `SELECT 1; ${marker} ignored${newline}SELECT * FROM t;`,
        { dialect },
      );
      expect(result.formatError).toBeNull();
      expect(result.issues).toEqual([
        expect.objectContaining({ code: "no-select-star", line: 2, column: 1 }),
      ]);
    }
    const bounded = formatAndLintSql(
      `SELECT 123456789012;${newline}SELECT 1;${newline}${newline}`,
      {},
      { maxLineLength: 20 },
    );
    expect(bounded.formatError).toBeNull();
    expect(bounded.issues).toEqual([]);
  },
);

it.each([
  ["tsql", "SELECT id FROM #items;"],
  ["postgresql", "SELECT payload #> '{a}' FROM items;"],
] as const)("does not mask hash syntax in %s", (dialect, input) => {
  const result = formatAndLintSql(input, { dialect });
  expect(result.formatError).toBeNull();
  expect(result.issues).toEqual([]);
});

it.each([
  "bigquery",
  "clickhouse",
  "mariadb",
  "mysql",
  "n1ql",
  "singlestoredb",
  "tidb",
  "snowflake",
] as const)("ignores dialect line-comment SQL in %s", (dialect) => {
  const marker = dialect === "snowflake" ? "//" : "#";
  const result = formatAndLintSql(
    `SELECT 1; ${marker} SELECT * FROM ignored\nSELECT * FROM actual;`,
    { dialect },
  );
  expect(result.formatError).toBeNull();
  expect(result.issues).toEqual([
    expect.objectContaining({ code: "no-select-star", line: 2, column: 1 }),
  ]);
});

function expectCode(action: () => unknown, code: FormatterError["code"]) {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

describe("SQL schema and dialects", () => {
  it("exposes all supported dialects and applies schema defaults", () => {
    expect(sqlDialects).toHaveLength(19);
    expect(defaultSql).toEqual({
      dialect: "sql",
      tabWidth: 2,
      useTabs: false,
      linesBetweenQueries: 1,
      expressionWidth: 50,
      keywordCase: "preserve",
      dataTypeCase: "preserve",
      functionCase: "preserve",
    });
    expect(defaultLint).toEqual({
      checkSelectStar: true,
      checkUnsafeMutation: true,
      requireSemicolon: true,
      maxLineLength: 100,
      keywordCase: "preserve",
    });
  });
  it("formats a real query through every dialect without throwing", () => {
    for (const dialect of sqlDialects) {
      const result = formatAndLintSql("SELECT 1;", { ...defaultSql, dialect });
      expect(result).toEqual({
        output: "SELECT\n  1;",
        formatError: null,
        issues: [],
      });
    }
  });
  it("rejects invalid and unknown schema options", () => {
    expect(() => sqlOptionsSchema.parse({ dialect: "unknown" })).toThrow();
    expect(() => sqlOptionsSchema.parse({ tabWidth: 0 })).toThrow();
    expect(() => sqlOptionsSchema.parse({ extra: true })).toThrow();
    expect(() => sqlLintSchema.parse({ maxLineLength: 301 })).toThrow();
    expect(() => sqlLintSchema.parse({ keywordCase: "mixed" })).toThrow();
    expect(() => sqlLintSchema.parse({ extra: true })).toThrow();
  });
});

describe("SQL formatting and lint diagnostics", () => {
  it("formats empty input without diagnostics", () => {
    expect(formatAndLintSql("", defaultSql, defaultLint)).toEqual({
      output: "",
      formatError: null,
      issues: [],
    });
    expect(formatAndLintSql("   \n", defaultSql, defaultLint).issues).toEqual(
      [],
    );
  });
  it("rejects lone UTF-16 surrogates and input over 32 MiB", () => {
    expectCode(() => formatAndLintSql("\uD800"), "invalid_input");
    expectCode(
      () => formatAndLintSql("x".repeat(FORMATTER_INPUT_LIMIT + 1)),
      "too_large",
    );
  });
  it("masks quoted strings, identifiers, comments, and dollar-quoted text", () => {
    const result = formatAndLintSql(
      "SELECT 'select *', \"select *\", `select *`, [select *], $$select *$$; -- select *\nSELECT * FROM items;",
      { ...defaultSql, dialect: "postgresql" },
      { ...defaultLint, requireSemicolon: false, maxLineLength: 0 },
    );
    expect(
      result.issues.filter((issue) => issue.code === "no-select-star"),
    ).toHaveLength(1);
    expect(
      result.issues.find((issue) => issue.code === "no-select-star"),
    ).toMatchObject({ line: 2, column: 1 });
  });
  it("reports mutation, missing semicolon, and line length at source positions", () => {
    const result = formatAndLintSql(
      "UPDATE accounts SET name = 'x'\nSELECT * FROM accounts",
      defaultSql,
      { ...defaultLint, maxLineLength: 10 },
    );
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsafe-update-delete",
          line: 1,
          column: 1,
        }),
        expect.objectContaining({ code: "no-select-star", line: 2, column: 1 }),
        expect.objectContaining({ code: "missing-semicolon", line: 2 }),
        expect.objectContaining({
          code: "max-line-length",
          line: 1,
          column: 11,
        }),
      ]),
    );
  });
  it("applies keyword case and caps consistency diagnostics at twenty", () => {
    const result = formatAndLintSql(
      `${"select a from t ".repeat(30)};`,
      defaultSql,
      {
        ...defaultLint,
        requireSemicolon: false,
        maxLineLength: 0,
        keywordCase: "upper",
      },
    );
    const keywordIssues = result.issues.filter(
      (issue) => issue.code === "keyword-case-consistency",
    );
    expect(keywordIssues).toHaveLength(20);
    expect(keywordIssues.every((issue) => issue.severity === "info")).toBe(
      true,
    );
  });
  it("returns parser diagnostics with location and severity ordering", () => {
    const result = formatAndLintSql("SELEC @@@", defaultSql, {
      ...defaultLint,
      requireSemicolon: true,
      maxLineLength: 0,
    });
    expect(result.formatError).toEqual(expect.any(String));
    expect(result.issues[0]).toMatchObject({
      code: "parse-error",
      severity: "error",
      line: expect.any(Number),
      column: expect.any(Number),
    });
  });
  it("supports lower keyword case and configurable formatting", () => {
    const result = formatAndLintSql(
      "SELECT ID FROM USERS;",
      { ...defaultSql, keywordCase: "lower", tabWidth: 4, useTabs: true },
      { ...defaultLint, requireSemicolon: false, maxLineLength: 0 },
    );
    expect(result.output).toContain("select");
    expect(result.output).toContain("from");
    expect(result.issues).toEqual([]);
  });
});

describe("SQL independent core boundaries", () => {
  it("validates runtime inputs and options through the public function", () => {
    expectCode(() => formatAndLintSql(null as never), "invalid_input");
    expect(() =>
      formatAndLintSql("SELECT 1;", { dialect: "bad" } as never),
    ).toThrow();
    expect(() =>
      formatAndLintSql("SELECT 1;", {}, { maxLineLength: -1 }),
    ).toThrow();
    expect(formatAndLintSql("SELECT 1;").output).toBe("SELECT\n  1;");
  });
  it("disables each optional diagnostic without changing formatting", () => {
    const input = "SELECT * FROM t; DELETE FROM t";
    const result = formatAndLintSql(
      input,
      {},
      {
        checkSelectStar: false,
        checkUnsafeMutation: false,
        requireSemicolon: false,
        maxLineLength: 0,
      },
    );
    expect(result.formatError).toBeNull();
    expect(result.output).toContain("DELETE FROM");
    expect(result.issues).toEqual([]);
    expect(formatAndLintSql("UPDATE t SET x=1 WHERE id=2;").issues).toEqual([]);
  });
  it("checks lower-case lint independently from formatting case", () => {
    const result = formatAndLintSql(
      "select id FROM t;",
      {},
      { keywordCase: "lower" },
    );
    expect(result.issues).toEqual([
      {
        code: "keyword-case-consistency",
        severity: "info",
        message: "Keyword should use lower case.",
        line: 1,
        column: 11,
      },
    ]);
  });
  it("masks unterminated dollar strings and multiline comments", () => {
    for (const input of [
      "SELECT $tag$select *",
      "/* select *\n select * */ SELECT id FROM t;",
    ]) {
      const result = formatAndLintSql(input, { dialect: "postgresql" });
      expect(
        result.issues.filter((issue) => issue.code === "no-select-star"),
      ).toEqual([]);
    }
  });
  it("preserves structured error details across the application boundary", () => {
    const error = new FormatterError("parse_error", "bad syntax", 2, 7);
    expect(error).toMatchObject({
      name: "FormatterError",
      code: "parse_error",
      message: "bad syntax",
      line: 2,
      column: 7,
    });
    expect(new FormatterError("too_large").message).toBe("too_large");
  });
});

it("limits real output expansion from an indented multiline comment", () => {
  const query = (lines: number) =>
    "SELECT " +
    "(".repeat(128) +
    "/*\n" +
    "x\n".repeat(lines) +
    "*/1" +
    ")".repeat(128) +
    ";";
  const small = formatAndLintSql(
    query(1_000),
    { tabWidth: 8 },
    { maxLineLength: 0 },
  );
  expect(small.formatError).toBeNull();
  expect(small.output.length).toBe(1_169_719);
  const large = query(130_000);
  expect(new TextEncoder().encode(large).length).toBe(260_270);
  expectCode(
    () => formatAndLintSql(large, { tabWidth: 8 }, { maxLineLength: 0 }),
    "too_large",
  );
});

it("orders diagnostics with equal severity and source position by code", () => {
  const result = formatAndLintSql("select", {}, { maxLineLength: 5 });
  expect(result.formatError).toBeNull();
  expect(
    result.issues.map(({ code, severity, line, column }) => ({
      code,
      severity,
      line,
      column,
    })),
  ).toEqual([
    { code: "max-line-length", severity: "info", line: 1, column: 6 },
    { code: "missing-semicolon", severity: "info", line: 1, column: 6 },
  ]);
});

it("bounds actual parser diagnostics and recovers after an incomplete nested expression", () => {
  const input = `SELECT ${"(".repeat(100)}`;
  const failed = formatAndLintSql(input);
  expect(failed.output).toBe("");
  expect(failed.formatError).toHaveLength(16384);
  expect(failed.issues[0]).toMatchObject({
    code: "parse-error",
    severity: "error",
    message: failed.formatError,
    line: 1,
    column: input.length + 1,
  });
  const recovered = formatAndLintSql("SELECT 1;");
  expect(recovered.formatError).toBeNull();
  expect(recovered.output.replace(/\s+/g, " ")).toBe("SELECT 1;");
  expect(recovered.issues).toEqual([]);
});

it("reports deeply nested parser failures without inventing a source location", () => {
  const depth = 3000;
  const input = `SELECT ${"(".repeat(depth)}1${")".repeat(depth)};`;
  const result = formatAndLintSql(input);
  expect(result.output).toBe("");
  expect(result.formatError).toMatch(/call stack/i);
  expect(result.issues).toContainEqual({
    code: "parse-error",
    severity: "error",
    message: result.formatError,
    line: 1,
    column: 1,
  });
}, 30000);
