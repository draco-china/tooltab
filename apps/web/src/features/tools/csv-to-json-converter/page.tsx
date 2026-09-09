import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Label,
  ListBox,
  Select,
  Skeleton,
} from "@heroui/react";
import { Download, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { CodeEditor } from "@/components/base/code-editor";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import {
  CSV_DEFAULTS,
  CsvJsonError,
  type CsvJsonResult,
  type CsvOptions,
  MAX_INPUT_BYTES,
  MAX_ROWS,
} from "@workspace/tools/encoding/csv-json";
import { runCsvJsonWorker } from "../csv-json/worker-client";

const PREVIEW_LENGTH = 65536;
const DEFAULT_CSV = `name,age,email
Ada,36,ada@example.com
Linus,32,linus@example.com`;
const STORAGE_KEYS = {
  csvText: "tools:csv-to-json-converter:csv-text",
  options: "tools:csv-to-json-converter:options",
} as const;

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
  disabled = false,
  description,
  maxLength = 8192,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "number" | "text";
  min?: number;
  max?: number;
  disabled?: boolean;
  description?: string;
  maxLength?: number;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-label={label}
        type={type}
        min={min}
        max={max}
        step={type === "number" ? 1 : undefined}
        value={Number.isNaN(value) ? "" : value}
        placeholder={placeholder}
        maxLength={type === "text" ? maxLength : undefined}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {description ? <p className="text-sm text-muted">{description}</p> : null}
    </div>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Checkbox
      isSelected={checked}
      onChange={(value) => onChange(value === true)}
    >
      <Checkbox.Content className="flex min-h-11 items-center gap-2 text-sm">
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <span>{label}</span>
      </Checkbox.Content>
    </Checkbox>
  );
}

function OutputSkeleton({ label }: { label: string }) {
  return (
    <section
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid min-h-80 content-start gap-3"
    >
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-4/5" />
    </section>
  );
}

function errorMessage(error: string) {
  if (error === "too_large")
    return m["tools.csvToJsonConverter.localTooLargeError"]();
  if (error === "timeout")
    return m["tools.csvToJsonConverter.localTimeoutError"]();
  if (error === "unsupported")
    return m["tools.csvToJsonConverter.localUnsupportedError"]();
  if (error === "read_failed")
    return m["tools.csvToJsonConverter.localReadError"]();
  if (error === "precision_loss")
    return m["tools.csvToJsonConverter.localPrecisionError"]();
  return m["tools.csvToJsonConverter.localInvalidError"]();
}

function storedOptions(): CsvOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.options);
    if (!raw || raw.length > 65536) return CSV_DEFAULTS;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return CSV_DEFAULTS;
    }
    const value = parsed as Record<string, unknown>;
    const text = (
      key:
        | "headersText"
        | "delimiter"
        | "quoteChar"
        | "escapeChar"
        | "newline"
        | "comments"
        | "delimitersToGuessText"
        | "includeColumns"
        | "ignoreColumns",
    ) =>
      typeof value[key] === "string"
        ? (value[key] as string)
        : CSV_DEFAULTS[key];
    const flag = (key: "noHeader" | "trim" | "checkType" | "fastMode") =>
      typeof value[key] === "boolean"
        ? (value[key] as boolean)
        : CSV_DEFAULTS[key];
    const count = (
      key: "preview" | "skipFirstNLines" | "indentSize",
      max: number,
    ) =>
      Number.isInteger(value[key]) &&
      Number(value[key]) >= 0 &&
      Number(value[key]) <= max
        ? Number(value[key])
        : CSV_DEFAULTS[key];
    return {
      noHeader: flag("noHeader"),
      headersText: text("headersText"),
      delimiter: text("delimiter"),
      quoteChar: text("quoteChar"),
      trim: flag("trim"),
      checkType: flag("checkType"),
      skipEmptyLines: ["none", "true", "greedy"].includes(
        String(value.skipEmptyLines),
      )
        ? (value.skipEmptyLines as CsvOptions["skipEmptyLines"])
        : CSV_DEFAULTS.skipEmptyLines,
      escapeChar: text("escapeChar"),
      newline: text("newline"),
      preview: count("preview", MAX_ROWS),
      comments: text("comments"),
      fastMode: flag("fastMode"),
      skipFirstNLines: count("skipFirstNLines", MAX_ROWS),
      delimitersToGuessText: text("delimitersToGuessText"),
      includeColumns: text("includeColumns"),
      ignoreColumns: text("ignoreColumns"),
      indentSize: count("indentSize", 8),
    };
  } catch {
    return CSV_DEFAULTS;
  }
}

