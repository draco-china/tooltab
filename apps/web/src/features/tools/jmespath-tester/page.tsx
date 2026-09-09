import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Label,
  ListBox,
  Select,
  Skeleton,
  TextArea,
} from "@heroui/react";
import { Download, RefreshCcw, Search, TriangleAlert } from "lucide-react";
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
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { runQueryWorker } from "../json-query/worker-client";
import { QueryError, type QueryResult } from "@workspace/tools/json/value";
import { formatQueryValue, parseQueryJson } from "@workspace/tools/json/value";

const DEFAULT_JSON_TEXT = `{
  "people": [
    { "first": "James", "last": "Smith", "age": 32 },
    { "first": "Sarah", "last": "Jones", "age": 27 },
    { "first": "Harry", "last": "Wilson", "age": 42 }
  ],
  "orders": [
    { "id": "A1", "total": 29.99 },
    { "id": "B2", "total": 17.5 }
  ],
  "active": true
}`;
const DEFAULT_QUERY_TEXT = "people[*].last";
const EXAMPLES = [
  [m["tools.jmespathTester.exampleLastNamesLabel"], "people[*].last"],
  [m["tools.jmespathTester.exampleAdultsLabel"], "people[?age >= `30`].first"],
  [m["tools.jmespathTester.exampleOrdersLabel"], "orders[?total > `20`].id"],
] as const;

type Evaluation =
  | { state: "empty" }
  | { state: "loading" }
  | { state: "error"; kind: "json" | "query"; error: string }
  | { state: "ready"; result: QueryResult };

function queryErrorLabel(kind: "json" | "query", code: string) {
  if (kind === "json") {
    return code === "invalid_json"
      ? m["tools.jmespathTester.invalidJsonLabel"]()
      : m["tools.jmespathTester.jsonInputErrorLabel"]();
  }
  return code === "invalid_query"
    ? m["tools.jmespathTester.invalidQueryLabel"]()
    : m["tools.jmespathTester.queryErrorLabel"]();
}

function queryErrorDescription(code: string) {
  switch (code) {
    case "invalid_json":
      return m["tools.jmespathTester.invalidJsonError"]();
    case "invalid_query":
      return m["tools.jmespathTester.invalidQueryError"]();
    case "precision_loss":
      return m["tools.jmespathTester.precisionLossError"]();
    case "too_large":
      return m["tools.jmespathTester.tooLargeError"]();
    case "too_deep":
      return m["tools.jmespathTester.tooDeepError"]();
    case "unsupported":
      return m["tools.jmespathTester.unsupportedError"]();
    case "timeout":
      return m["tools.jmespathTester.timeoutError"]();
    case "busy":
      return m["tools.jmespathTester.busyError"]();
    case "read_failed":
      return m["tools.jmespathTester.readFailedError"]();
    default:
      return m["tools.jmespathTester.queryErrorLabel"]();
  }
}

