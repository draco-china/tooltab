import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Label,
  Skeleton,
  Tooltip,
} from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { Download, Info, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { CodeEditor } from "@/components/base/code-editor";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import { m } from "@/paraglide/messages.js";
import {
  CsvJsonError,
  type CsvJsonResult,
  JSON_DEFAULTS,
  type JsonOptions,
  MAX_INPUT_BYTES,
} from "@workspace/tools/encoding/csv-json";
import { runCsvJsonWorker } from "../csv-json/worker-client";

const PREVIEW_LENGTH = 65536;
const DEFAULT_JSON = `[
  {
    "name": "Ada",
    "age": 36,
    "email": "ada@example.com"
  },
  {
    "name": "Linus",
    "age": 32,
    "email": "linus@example.com"
  }
]`;

function CheckField({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description?: string;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2">
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
      {description ? (
        <Tooltip>
          <Tooltip.Trigger
            aria-label={description}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted"
          >
            <Info aria-hidden className="size-4" />
          </Tooltip.Trigger>
          <Tooltip.Content>{description}</Tooltip.Content>
        </Tooltip>
      ) : null}
    </div>
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
    return m["tools.jsonToCsvConverter.localTooLargeError"]();
  if (error === "timeout")
    return m["tools.jsonToCsvConverter.localTimeoutError"]();
  if (error === "unsupported")
    return m["tools.jsonToCsvConverter.localUnsupportedError"]();
  if (error === "read_failed")
    return m["tools.csvToJsonConverter.localReadError"]();
  if (error === "precision_loss")
    return m["tools.jsonToCsvConverter.localPrecisionError"]();
  return m["tools.jsonToCsvConverter.localInvalidError"]();
}

function JsonToCsvConverterToolContent() {
  const id = useId();
  const [input, setInput] = useState(DEFAULT_JSON);
  const [options, setOptions] = useState<JsonOptions>(JSON_DEFAULTS);
  const [result, setResult] = useState<CsvJsonResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
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

  function updateOption<Key extends keyof JsonOptions>(
    key: Key,
    value: JsonOptions[Key],
  ) {
    invalidate();
    setOptions((current) => ({ ...current, [key]: value }));
  }

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
          { kind: "json-to-csv", input, options },
          controller.signal,
        );
        if (controller.signal.aborted || current !== revision.current) return;
        const url = URL.createObjectURL(
          new Blob([next.output], { type: "text/csv;charset=utf-8" }),
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
      data-tool="json-to-csv-converter"
    >
      <div className="grid min-w-0 gap-6 xl:grid-cols-2" data-tool-panels>
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-field-border bg-(--field-background) shadow-field">
          <div className="relative">
            <CodeEditor
              embedded
              title={m["tools.csvToJsonConverter.jsonLabel"]()}
              description={m["tools.jsonFormatter.rawJsonDescription"]()}
              aria-label={m["tools.csvToJsonConverter.jsonLabel"]()}
              aria-describedby={error ? `${id}-error` : undefined}
              aria-invalid={Boolean(error)}
              language="json"
              modelPath="tooltab://csv-json/json-to-csv.json"
              value={input.slice(0, PREVIEW_LENGTH)}
              readOnly={input.length > PREVIEW_LENGTH}
              onChange={updateInput}
              height={320}
            />
            {!input ? (
              <p
                aria-hidden
                className="pointer-events-none absolute inset-x-4 top-16 z-10 text-sm text-muted"
              >
                {m["tools.jsonToCsvConverter.jsonPlaceholder"]()}
              </p>
            ) : null}
          </div>
          <div className="border-t border-separator p-3">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              description={m["tools.jsonToCsvConverter.localFileDescription"]()}
              accept={[".json", ".txt", "application/json", "text/plain"]}
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
                {m["tools.jsonToCsvConverter.optionsDescription"]()}
              </p>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid content-start gap-2">
                  <Label htmlFor={`${id}-delimiter`}>
                    {m["shared.csvJson.delimiter"]()}
                  </Label>
                  <Input
                    id={`${id}-delimiter`}
                    aria-label={m["shared.csvJson.delimiter"]()}
                    value={options.delimiter}
                    placeholder=","
                    maxLength={32}
                    onChange={(event) =>
                      updateOption("delimiter", event.currentTarget.value)
                    }
                  />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor={`${id}-quote`}>
                    {m["tools.jsonToCsvConverter.quoteCharLabel"]()}
                  </Label>
                  <Input
                    id={`${id}-quote`}
                    aria-label={m["tools.jsonToCsvConverter.quoteCharLabel"]()}
                    value={options.quoteChar}
                    placeholder={'"'}
                    maxLength={1}
                    onChange={(event) =>
                      updateOption("quoteChar", event.currentTarget.value)
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <CheckField
                  label={m["tools.jsonToCsvConverter.includeHeaderRowLabel"]()}
                  checked={options.includeHeaderRow}
                  onChange={(value) => updateOption("includeHeaderRow", value)}
                />
                <CheckField
                  label={m["tools.jsonToCsvConverter.escapeFormulaeLabel"]()}
                  description={m[
                    "tools.jsonToCsvConverter.escapeFormulaeTooltip"
                  ]()}
                  checked={options.escapeFormulae}
                  onChange={(value) => updateOption("escapeFormulae", value)}
                />
              </div>
            </div>
          </section>
        </div>

        <CodeBlock
          code={output}
          title={m["tools.csvToJsonConverter.csvLabel"]()}
          description={m["tools.jsonToCsvConverter.csvDescription"]()}
          language="plaintext"
          copyLabel={m["tools.jsonToCsvConverter.copyCsvLabel"]()}
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
                  download="converted.csv"
                  className={buttonVariants({ size: "sm", variant: "primary" })}
                >
                  <Download aria-hidden className="size-4" />
                  {m["tools.jsonToCsvConverter.downloadCsvLabel"]()}
                </a>
              ) : (
                <Button size="sm" isDisabled>
                  <Download aria-hidden className="size-4" />
                  {m["tools.jsonToCsvConverter.downloadCsvLabel"]()}
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
                    {m["tools.jmespathTester.invalidJsonLabel"]()}
                  </Alert.Title>
                  <Alert.Description>{errorMessage(error)}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : result ? undefined : (
              <section
                aria-label={m["tools.csvToJsonConverter.csvLabel"]()}
                className="flex min-h-80 items-center justify-center px-5 text-center text-sm text-muted"
              >
                {m["tools.jsonToCsvConverter.csvEmptyDescription"]()}
              </section>
            )
          }
        />
      </div>

      <ToolArticle>
        <h2>{m["tools.csvToJsonConverter.article.whatTitle"]()}</h2>
        <p>{m["tools.jsonToCsvConverter.article.what"]()}</p>
        <h2>{m["tools.currentNetworkTime.article.helpsTitle"]()}</h2>
        <ul>
          <li>{m["tools.jsonToCsvConverter.article.whereOne"]()}</li>
          <li>{m["tools.jsonToCsvConverter.article.whereTwo"]()}</li>
          <li>{m["tools.jsonToCsvConverter.article.whereThree"]()}</li>
        </ul>
        <h2>{m["tools.currentNetworkTime.article.watchTitle"]()}</h2>
        <ul>
          <li>{m["tools.jsonToCsvConverter.article.watchOne"]()}</li>
          <li>{m["tools.jsonToCsvConverter.article.watchTwo"]()}</li>
          <li>{m["tools.jsonToCsvConverter.article.watchThree"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

export function JsonToCsvConverterTool() {
  return (
    <ToolPage>
      <JsonToCsvConverterToolContent />
    </ToolPage>
  );
}
