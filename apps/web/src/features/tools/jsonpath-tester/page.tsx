import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Chip,
  Label,
  ListBox,
  Select,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Download, FileJson2, RefreshCcw, Search } from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { CodeBlock } from "@/components/base/code-block";
import { CodeEditor } from "@/components/base/code-editor";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { runQueryWorker } from "../json-query/worker-client";
import {
  MAX_QUERY_INPUT,
  QueryError,
  type QueryResult,
} from "@workspace/tools/json/value";
import { formatQueryValue, parseQueryJson } from "@workspace/tools/json/value";

const DEFAULT_JSON_TEXT = `{
  "store": {
    "book": [
      {
        "category": "reference",
        "author": "Nigel Rees",
        "title": "Sayings of the Century",
        "price": 8.95
      },
      {
        "category": "fiction",
        "author": "Evelyn Waugh",
        "title": "Sword of Honour",
        "price": 12.99
      },
      {
        "category": "fiction",
        "author": "Herman Melville",
        "title": "Moby Dick",
        "isbn": "0-553-21311-3",
        "price": 8.99
      },
      {
        "category": "fiction",
        "author": "J. R. R. Tolkien",
        "title": "The Lord of the Rings",
        "isbn": "0-395-19395-8",
        "price": 22.99
      }
    ],
    "bicycle": {
      "color": "red",
      "price": 19.95
    }
  }
}`;

const DEFAULT_QUERY_TEXT = "$.store.book[*].author";
const EXAMPLES = [
  [m["tools.jsonpathTester.exampleAuthorsLabel"], DEFAULT_QUERY_TEXT],
  [
    m["tools.jsonpathTester.exampleCheapBooksLabel"],
    "$.store.book[?(@.price < 10)].title",
  ],
  [m["tools.jsonpathTester.exampleBicycleColorLabel"], "$.store.bicycle.color"],
] as const;

type ResultMode = "paths" | "values";
type Evaluation =
  | { state: "empty" }
  | { state: "loading" }
  | { state: "error"; kind: "json" | "query"; detail: string }
  | { state: "ready"; result: QueryResult };

function queryErrorLabel(kind: "json" | "query", code: string) {
  if (kind === "json") {
    return code === "invalid_json"
      ? m["tools.jsonpathTester.invalidJsonLabel"]()
      : m["tools.jsonpathTester.jsonInputErrorLabel"]();
  }
  return code === "invalid_query"
    ? m["tools.jsonpathTester.invalidQueryLabel"]()
    : m["tools.jsonpathTester.queryErrorLabel"]();
}

function queryErrorDescription(code: string) {
  switch (code) {
    case "invalid_json":
      return m["tools.jsonpathTester.invalidJsonError"]();
    case "invalid_query":
      return m["tools.jsonpathTester.invalidQueryError"]();
    case "precision_loss":
      return m["tools.jsonpathTester.precisionLossError"]();
    case "too_large":
      return m["tools.jsonpathTester.tooLargeError"]();
    case "too_deep":
      return m["tools.jsonpathTester.tooDeepError"]();
    case "unsupported":
      return m["tools.jsonpathTester.unsupportedError"]();
    case "timeout":
      return m["tools.jsonpathTester.timeoutError"]();
    case "busy":
      return m["tools.jsonpathTester.busyError"]();
    case "read_failed":
      return m["tools.jsonpathTester.readFailedError"]();
    default:
      return m["tools.jsonpathTester.queryErrorLabel"]();
  }
}