function CsvToJsonConverterToolContent() {
  const id = useId();
  const [input, setInput] = useState(DEFAULT_CSV);
  const [options, setOptions] = useState<CsvOptions>(CSV_DEFAULTS);
  const [result, setResult] = useState<CsvJsonResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [version, setVersion] = useState(0);
  const revision = useRef(0);
  const task = useRef<AbortController | null>(null);
  const reader = useRef<FileReader | null>(null);
  const downloadUrl = useRef("");

  function revokeDownload() {
    if (!downloadUrl.current) return;
    URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = "";
  }

  function invalidate() {
    revision.current += 1;
    task.current?.abort();
    task.current = null;
    reader.current?.abort();
    reader.current = null;
    revokeDownload();
    setResult(null);
    setBusy(false);
    setError("");
  }

  function updateInput(value: string) {
    invalidate();
    setInput(value);
    setFileName("");
  }

  function updateOption<Key extends keyof CsvOptions>(
    key: Key,
    value: CsvOptions[Key],
  ) {
    invalidate();
    setOptions((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    try {
      const storedInput = localStorage.getItem(STORAGE_KEYS.csvText);
      if (storedInput !== null && storedInput.length <= MAX_INPUT_BYTES) {
        setInput(storedInput);
      }
      setOptions(storedOptions());
    } catch {
      // Storage is an enhancement; local conversion must keep working.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.csvText, input);
      localStorage.setItem(STORAGE_KEYS.options, JSON.stringify(options));
    } catch {
      // Conversion remains available when private browsing blocks storage.
    }
  }, [hydrated, input, options]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version reruns conversion after importing identical content; revokeDownload only reads a stable ref.
  useEffect(() => {
    const current = ++revision.current;
    const controller = new AbortController();
    task.current = controller;
    revokeDownload();
    setResult(null);
    setError("");
    if (!input.trim()) {
      setBusy(false);
      return () => controller.abort();
    }
    setBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const next = await runCsvJsonWorker(
          { kind: "csv-to-json", input, options },
          controller.signal,
        );
        if (controller.signal.aborted || current !== revision.current) return;
        const url = URL.createObjectURL(
          new Blob([next.output], {
            type: "application/json;charset=utf-8",
          }),
        );
        downloadUrl.current = url;
        setResult(next);
      } catch (cause) {
        if (controller.signal.aborted || current !== revision.current) return;
        setError(cause instanceof CsvJsonError ? cause.code : "invalid_input");
      } finally {
        if (!controller.signal.aborted && current === revision.current) {
          task.current = null;
          setBusy(false);
        }
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [input, options, version]);

  useEffect(
    () => () => {
      revision.current += 1;
      task.current?.abort();
      reader.current?.abort();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    },
    [],
  );

  function importFile(file: File) {
    invalidate();
    const current = revision.current;
    if (file.size > MAX_INPUT_BYTES) {
      setError("too_large");
      return;
    }
    const nextReader = new FileReader();
    reader.current = nextReader;
    setBusy(true);
    nextReader.onerror = () => {
      if (current !== revision.current) return;
      reader.current = null;
      setError("read_failed");
      setBusy(false);
    };
    nextReader.onload = () => {
      if (current !== revision.current) return;
      reader.current = null;
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          nextReader.result as ArrayBuffer,
        );
        setInput(text);
        setFileName(file.name);
        setVersion((value) => value + 1);
        setBusy(false);
      } catch {
        setError("read_failed");
        setBusy(false);
      }
    };
    nextReader.readAsArrayBuffer(file);
  }

  const output = result?.output ?? "";

  return (
    <div
      className="flex min-w-0 flex-col gap-6 **:data-[slot=input]:min-h-11"
      data-tool="csv-to-json-converter"
    >
      <div className="grid min-w-0 gap-6 xl:grid-cols-2" data-tool-panels>
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-field-border bg-(--field-background) shadow-field">
          <div className="relative">
            <CodeEditor
              embedded
              title={m["tools.csvToJsonConverter.csvLabel"]()}
              description={m["tools.csvToJsonConverter.csvDescription"]()}
              aria-label={m["tools.csvToJsonConverter.csvLabel"]()}
              aria-describedby={error ? `${id}-error` : undefined}
              aria-invalid={Boolean(error)}
              language="plaintext"
              modelPath="tooltab://csv-json/csv-to-json.csv"
              value={input.slice(0, PREVIEW_LENGTH)}
              readOnly={input.length > PREVIEW_LENGTH}
              onChange={updateInput}
              height={320}
            />
            {!input ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-s-4 top-16 z-10 font-mono text-sm text-muted"
              >
                {m["tools.csvToJsonConverter.csvPlaceholder"]()}
              </span>
            ) : null}
          </div>
          <div className="border-t border-separator p-3">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              description={m["tools.csvToJsonConverter.localFileDescription"]()}
              accept={[".csv", ".txt", "text/csv", "text/plain"]}
              fileName={fileName}
              onSelect={importFile}
            />
          </div>
          <section
            aria-labelledby={`${id}-options`}
            className="grid gap-4 border-t border-separator p-3"
          >
            <div>
              <h2
                id={`${id}-options`}
                className="text-sm font-medium text-foreground"
              >
                {m["shared.jsonSchemaTools.options"]()}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {m["tools.csvToJsonConverter.optionsDescription"]()}
              </p>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <CheckField
                  label={m["tools.csvToJsonConverter.noHeaderLabel"]()}
                  checked={options.noHeader}
                  onChange={(value) => updateOption("noHeader", value)}
                />
                <TextField
                  id={`${id}-headers`}
                  label={m["tools.csvToJsonConverter.headersLabel"]()}
                  value={options.headersText}
                  disabled={!options.noHeader}
                  placeholder={m[
                    "tools.csvToJsonConverter.headersPlaceholder"
                  ]()}
                  onChange={(value) => updateOption("headersText", value)}
                />
                <TextField
                  id={`${id}-delimiter`}
                  label={m["shared.csvJson.delimiter"]()}
                  value={options.delimiter}
                  placeholder=","
                  onChange={(value) => updateOption("delimiter", value)}
                />
                <TextField
                  id={`${id}-newline`}
                  label={m["shared.csvJson.newline"]()}
                  value={options.newline}
                  placeholder="auto"
                  onChange={(value) => updateOption("newline", value)}
                />
                <TextField
                  id={`${id}-quote`}
                  label={m["tools.csvToJsonConverter.quoteLabel"]()}
                  value={options.quoteChar}
                  placeholder={'"'}
                  maxLength={1}
                  onChange={(value) => updateOption("quoteChar", value)}
                />
                <TextField
                  id={`${id}-escape`}
                  label={m["shared.csvJson.escape"]()}
                  value={options.escapeChar}
                  placeholder={'"'}
                  maxLength={1}
                  onChange={(value) => updateOption("escapeChar", value)}
                />
                <Select
                  variant="secondary"
                  aria-label={m[
                    "tools.csvToJsonConverter.skipEmptyLinesLabel"
                  ]()}
                  selectedKey={options.skipEmptyLines}
                  onSelectionChange={(value) =>
                    updateOption(
                      "skipEmptyLines",
                      String(value) as CsvOptions["skipEmptyLines"],
                    )
                  }
                  fullWidth
                >
                  <Label>
                    {m["tools.csvToJsonConverter.skipEmptyLinesLabel"]()}
                  </Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item
                        id="none"
                        textValue={m[
                          "tools.csvToJsonConverter.skipEmptyLinesNoneLabel"
                        ]()}
                      >
                        {m[
                          "tools.csvToJsonConverter.skipEmptyLinesNoneLabel"
                        ]()}
                      </ListBox.Item>
                      <ListBox.Item
                        id="true"
                        textValue={m[
                          "tools.csvToJsonConverter.skipEmptyLinesTrueLabel"
                        ]()}
                      >
                        {m[
                          "tools.csvToJsonConverter.skipEmptyLinesTrueLabel"
                        ]()}
                      </ListBox.Item>
                      <ListBox.Item
                        id="greedy"
                        textValue={m[
                          "tools.csvToJsonConverter.skipEmptyLinesGreedyLabel"
                        ]()}
                      >
                        {m[
                          "tools.csvToJsonConverter.skipEmptyLinesGreedyLabel"
                        ]()}
                      </ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
                <TextField
                  id={`${id}-indent`}
                  label={m["tools.csvToJsonConverter.indentSizeLabel"]()}
                  value={options.indentSize}
                  type="number"
                  min={0}
                  max={8}
                  description={m[
                    "tools.csvToJsonConverter.indentSizeDescription"
                  ]()}
                  onChange={(value) =>
                    updateOption(
                      "indentSize",
                      Math.min(8, Math.max(0, Math.round(Number(value) || 0))),
                    )
                  }
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <CheckField
                  label={m["tools.csvToJsonConverter.trimLabel"]()}
                  checked={options.trim}
                  onChange={(value) => updateOption("trim", value)}
                />
                <CheckField
                  label={m["shared.csvJson.types"]()}
                  checked={options.checkType}
                  onChange={(value) => updateOption("checkType", value)}
                />
                <CheckField
                  label={m["tools.csvToJsonConverter.fastModeLabel"]()}
                  checked={options.fastMode}
                  onChange={(value) => updateOption("fastMode", value)}
                />
              </div>

              <div className="border-t border-separator pt-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    id={`${id}-preview`}
                    label={m["tools.csvToJsonConverter.previewLabel"]()}
                    value={options.preview}
                    type="number"
                    min={0}
                    max={MAX_ROWS}
                    onChange={(value) =>
                      updateOption(
                        "preview",
                        Math.min(
                          MAX_ROWS,
                          Math.max(0, Math.round(Number(value) || 0)),
                        ),
                      )
                    }
                  />
                  <TextField
                    id={`${id}-comments`}
                    label={m["tools.csvToJsonConverter.commentsLabel"]()}
                    value={options.comments}
                    placeholder={m[
                      "tools.csvToJsonConverter.commentsPlaceholder"
                    ]()}
                    onChange={(value) => updateOption("comments", value)}
                  />
                  <TextField
                    id={`${id}-skip-first`}
                    label={m["tools.csvToJsonConverter.skipFirstNlinesLabel"]()}
                    value={options.skipFirstNLines}
                    type="number"
                    min={0}
                    max={MAX_ROWS}
                    onChange={(value) =>
                      updateOption(
                        "skipFirstNLines",
                        Math.min(
                          MAX_ROWS,
                          Math.max(0, Math.round(Number(value) || 0)),
                        ),
                      )
                    }
                  />
                  <TextField
                    id={`${id}-guesses`}
                    label={m[
                      "tools.csvToJsonConverter.delimitersToGuessLabel"
                    ]()}
                    value={options.delimitersToGuessText}
                    placeholder={m[
                      "tools.csvToJsonConverter.delimitersToGuessPlaceholder"
                    ]()}
                    onChange={(value) =>
                      updateOption("delimitersToGuessText", value)
                    }
                  />
                  <TextField
                    id={`${id}-include`}
                    label={m["tools.csvToJsonConverter.includeColumnsLabel"]()}
                    value={options.includeColumns}
                    placeholder={m[
                      "tools.csvToJsonConverter.regexPlaceholder"
                    ]()}
                    onChange={(value) => updateOption("includeColumns", value)}
                  />
                  <TextField
                    id={`${id}-ignore`}
                    label={m["tools.csvToJsonConverter.ignoreColumnsLabel"]()}
                    value={options.ignoreColumns}
                    placeholder={m[
                      "tools.csvToJsonConverter.regexPlaceholder"
                    ]()}
                    onChange={(value) => updateOption("ignoreColumns", value)}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        <CodeBlock
          code={output}
          title={m["tools.csvToJsonConverter.jsonLabel"]()}
          description={m["tools.csvToJsonConverter.jsonDescription"]()}
          language="json"
          copyLabel={m["tools.csvToJsonConverter.jsonCopy"]()}
          copiedLabel={m["common.actions.copied"]()}
          className="h-full"
          maxHeightClassName="min-h-80 max-h-[32rem]"
          previewCode={output.slice(0, PREVIEW_LENGTH)}
          actions={
            <>
              {busy ? (
                <Button size="sm" variant="ghost" onPress={invalidate}>
                  {m["common.actions.cancel"]()}
                </Button>
              ) : null}
              {result && downloadUrl.current ? (
                <a
                  href={downloadUrl.current}
                  download="converted.json"
                  className={buttonVariants({ size: "sm", variant: "primary" })}
                >
                  <Download aria-hidden className="size-4" />
                  {m["tools.csvToJsonConverter.jsonDownload"]()}
                </a>
              ) : (
                <Button size="sm" isDisabled>
                  <Download aria-hidden className="size-4" />
                  {m["tools.csvToJsonConverter.jsonDownload"]()}
                </Button>
              )}
            </>
          }
          statusContent={
            busy ? (
              <OutputSkeleton label={m["common.datauriBusy"]()} />
            ) : error ? (
              <Alert id={`${id}-error`} status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.csvToJsonConverter.invalidCsvLabel"]()}
                  </Alert.Title>
                  <Alert.Description>{errorMessage(error)}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : result ? undefined : (
              <section
                aria-label={m["tools.csvToJsonConverter.jsonLabel"]()}
                className="flex min-h-80 items-center justify-center px-5 text-center text-sm text-muted"
              >
                {m["tools.csvToJsonConverter.jsonEmptyDescription"]()}
              </section>
            )
          }
        />
      </div>

      <ToolArticle>
        <h2>{m["tools.csvToJsonConverter.article.whatTitle"]()}</h2>
        <p>{m["tools.csvToJsonConverter.articleWhatBody"]()}</p>
        <h2>{m["tools.csvToJsonConverter.articleWhereTitle"]()}</h2>
        <ul>
          <li>{m["tools.csvToJsonConverter.articleWhereOne"]()}</li>
          <li>{m["tools.csvToJsonConverter.articleWhereTwo"]()}</li>
          <li>{m["tools.csvToJsonConverter.articleWhereThree"]()}</li>
        </ul>
        <h2>{m["tools.csvToJsonConverter.articleWatchTitle"]()}</h2>
        <ul>
          <li>{m["tools.csvToJsonConverter.articleWatchOne"]()}</li>
          <li>{m["tools.csvToJsonConverter.articleWatchTwo"]()}</li>
          <li>{m["tools.csvToJsonConverter.articleWatchThree"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

export function CsvToJsonConverterTool() {
  return (
    <ToolPage>
      <CsvToJsonConverterToolContent />
    </ToolPage>
  );
}

export default CsvToJsonConverterTool;
