import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Autocomplete,
  Button,
  Card,
  Input,
  Label,
  Link,
  ListBox,
  SearchField,
  Select,
  Switch,
  TextField,
  useFilter,
} from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { Download, FileCode2, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { CodeEditor } from "@/components/base/code-editor";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  type SqlLintOptions,
  type SqlOptions,
  sqlDialects,
  sqlLintSchema,
  sqlOptionsSchema,
} from "@workspace/tools/format/sql";
import { FORMATTER_INPUT_LIMIT } from "@workspace/tools/format/contract";
import {
  FORMATTER_AUTO_LIMIT,
  FORMATTER_PREVIEW_LIMIT,
  type FormatterResult,
} from "../code-formatters/types";
import { runFormatterWorker } from "../code-formatters/worker-client";

const sqlSample = "SELECT id, label FROM items WHERE id=1 ORDER BY label;";

function Choice({
  label,
  value,
  values,
  onChange,
  searchable = false,
  name,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
  searchable?: boolean;
  name?: string;
}) {
  const id = useId();
  const { contains } = useFilter({ sensitivity: "base" });
  const labels: Record<string, string> = {
    preserve: m["tools.sqlFormatterAndLinter.fmtpreserve"](),
    upper: m["tools.sqlFormatterAndLinter.fmtupper"](),
    lower: m["tools.sqlFormatterAndLinter.fmtlower"](),
  };
  if (searchable)
    return (
      <Autocomplete
        id={id}
        name={name}
        variant="secondary"
        selectedKey={value}
        onSelectionChange={(key) => {
          if (key != null) onChange(String(key));
        }}
        fullWidth
      >
        <Label>{label}</Label>
        <Autocomplete.Trigger className="min-h-11 w-full">
          <Autocomplete.Value />
          <Autocomplete.Indicator />
        </Autocomplete.Trigger>
        <Autocomplete.Popover className="max-h-80">
          <Autocomplete.Filter filter={contains}>
            <SearchField aria-label={label}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={label} />
              </SearchField.Group>
            </SearchField>
            <ListBox className="max-h-64 overflow-y-auto">
              {values.map((item) => (
                <ListBox.Item
                  key={item}
                  id={item}
                  textValue={labels[item] ?? item}
                >
                  {labels[item] ?? item}
                </ListBox.Item>
              ))}
            </ListBox>
          </Autocomplete.Filter>
        </Autocomplete.Popover>
      </Autocomplete>
    );
  return (
    <Select
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key));
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger id={id} className="min-h-11 w-full">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Section>
            {values.map((item) => (
              <ListBox.Item
                key={item}
                id={item}
                textValue={labels[item] ?? item}
              >
                {labels[item] ?? item}
              </ListBox.Item>
            ))}
          </ListBox.Section>
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Switch
      isSelected={value}
      onChange={(selected) => onChange(selected === true)}
    >
      <Switch.Content className="flex min-h-11 items-center gap-2">
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <span>{label}</span>
      </Switch.Content>
    </Switch>
  );
}

function NumberOption({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <TextField fullWidth>
      <Label>{label}</Label>
      <Input
        className="min-h-11 w-full"
        type="number"
        min={min}
        max={max}
        value={Number.isNaN(value) ? "" : value}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </TextField>
  );
}