function JmespathTesterPageContent() {
  const [jsonText, setJsonText] = useState(DEFAULT_JSON_TEXT);
  const [queryText, setQueryText] = useState(DEFAULT_QUERY_TEXT);
  const [selectedExample, setSelectedExample] = useState(DEFAULT_QUERY_TEXT);
  const [evaluation, setEvaluation] = useState<Evaluation>({
    state: "loading",
  });
  const [downloadUrl, setDownloadUrl] = useState("");
  const readerRef = useRef<FileReader | null>(null);
  const deferredJson = useDeferredValue(jsonText);
  const deferredQuery = useDeferredValue(queryText);
  const options = EXAMPLES.map(([label, value]) => ({ label: label(), value }));

  useEffect(() => {
    if (!deferredJson.trim() || !deferredQuery.trim()) {
      setEvaluation({ state: "empty" });
      return;
    }
    const controller = new AbortController();
    setEvaluation({ state: "loading" });
    void (async () =>
      runQueryWorker(
        { kind: "jmespath", input: deferredJson, query: deferredQuery },
        controller.signal,
      ))()
      .then((result) => {
        if (!controller.signal.aborted)
          setEvaluation({ state: "ready", result });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const code = error instanceof QueryError ? error.code : "invalid_query";
        setEvaluation({
          state: "error",
          kind: code === "invalid_json" ? "json" : "query",
          error: code,
        });
      });
    return () => controller.abort();
  }, [deferredJson, deferredQuery]);

  useEffect(() => {
    if (evaluation.state !== "ready") {
      setDownloadUrl("");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([evaluation.result.output], {
        type: "application/json;charset=utf-8",
      }),
    );
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [evaluation]);

  useEffect(
    () => () => {
      readerRef.current?.abort();
      readerRef.current = null;
    },
    [],
  );

  function useSample() {
    startTransition(() => {
      setJsonText(DEFAULT_JSON_TEXT);
      setQueryText(DEFAULT_QUERY_TEXT);
      setSelectedExample(DEFAULT_QUERY_TEXT);
    });
  }

  function clearAll() {
    readerRef.current?.abort();
    readerRef.current = null;
    startTransition(() => {
      setJsonText("");
      setQueryText("");
      setSelectedExample("");
    });
  }

  function importFile(file: File) {
    readerRef.current?.abort();
    const reader = new FileReader();
    readerRef.current = reader;
    reader.onload = () => {
      if (readerRef.current !== reader) return;
      setJsonText(String(reader.result ?? ""));
      readerRef.current = null;
    };
    reader.onerror = () => {
      if (readerRef.current !== reader) return;
      setEvaluation({ state: "error", kind: "json", error: "read_failed" });
      readerRef.current = null;
    };
    reader.readAsText(file, "utf-8");
  }

  function formatJson() {
    try {
      setJsonText(formatQueryValue(parseQueryJson(jsonText)).output);
    } catch {
      setEvaluation({ state: "error", kind: "json", error: "invalid_json" });
    }
  }

  const errorLabel =
    evaluation.state === "error"
      ? queryErrorLabel(evaluation.kind, evaluation.error)
      : "";
  const errorDescription =
    evaluation.state === "error" ? queryErrorDescription(evaluation.error) : "";

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
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onPress={useSample}>
                {m["common.curlSample"]()}
              </Button>
              <Button size="sm" variant="ghost" onPress={clearAll}>
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.curlClear"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <CodeEditor
              aria-label={m["tools.csvToJsonConverter.jsonLabel"]()}
              aria-invalid={
                evaluation.state === "error" && evaluation.kind === "json"
              }
              language="json"
              modelPath="tooltab://jmespath/input.json"
              value={jsonText}
              height={320}
              onChange={setJsonText}
            />
          </ToolPanelCardContent>
          <Card.Footer className="flex flex-wrap justify-start gap-2 border-t border-separator px-4 py-3">
            <Button size="sm" variant="ghost" onPress={formatJson}>
              {m["tools.jmespathTester.formatJsonLabel"]()}
            </Button>
          </Card.Footer>
          <div className="border-t border-separator px-4 py-3">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              accept={[".json", ".txt", "application/json", "text/plain"]}
              onSelect={importFile}
            />
          </div>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.jmespathTester.queryLabel"]()}</Card.Title>
            <Card.Description>
              {m["tools.jmespathTester.queryDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <div className="grid gap-2">
              <Label>{m["tools.jmespathTester.queryLabel"]()}</Label>
              <TextArea
                aria-label={m["tools.jmespathTester.queryLabel"]()}
                aria-invalid={
                  evaluation.state === "error" && evaluation.kind === "query"
                }
                value={queryText}
                placeholder={m["tools.jmespathTester.queryPlaceholder"]()}
                className="min-h-32 resize-y font-mono text-sm"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setQueryText(value);
                  setSelectedExample(
                    options.some((option) => option.value === value)
                      ? value
                      : "",
                  );
                }}
              />
            </div>
            <Select
              variant="secondary"
              selectedKey={selectedExample || null}
              onSelectionChange={(key) => {
                if (typeof key !== "string") return;
                setQueryText(key);
                setSelectedExample(key);
              }}
            >
              <Label>{m["tools.jmespathTester.examplesLabel"]()}</Label>
              <Select.Trigger className="w-full">
                <Select.Value>
                  {m["tools.jmespathTester.examplesPlaceholder"]()}
                </Select.Value>
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {options.map((option) => (
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
          <Card.Footer className="border-t border-separator px-4 py-3">
            <ToolCopyButton
              value={queryText}
              copyLabel={m["tools.jmespathTester.copyQueryLabel"]()}
              copiedLabel={m["common.actions.copied"]()}
              variant="ghost"
            />
          </Card.Footer>
        </ToolPanelCard>
      </div>

      <ToolPanelCard>
        <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.jmespathTester.resultDescription"]()}
            </Card.Description>
          </div>
          <ToolPanelActionGroup className="shrink-0 sm:justify-end">
            {downloadUrl ? (
              <a
                href={downloadUrl}
                download="jmespath-results.json"
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
            <div className="grid min-h-80 gap-3">
              <Skeleton className="h-5 w-32 rounded-lg" />
              <Skeleton className="h-4 w-full rounded-lg" />
              <Skeleton className="h-4 w-4/5 rounded-lg" />
              <Skeleton className="h-4 w-2/3 rounded-lg" />
            </div>
          ) : evaluation.state === "error" ? (
            <Alert
              status="danger"
              role="alert"
              className="min-h-80 content-start"
            >
              <Alert.Indicator>
                <TriangleAlert aria-hidden className="size-4" />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Title>{errorLabel}</Alert.Title>
                <Alert.Description>{errorDescription}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : evaluation.state === "ready" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Chip size="sm" variant="secondary">
                  {m["tools.jmespathTester.resultCountLabel"]({
                    count: String(evaluation.result.count),
                  })}
                </Chip>
                {evaluation.result.count === 0 ? (
                  <p className="text-sm text-muted">
                    {m["tools.jmespathTester.noResultsLabel"]()}
                  </p>
                ) : null}
              </div>
              <CodeBlock
                code={evaluation.result.output}
                previewCode={evaluation.result.output.slice(0, 100000)}
                title={m["common.passresultstitle"]()}
                language="json"
                copyLabel={m["common.actions.copyResult"]()}
                copiedLabel={m["common.actions.copied"]()}
                maxHeightClassName="min-h-80 max-h-[36rem]"
              />
            </>
          ) : (
            <div className="grid min-h-80 place-items-center rounded-xl border border-border px-6 py-10 text-center">
              <div className="grid max-w-sm justify-items-center gap-2">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-default">
                  <Search aria-hidden className="size-5 text-muted" />
                </span>
                <p className="text-sm text-muted">
                  {m["tools.jmespathTester.resultEmptyDescription"]()}
                </p>
              </div>
            </div>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["tools.jmespathTester.articleWhatTitle"]()}</h2>
        <p>{m["tools.jmespathTester.articleWhatBody"]()}</p>
        <h2>{m["tools.dockerRunToComposeConverter.article.whenTitle"]()}</h2>
        <p>{m["tools.jmespathTester.articleWhenBody"]()}</p>
        <h2>{m["tools.jmespathTester.articleExpectTitle"]()}</h2>
        <p>{m["tools.jmespathTester.articleExpectBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export function JmespathTesterPage() {
  return (
    <ToolPage>
      <JmespathTesterPageContent />
    </ToolPage>
  );
}