function JsonPathTesterPageContent() {
  const [jsonText, setJsonText] = useState(DEFAULT_JSON_TEXT);
  const [queryText, setQueryText] = useState(DEFAULT_QUERY_TEXT);
  const [resultMode, setResultMode] = useState<ResultMode>("values");
  const [evaluation, setEvaluation] = useState<Evaluation>({
    state: "loading",
  });
  const [downloadUrl, setDownloadUrl] = useState("");
  const deferredJson = useDeferredValue(jsonText);
  const deferredQuery = useDeferredValue(queryText);
  const task = useRef<AbortController | null>(null);
  const reader = useRef<FileReader | null>(null);
  const fileRevision = useRef(0);
  const exampleOptions = EXAMPLES.map(([label, value]) => ({
    label: label(),
    value,
  }));
  const selectedExample = exampleOptions.some(
    (option) => option.value === queryText,
  )
    ? queryText
    : null;
  const activeResult =
    evaluation.state === "ready"
      ? resultMode === "paths"
        ? (evaluation.result.paths ?? "[]")
        : evaluation.result.output
      : "";
  const errorLabel =
    evaluation.state === "error"
      ? queryErrorLabel(evaluation.kind, evaluation.detail)
      : "";
  const errorDescription =
    evaluation.state === "error"
      ? queryErrorDescription(evaluation.detail)
      : "";

  function abortTask() {
    task.current?.abort();
    task.current = null;
  }

  function abortFileRead() {
    const current = reader.current;
    reader.current = null;
    fileRevision.current += 1;
    if (!current) return;
    current.onload = null;
    current.onerror = null;
    current.onabort = null;
    current.abort();
  }

  function updateJson(value: string) {
    abortTask();
    abortFileRead();
    setJsonText(value);
  }

  function updateQuery(value: string) {
    abortTask();
    setQueryText(value.slice(0, 65536));
  }

  useEffect(() => {
    task.current?.abort();
    task.current = null;
    if (!deferredJson.trim() || !deferredQuery.trim()) {
      setEvaluation({ state: "empty" });
      return;
    }
    const controller = new AbortController();
    task.current = controller;
    setEvaluation({ state: "loading" });
    void (async () =>
      runQueryWorker(
        { kind: "jsonpath", input: deferredJson, query: deferredQuery },
        controller.signal,
      ))()
      .then((result) => {
        if (!controller.signal.aborted && task.current === controller) {
          setEvaluation({ state: "ready", result });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || task.current !== controller) return;
        const code = error instanceof QueryError ? error.code : "invalid_query";
        setEvaluation({
          state: "error",
          kind: code === "invalid_json" ? "json" : "query",
          detail: code,
        });
      })
      .finally(() => {
        if (task.current === controller) task.current = null;
      });
    return () => controller.abort();
  }, [deferredJson, deferredQuery]);

  useEffect(() => {
    if (evaluation.state !== "ready") {
      setDownloadUrl("");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([activeResult], { type: "application/json;charset=utf-8" }),
    );
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [activeResult, evaluation.state]);

  useEffect(
    () => () => {
      task.current?.abort();
      task.current = null;
      const current = reader.current;
      reader.current = null;
      fileRevision.current += 1;
      if (!current) return;
      current.onload = null;
      current.onerror = null;
      current.onabort = null;
      current.abort();
    },
    [],
  );

  function useSample() {
    abortTask();
    abortFileRead();
    startTransition(() => {
      setJsonText(DEFAULT_JSON_TEXT);
      setQueryText(DEFAULT_QUERY_TEXT);
      setResultMode("values");
    });
  }

  function clearAll() {
    abortTask();
    abortFileRead();
    startTransition(() => {
      setJsonText("");
      setQueryText("");
      setResultMode("values");
    });
  }

  function formatJson() {
    abortTask();
    abortFileRead();
    try {
      setJsonText(formatQueryValue(parseQueryJson(jsonText)).output);
    } catch (error) {
      const code = error instanceof QueryError ? error.code : "invalid_json";
      setEvaluation({ state: "error", kind: "json", detail: code });
    }
  }

  function importFile(file: File) {
    abortTask();
    abortFileRead();
    const revision = fileRevision.current;
    if (file.size > MAX_QUERY_INPUT) {
      setEvaluation({ state: "error", kind: "json", detail: "too_large" });
      return;
    }
    let current: FileReader;
    try {
      current = new FileReader();
    } catch {
      setEvaluation({ state: "error", kind: "json", detail: "read_failed" });
      return;
    }
    reader.current = current;
    setEvaluation({ state: "loading" });
    current.onload = () => {
      if (reader.current !== current || fileRevision.current !== revision)
        return;
      reader.current = null;
      current.onload = null;
      current.onerror = null;
      current.onabort = null;
      try {
        const value = new TextDecoder("utf-8", { fatal: true }).decode(
          current.result as ArrayBuffer,
        );
        startTransition(() => setJsonText(value));
      } catch {
        setEvaluation({ state: "error", kind: "json", detail: "read_failed" });
      }
    };
    current.onerror = () => {
      if (reader.current !== current || fileRevision.current !== revision)
        return;
      reader.current = null;
      current.onload = null;
      current.onerror = null;
      current.onabort = null;
      setEvaluation({ state: "error", kind: "json", detail: "read_failed" });
    };
    current.onabort = () => {
      if (reader.current === current) reader.current = null;
      current.onload = null;
      current.onerror = null;
      current.onabort = null;
    };
    current.readAsArrayBuffer(file);
  }

  return (
    <div className="grid min-w-0 gap-8">
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <Card.Title>
                {m["tools.csvToJsonConverter.jsonLabel"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.jmespathTester.jsonDescription"]()}
              </Card.Description>
            </div>
            <Button size="sm" variant="ghost" onPress={useSample}>
              <FileJson2 aria-hidden className="size-4" />
              {m["common.curlSample"]()}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <CodeEditor
              aria-label={m["tools.csvToJsonConverter.jsonLabel"]()}
              aria-invalid={
                evaluation.state === "error" && evaluation.kind === "json"
              }
              language="json"
              modelPath="tooltab://jsonpath/input.json"
              value={jsonText.slice(0, 100000)}
              readOnly={jsonText.length > 100000}
              height={360}
              onChange={updateJson}
            />
            {evaluation.state === "error" && evaluation.kind === "json" ? (
              <p role="alert" className="text-sm text-danger">
                {queryErrorLabel("json", evaluation.detail)}: {errorDescription}
              </p>
            ) : null}
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              accept={[".json", ".txt", "application/json", "text/plain"]}
              onSelect={importFile}
            />
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="flex flex-wrap justify-start gap-2">
            <Button size="sm" variant="ghost" onPress={clearAll}>
              <RefreshCcw aria-hidden className="size-4" />
              {m["common.curlClear"]()}
            </Button>
            <Button size="sm" variant="ghost" onPress={formatJson}>
              {m["tools.jmespathTester.formatJsonLabel"]()}
            </Button>
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.jsonpathTester.queryLabel"]()}</Card.Title>
            <Card.Description>
              {m["tools.jsonpathTester.queryDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <div className="grid gap-2">
              <Label>{m["tools.jsonpathTester.queryLabel"]()}</Label>
              <CodeEditor
                aria-label={m["tools.jsonpathTester.queryLabel"]()}
                aria-invalid={
                  evaluation.state === "error" && evaluation.kind === "query"
                }
                language="plaintext"
                modelPath="tooltab://jsonpath/query.txt"
                value={queryText}
                height={144}
                onChange={updateQuery}
              />
              {evaluation.state === "error" && evaluation.kind === "query" ? (
                <p role="alert" className="text-sm text-danger">
                  {queryErrorLabel("query", evaluation.detail)}:{" "}
                  {errorDescription}
                </p>
              ) : null}
            </div>
            <Select
              variant="secondary"
              selectedKey={selectedExample}
              placeholder={m["tools.jsonpathTester.examplesPlaceholder"]()}
              onSelectionChange={(key) => {
                if (typeof key === "string") updateQuery(key);
              }}
            >
              <Label>{m["tools.jmespathTester.examplesLabel"]()}</Label>
              <Select.Trigger className="min-h-11 w-full">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox aria-label={m["tools.jmespathTester.examplesLabel"]()}>
                  {exampleOptions.map((option) => (
                    <ListBox.Item
                      key={option.value}
                      id={option.value}
                      textValue={option.label}
                    >
                      {option.label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="flex justify-start">
            <ToolCopyButton
              value={queryText}
              copyLabel={m["tools.jmespathTester.copyQueryLabel"]()}
              copiedLabel={m["common.actions.copied"]()}
              variant="ghost"
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>

      <ToolPanelCard>
        <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.jsonpathTester.resultDescription"]()}
            </Card.Description>
          </div>
          <ToolPanelActionGroup className="shrink-0 sm:justify-end">
            {downloadUrl ? (
              <a
                href={downloadUrl}
                download={
                  resultMode === "paths"
                    ? "jsonpath-paths.json"
                    : "jsonpath-values.json"
                }
                className={buttonVariants({ size: "sm" })}
              >
                <Download aria-hidden className="size-4" />
                {m["common.httptDownload"]()}
              </a>
            ) : (
              <Button size="sm" isDisabled>
                <Download aria-hidden className="size-4" />
                {m["common.httptDownload"]()}
              </Button>
            )}
          </ToolPanelActionGroup>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          {evaluation.state === "loading" ? (
            <OutputSkeleton label={m["common.passresultstitle"]()} />
          ) : evaluation.state === "ready" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Chip size="sm" variant="secondary">
                    {m["tools.jsonpathTester.matchCountLabel"]({
                      count: String(evaluation.result.count),
                    })}
                  </Chip>
                  {evaluation.result.count === 0 ? (
                    <p className="text-sm text-muted">
                      {m["tools.jsonpathTester.noMatchesLabel"]()}
                    </p>
                  ) : null}
                </div>
                <ToggleButtonGroup
                  selectionMode="single"
                  selectedKeys={new Set([resultMode])}
                  aria-label={m["tools.jsonDiffPath.resultModeLabel"]()}
                  onSelectionChange={(selection) => {
                    const next = [...selection][0];
                    if (next === "values" || next === "paths") {
                      setResultMode(next);
                    }
                  }}
                >
                  <ToggleButton id="values" size="sm">
                    {m["tools.jsonpathTester.valuesTabLabel"]()}
                  </ToggleButton>
                  <ToggleButton id="paths" size="sm">
                    {m["tools.jsonpathTester.pathsTabLabel"]()}
                  </ToggleButton>
                </ToggleButtonGroup>
              </div>
              <CodeBlock
                code={activeResult}
                previewCode={activeResult.slice(0, 100000)}
                title={m["common.passresultstitle"]()}
                className="rounded-none border-x-0 border-b-0"
                language="json"
                copyLabel={m["common.actions.copyResult"]()}
                copiedLabel={m["common.actions.copied"]()}
                maxHeightClassName="min-h-80 max-h-[36rem]"
              />
            </>
          ) : evaluation.state === "error" ? (
            <div
              role="alert"
              className="grid min-h-80 place-items-center rounded-xl border border-danger/40 bg-danger/10 px-6 text-center"
            >
              <div className="grid gap-2">
                <strong className="font-medium text-danger">
                  {errorLabel}
                </strong>
                <span className="text-sm break-all text-danger">
                  {errorDescription}
                </span>
              </div>
            </div>
          ) : (
            <div className="grid min-h-80 place-items-center rounded-xl border border-border px-6 py-10 text-center">
              <div className="grid max-w-sm justify-items-center gap-2">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-default">
                  <Search aria-hidden className="size-5 text-muted" />
                </span>
                <p className="text-sm text-muted">
                  {m["tools.jsonpathTester.resultEmptyDescription"]()}
                </p>
              </div>
            </div>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["shared.cidrTools.cidrParserOverviewTitle"]()}</h2>
        <p>{m["tools.jsonpathTester.articleOverviewBody"]()}</p>
        <h2>{m["tools.dockerRunToComposeConverter.article.whenTitle"]()}</h2>
        <p>{m["tools.jsonpathTester.articleWhenBody"]()}</p>
        <h2>{m["tools.jsonpathTester.articleHowTitle"]()}</h2>
        <p>{m["tools.jsonpathTester.articleHowBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export function JsonPathTesterPage() {
  return (
    <ToolPage>
      <JsonPathTesterPageContent />
    </ToolPage>
  );
}

function OutputSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-80 content-start gap-3 rounded-xl border border-border p-4"
    >
      <Skeleton className="h-5 w-32 rounded-lg" />
      <Skeleton className="h-4 w-full rounded-lg" />
      <Skeleton className="h-4 w-4/5 rounded-lg" />
      <Skeleton className="h-4 w-2/3 rounded-lg" />
    </div>
  );
}