function Highlighted({ value }: { value: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js produces escaped source plus static span markup, never source HTML.
  return <span dangerouslySetInnerHTML={{ __html: value }} />;
}

function SqlFormatterContent() {
  const [input, setInput] = useState(sqlSample);
  const [sql, setSql] = useState<SqlOptions>(sqlOptionsSchema.parse({}));
  const [lint, setLint] = useState<SqlLintOptions>(sqlLintSchema.parse({}));
  const [result, setResult] = useState<FormatterResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [page, setPage] = useState(0);
  const task = useRef<AbortController | null>(null);
  const reader = useRef<FileReader | null>(null);
  const revision = useRef(0);
  const download = useRef("");

  const invalidate = useCallback(() => {
    revision.current++;
    task.current?.abort();
    reader.current?.abort();
    task.current = null;
    reader.current = null;
    setBusy(false);
    setResult(null);
    setError("");
    setPage(0);
    if (download.current) URL.revokeObjectURL(download.current);
    download.current = "";
    setUrl("");
  }, []);

  const run = useCallback(async () => {
    invalidate();
    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    try {
      const next = await runFormatterWorker(
        { kind: "sql", input, options: sql, lint },
        controller.signal,
      );
      if (task.current !== controller) return;
      setResult(next);
      download.current = URL.createObjectURL(
        new Blob([next.output], { type: "text/plain;charset=utf-8" }),
      );
      setUrl(download.current);
    } catch (cause) {
      if (task.current === controller && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (task.current === controller) {
        task.current = null;
        setBusy(false);
      }
    }
  }, [input, invalidate, lint, sql]);

  useEffect(() => {
    invalidate();
    if (!input || input.length > FORMATTER_AUTO_LIMIT) return;
    const timer = setTimeout(() => void run(), 350);
    return () => clearTimeout(timer);
  }, [input, invalidate, run]);

  useEffect(
    () => () => {
      revision.current++;
      task.current?.abort();
      reader.current?.abort();
      if (download.current) URL.revokeObjectURL(download.current);
    },
    [],
  );

  function resetSample() {
    invalidate();
    setInput(sqlSample);
    setSql(sqlOptionsSchema.parse({}));
    setLint(sqlLintSchema.parse({}));
  }

  function importFile(file: File) {
    invalidate();
    if (file.size > FORMATTER_INPUT_LIMIT) {
      setError("too_large");
      return;
    }
    const active = new FileReader();
    reader.current = active;
    setBusy(true);
    active.onload = () => {
      if (reader.current !== active) return;
      reader.current = null;
      setBusy(false);
      try {
        const source = new TextDecoder("utf8", { fatal: true }).decode(
          active.result as ArrayBuffer,
        );
        const extension = file.name.toLowerCase().split(".").at(-1) ?? "";
        const dialectByExtension: Record<string, SqlOptions["dialect"]> = {
          sql: "sql",
          ddl: "sql",
          dml: "sql",
          mysql: "mysql",
          mariadb: "mariadb",
          pgsql: "postgresql",
          psql: "postgresql",
          sqlite: "sqlite",
          db2: "db2",
          hql: "hive",
          trino: "trino",
          tsql: "tsql",
        };
        const dialect = dialectByExtension[extension];
        if (dialect) setSql((value) => ({ ...value, dialect }));
        setInput(source);
      } catch {
        setError("invalid_input");
      }
    };
    active.onerror = () => {
      if (reader.current === active) {
        reader.current = null;
        setBusy(false);
        setError("read_failed");
      }
    };
    active.readAsArrayBuffer(file);
  }

  const updateSql = (key: keyof SqlOptions, value: string | number | boolean) =>
    setSql((current) => ({ ...current, [key]: value }));
  const updateLint = (
    key: keyof SqlLintOptions,
    value: string | number | boolean,
  ) => setLint((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid min-w-0 gap-6" data-tool-panels>
      <div className="grid items-stretch gap-6 xl:grid-cols-2">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.sqlFormatterAndLinter.fmtinput"]()}
            </Card.Title>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <CodeEditor
              aria-label={m["tools.sqlFormatterAndLinter.fmtinput"]()}
              language="sql"
              modelPath="tooltab://formatter/sql.sql"
              value={input.slice(0, FORMATTER_PREVIEW_LIMIT)}
              readOnly={input.length > FORMATTER_PREVIEW_LIMIT}
              height={320}
              onChange={(value) => {
                invalidate();
                setInput(value);
              }}
            />
            <ToolFilePicker
              label={m["tools.sqlFormatterAndLinter.fmtimport"]()}
              onSelect={importFile}
            />
            {input.length > FORMATTER_AUTO_LIMIT ? (
              <p className="text-sm text-muted">
                {m["tools.sqlFormatterAndLinter.fmtpaused"]()}
              </p>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="text-sm wrap-break-word text-destructive"
              >
                {m["tools.sqlFormatterAndLinter.fmterror"]()}: {error}
              </p>
            ) : null}
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-between gap-3">
            <ToolPanelActionGroup>
              <Button variant="outline" onClick={resetSample}>
                <RotateCcw aria-hidden className="size-4" />
                {m["tools.sqlFormatterAndLinter.fmtsample"]()}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  invalidate();
                  setInput("");
                }}
              >
                <X aria-hidden className="size-4" />
                {m["tools.sqlFormatterAndLinter.fmtclear"]()}
              </Button>
            </ToolPanelActionGroup>
            <ToolPanelActionGroup className="justify-end">
              {busy ? (
                <Button variant="outline" onClick={invalidate}>
                  {m["common.actions.cancel"]()}
                </Button>
              ) : null}
              {input.length > FORMATTER_AUTO_LIMIT ? (
                <Button isDisabled={busy || !input} onClick={() => void run()}>
                  <FileCode2 aria-hidden className="size-4" />
                  {m["tools.sqlFormatterAndLinter.fmtformat"]()}
                </Button>
              ) : null}
            </ToolPanelActionGroup>
          </ToolPanelCardFooter>
        </ToolPanelCard>

        {result ? (
          <div className="grid min-w-0 gap-2">
            <CodeBlock
              code={result.output}
              title={m["tools.sqlFormatterAndLinter.fmtoutput"]()}
              language="SQL"
              copyLabel={m["tools.sqlFormatterAndLinter.fmtcopy"]()}
              maxHeightClassName="min-h-80 max-h-[34rem]"
              actions={
                url ? (
                  <Link
                    href={url}
                    download={result.filename}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    <Download aria-hidden className="size-4" />
                    {m["tools.sqlFormatterAndLinter.fmtdownload"]()}
                  </Link>
                ) : null
              }
            >
              <Highlighted value={result.highlighted} />
            </CodeBlock>
            {result.previewLimited ? (
              <p className="text-sm text-muted">
                {m["tools.sqlFormatterAndLinter.fmtpreview"]()}
              </p>
            ) : null}
          </div>
        ) : (
          <div
            aria-label={m["tools.sqlFormatterAndLinter.fmtoutput"]()}
            role="status"
            className="min-h-80"
          />
        )}
      </div>

      <div className="grid items-stretch gap-6 xl:grid-cols-2">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.sqlFormatterAndLinter.fmtoptions"]()}
            </Card.Title>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Choice
                label={m["tools.sqlFormatterAndLinter.fmtdialect"]()}
                value={sql.dialect}
                values={sqlDialects}
                onChange={(value) => updateSql("dialect", value)}
                searchable
                name="dialect"
              />
              <NumberOption
                label={m["tools.sqlFormatterAndLinter.fmttabwidth"]()}
                value={sql.tabWidth}
                min={1}
                max={8}
                onChange={(value) => updateSql("tabWidth", value)}
              />
              <NumberOption
                label={m["tools.sqlFormatterAndLinter.fmtlines"]()}
                value={sql.linesBetweenQueries}
                min={1}
                max={5}
                onChange={(value) => updateSql("linesBetweenQueries", value)}
              />
              <NumberOption
                label={m["tools.sqlFormatterAndLinter.fmtexpressionwidth"]()}
                value={sql.expressionWidth}
                min={20}
                max={240}
                onChange={(value) => updateSql("expressionWidth", value)}
              />
              <Choice
                label={m["shared.codeFormatters.fmtkeywordcase"]()}
                value={sql.keywordCase}
                values={["preserve", "upper", "lower"]}
                onChange={(value) => updateSql("keywordCase", value)}
              />
              <Choice
                label={m["shared.codeFormatters.fmtdatatypecase"]()}
                value={sql.dataTypeCase}
                values={["preserve", "upper", "lower"]}
                onChange={(value) => updateSql("dataTypeCase", value)}
              />
              <Choice
                label={m["shared.codeFormatters.fmtfunctioncase"]()}
                value={sql.functionCase}
                values={["preserve", "upper", "lower"]}
                onChange={(value) => updateSql("functionCase", value)}
              />
              <Toggle
                label={m["tools.sqlFormatterAndLinter.fmttabs"]()}
                value={sql.useTabs}
                onChange={(value) => updateSql("useTabs", value)}
              />
            </div>
            <div className="border-t border-separator pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Toggle
                  label={m["tools.sqlFormatterAndLinter.fmtselectstar"]()}
                  value={lint.checkSelectStar}
                  onChange={(value) => updateLint("checkSelectStar", value)}
                />
                <Toggle
                  label={m["tools.sqlFormatterAndLinter.fmtmutation"]()}
                  value={lint.checkUnsafeMutation}
                  onChange={(value) => updateLint("checkUnsafeMutation", value)}
                />
                <Toggle
                  label={m["tools.sqlFormatterAndLinter.fmtrequiresemi"]()}
                  value={lint.requireSemicolon}
                  onChange={(value) => updateLint("requireSemicolon", value)}
                />
                <NumberOption
                  label={m["tools.sqlFormatterAndLinter.fmtlinelength"]()}
                  value={lint.maxLineLength}
                  min={0}
                  max={300}
                  onChange={(value) => updateLint("maxLineLength", value)}
                />
                <Choice
                  label={m["tools.sqlFormatterAndLinter.fmtlintcase"]()}
                  value={lint.keywordCase}
                  values={["preserve", "upper", "lower"]}
                  onChange={(value) => updateLint("keywordCase", value)}
                />
              </div>
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.sqlFormatterAndLinter.fmtissues"]()} (
              {result?.issues.length ?? 0})
            </Card.Title>
            <Card.Description>
              {m["tools.sqlFormatterAndLinter.fmtlintnote"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            {!result || result.issues.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center text-center text-sm text-muted">
                {m["tools.sqlFormatterAndLinter.fmtnoissues"]()}
              </div>
            ) : (
              <ul className="grid gap-3 text-sm">
                {result.issues.slice(page * 50, page * 50 + 50).map((issue) => (
                  <li
                    key={`${issue.code}-${issue.line}-${issue.column}`}
                    className="rounded-lg border border-separator p-3 wrap-break-word"
                  >
                    <span className="font-mono">
                      {issue.line}:{issue.column}{" "}
                      {(issue.severity === "error"
                        ? m["common.fmtseverityerror"]
                        : issue.severity === "warning"
                          ? m["common.fmtseveritywarning"]
                          : m["shared.codeFormatters.fmtseverityinfo"])(
                        {},
                      )}{" "}
                      · {issue.code}
                    </span>{" "}
                    {issue.code === "parse-error"
                      ? issue.message
                      : (
                          {
                            "no-select-star":
                              m["shared.codeFormatters.fmtselectadvice"],
                            "unsafe-update-delete":
                              m["shared.codeFormatters.fmtmutationadvice"],
                            "missing-semicolon":
                              m["shared.codeFormatters.fmtsemiadvice"],
                            "max-line-length":
                              m["shared.codeFormatters.fmtlineadvice"],
                            "keyword-case-consistency":
                              m["shared.codeFormatters.fmtcaseadvice"],
                          } as const
                        )[issue.code]({})}
                  </li>
                ))}
              </ul>
            )}
          </ToolPanelCardContent>
          {result && result.issues.length > 50 ? (
            <ToolPanelCardFooter className="items-center justify-end gap-3">
              <Button
                variant="outline"
                isDisabled={page === 0}
                onClick={() => setPage((value) => value - 1)}
                aria-label={m["tools.sqlFormatterAndLinter.fmtprevious"]()}
              >
                ←
              </Button>
              <span>
                {page + 1}/{Math.ceil(result.issues.length / 50)}
              </span>
              <Button
                variant="outline"
                isDisabled={(page + 1) * 50 >= result.issues.length}
                onClick={() => setPage((value) => value + 1)}
                aria-label={m["tools.sqlFormatterAndLinter.fmtnext"]()}
              >
                →
              </Button>
            </ToolPanelCardFooter>
          ) : null}
        </ToolPanelCard>
      </div>
    </div>
  );
}

export function SqlFormatter() {
  return (
    <ToolPage>
      <SqlFormatterContent />
    </ToolPage>
  );
}
