import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Chip,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  ArrowLeftRight,
  ArrowRight,
  FileJson2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
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
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { getLocale } from "@/paraglide/runtime.js";
import { SchemaToolError } from "@workspace/tools/json/schema-contract";
import type { SchemaResult } from "@/features/tools/json-schema-tools/jobs";
import { runSchemaWorker } from "../json-schema-tools/worker-client";
import { formatQueryValue, parseQueryJson } from "@workspace/tools/json/value";

const ORIGINAL_SAMPLE = `{
  "user": { "id": 1, "name": "Alice", "roles": ["reader", "editor"] },
  "active": true
}`;
const MODIFIED_SAMPLE = `{
  "user": { "id": 1, "name": "Alice Chen", "roles": ["reader", "editor", "admin"] },
  "active": false,
  "region": "us-east-1"
}`;
const ALL_OPERATIONS = ["add", "remove", "replace"] as const;
type Operation = (typeof ALL_OPERATIONS)[number];
type Mode = "paths" | "patch";
type Evaluation =
  | { state: "empty" }
  | { state: "loading" }
  | { state: "error"; source: "original" | "modified"; code: string }
  | { state: "ready"; result: SchemaResult; total: number };

function JsonDiffPathPageContent() {
  const locale = getLocale();
  const [original, setOriginal] = useState(ORIGINAL_SAMPLE);
  const [modified, setModified] = useState(MODIFIED_SAMPLE);
  const [comparisonOriginal, setComparisonOriginal] = useState("");
  const [comparisonModified, setComparisonModified] = useState("");
  const [operations, setOperations] = useState<Operation[]>([
    ...ALL_OPERATIONS,
  ]);
  const [mode, setMode] = useState<Mode>("paths");
  const [pendingLarge, setPendingLarge] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation>({ state: "empty" });
  const [downloadUrl, setDownloadUrl] = useState("");
  const deferredOriginal = useDeferredValue(original);
  const deferredModified = useDeferredValue(modified);
  const taskRef = useRef<AbortController | null>(null);
  const isLarge = original.length + modified.length >= 120_000;

  useEffect(() => {
    if (isLarge) {
      setPendingLarge(
        original !== comparisonOriginal || modified !== comparisonModified,
      );
      return;
    }
    setComparisonOriginal(deferredOriginal);
    setComparisonModified(deferredModified);
    setPendingLarge(false);
  }, [
    comparisonModified,
    comparisonOriginal,
    deferredModified,
    deferredOriginal,
    isLarge,
    modified,
    original,
  ]);

  useEffect(() => {
    taskRef.current?.abort();
    taskRef.current = null;
    if (!comparisonOriginal.trim() || !comparisonModified.trim()) {
      setEvaluation({ state: "empty" });
      return;
    }
    for (const [source, text] of [
      ["original", comparisonOriginal],
      ["modified", comparisonModified],
    ] as const) {
      try {
        parseQueryJson(text);
      } catch (error) {
        setEvaluation({
          state: "error",
          source,
          code: error instanceof SchemaToolError ? error.code : "invalid_json",
        });
        return;
      }
    }
    const controller = new AbortController();
    taskRef.current = controller;
    setEvaluation({ state: "loading" });
    void (async () => {
      try {
        const totalResult = await runSchemaWorker(
          {
            kind: "diff",
            input: comparisonOriginal,
            modified: comparisonModified,
            operations: [...ALL_OPERATIONS],
            mode,
          },
          controller.signal,
        );
        const result =
          operations.length === ALL_OPERATIONS.length
            ? totalResult
            : await runSchemaWorker(
                {
                  kind: "diff",
                  input: comparisonOriginal,
                  modified: comparisonModified,
                  operations,
                  mode,
                },
                controller.signal,
              );
        if (!controller.signal.aborted) {
          setEvaluation({ state: "ready", result, total: totalResult.count });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setEvaluation({
          state: "error",
          source: "original",
          code: error instanceof SchemaToolError ? error.code : "invalid_json",
        });
      } finally {
        if (taskRef.current === controller) taskRef.current = null;
      }
    })();
    return () => controller.abort();
  }, [comparisonModified, comparisonOriginal, mode, operations]);

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
      taskRef.current?.abort();
      taskRef.current = null;
    },
    [],
  );

  function useSample() {
    startTransition(() => {
      setOriginal(ORIGINAL_SAMPLE);
      setModified(MODIFIED_SAMPLE);
      setOperations([...ALL_OPERATIONS]);
      setMode("paths");
    });
  }

  function formatInputs() {
    try {
      setOriginal(formatQueryValue(parseQueryJson(original)).output);
      setModified(formatQueryValue(parseQueryJson(modified)).output);
    } catch {
      // The corresponding editor displays its existing validation error.
    }
  }

  const errorSource = evaluation.state === "error" ? evaluation.source : null;
  const operationLabels = {
    add: m["tools.jsonDiffPath.addLabel"]({}, { locale }),
    remove: m["tools.sitemapXmlGenerator.seoremove"]({}, { locale }),
    replace: m["shared.jsonSchemaTools.replace"]({}, { locale }),
  };

  return (
    <div className="grid min-w-0 gap-8">
      <div
        role="toolbar"
        className="flex flex-wrap items-center gap-2"
        aria-label={m["tools.jsonDiffPath.toolbarLabel"]({}, { locale })}
      >
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setOriginal(modified);
            setModified(original);
          }}
        >
          <ArrowLeftRight aria-hidden className="size-4" />
          {m["shared.dateTools.swap"]({}, { locale })}
        </Button>
        <Button size="sm" variant="ghost" onPress={formatInputs}>
          <Sparkles aria-hidden className="size-4" />
          {m["tools.jmespathTester.formatJsonLabel"]({}, { locale })}
        </Button>
        <Button size="sm" variant="ghost" onPress={useSample}>
          <FileJson2 aria-hidden className="size-4" />
          {m["common.curlSample"]({}, { locale })}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setOriginal("");
            setModified("");
            setOperations([...ALL_OPERATIONS]);
            setMode("paths");
          }}
        >
          <RefreshCcw aria-hidden className="size-4" />
          {m["common.curlClear"]({}, { locale })}
        </Button>
        {pendingLarge ? (
          <Button
            size="sm"
            onPress={() => {
              setComparisonOriginal(original);
              setComparisonModified(modified);
              setPendingLarge(false);
            }}
          >
            <ArrowRight aria-hidden className="size-4" />
            {m["tools.jsonDiffPath.compareNowLabel"]({}, { locale })}
          </Button>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <EditorCard
          label={m["tools.jsonDiffPath.originalJsonLabel"]({}, { locale })}
          description={m["tools.jsonDiffPath.originalJsonDescription"](
            {},
            { locale },
          )}
          value={original}
          invalid={errorSource === "original"}
          error={
            errorSource === "original"
              ? m["tools.jsonDiffPath.invalidOriginalJsonLabel"]({}, { locale })
              : ""
          }
          modelKey="original"
          onChange={setOriginal}
        />
        <EditorCard
          label={m["tools.jsonDiffPath.modifiedJsonLabel"]({}, { locale })}
          description={m["tools.jsonDiffPath.modifiedJsonDescription"](
            {},
            { locale },
          )}
          value={modified}
          invalid={errorSource === "modified"}
          error={
            errorSource === "modified"
              ? m["tools.jsonDiffPath.invalidModifiedJsonLabel"]({}, { locale })
              : ""
          }
          modelKey="modified"
          onChange={setModified}
        />
      </div>

      <ToolPanelCard>
        <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Card.Title>
              {m["tools.jsonDiffPath.resultLabel"]({}, { locale })}
            </Card.Title>
            <Card.Description>
              {m["tools.jsonDiffPath.resultDescription"]({}, { locale })}
            </Card.Description>
          </div>
          <ToolPanelActionGroup className="shrink-0 sm:justify-end">
            {downloadUrl ? (
              <a
                href={downloadUrl}
                download={
                  mode === "paths"
                    ? "json-diff-paths.json"
                    : "json-diff-patch.json"
                }
                className={buttonVariants({ size: "sm" })}
              >
                {m["common.httptDownload"]({}, { locale })}
              </a>
            ) : (
              <Button size="sm" isDisabled>
                {m["common.httptDownload"]({}, { locale })}
              </Button>
            )}
          </ToolPanelActionGroup>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Chip size="sm" variant="secondary">
              {m["tools.jsonDiffPath.showingChangesLabel"](
                {
                  count:
                    evaluation.state === "ready" ? evaluation.result.count : 0,
                  total: evaluation.state === "ready" ? evaluation.total : 0,
                },
                { locale },
              )}
            </Chip>
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid gap-1">
                <span className="text-xs text-muted">
                  {m["tools.jsonDiffPath.filtersLabel"]({}, { locale })}
                </span>
                <ToggleButtonGroup
                  selectionMode="multiple"
                  selectedKeys={new Set(operations)}
                  aria-label={m["tools.jsonDiffPath.filtersLabel"](
                    {},
                    { locale },
                  )}
                  onSelectionChange={(selection) =>
                    setOperations(
                      ALL_OPERATIONS.filter((operation) =>
                        selection.has(operation),
                      ),
                    )
                  }
                >
                  {ALL_OPERATIONS.map((operation) => (
                    <ToggleButton key={operation} id={operation} size="sm">
                      {operationLabels[operation]}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </div>
              <div className="grid gap-1">
                <span className="text-xs text-muted">
                  {m["tools.jsonDiffPath.resultModeLabel"]({}, { locale })}
                </span>
                <ToggleButtonGroup
                  selectionMode="single"
                  selectedKeys={new Set([mode])}
                  aria-label={m["tools.jsonDiffPath.resultModeLabel"](
                    {},
                    { locale },
                  )}
                  onSelectionChange={(selection) => {
                    const next = [...selection][0];
                    if (next === "paths" || next === "patch") setMode(next);
                  }}
                >
                  <ToggleButton id="paths" size="sm">
                    {m["tools.jsonDiffPath.pathsTabLabel"]({}, { locale })}
                  </ToggleButton>
                  <ToggleButton id="patch" size="sm">
                    {m["shared.jsonSchemaTools.patch"]({}, { locale })}
                  </ToggleButton>
                </ToggleButtonGroup>
              </div>
            </div>
          </div>

          {pendingLarge ? (
            <p className="rounded-xl border border-border bg-default/30 p-4 text-sm text-muted">
              {m["tools.jsonDiffPath.largeCompareHint"]({}, { locale })}
            </p>
          ) : null}
          {evaluation.state === "loading" ? (
            <div className="grid min-h-80 gap-3">
              <Skeleton className="h-5 w-40 rounded-lg" />
              <Skeleton className="h-4 w-full rounded-lg" />
              <Skeleton className="h-4 w-4/5 rounded-lg" />
            </div>
          ) : evaluation.state === "ready" ? (
            <>
              {evaluation.result.count === 0 ? (
                <p className="text-sm text-muted">
                  {m["tools.jsonDiffPath.noChangesLabel"]({}, { locale })}
                </p>
              ) : null}
              <CodeBlock
                code={evaluation.result.output}
                previewCode={evaluation.result.output.slice(0, 100000)}
                title={
                  mode === "paths"
                    ? m["tools.jsonDiffPath.pathsTabLabel"]({}, { locale })
                    : m["shared.jsonSchemaTools.patch"]({}, { locale })
                }
                language="json"
                copyLabel={m["common.actions.copyResult"]({}, { locale })}
                copiedLabel={m["common.actions.copied"]({}, { locale })}
                maxHeightClassName="min-h-80 max-h-[36rem]"
              />
            </>
          ) : evaluation.state === "error" ? (
            <div
              role="alert"
              className="grid min-h-80 place-items-center rounded-xl border border-danger/40 bg-danger/10 px-6 text-center text-danger"
            >
              {errorSource === "modified"
                ? m["tools.jsonDiffPath.invalidModifiedJsonLabel"](
                    {},
                    { locale },
                  )
                : m["tools.jsonDiffPath.invalidOriginalJsonLabel"](
                    {},
                    { locale },
                  )}
            </div>
          ) : (
            <div className="grid min-h-80 place-items-center rounded-xl border border-border px-6 text-center text-sm text-muted">
              {m["tools.jsonDiffPath.resultEmptyDescription"]({}, { locale })}
            </div>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["tools.jsonDiffPath.articleOverviewTitle"]({}, { locale })}</h2>
        <p>{m["tools.jsonDiffPath.articleOverviewBody"]({}, { locale })}</p>
        <h2>{m["tools.jsonDiffPath.articleWhenTitle"]({}, { locale })}</h2>
        <p>{m["tools.jsonDiffPath.articleWhenBody"]({}, { locale })}</p>
        <h2>{m["tools.jsonDiffPath.articleHowTitle"]({}, { locale })}</h2>
        <p>{m["tools.jsonDiffPath.articleHowBody"]({}, { locale })}</p>
      </ToolArticle>
    </div>
  );
}

function EditorCard({
  label,
  description,
  value,
  invalid,
  error,
  modelKey,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  invalid: boolean;
  error: string;
  modelKey: "original" | "modified";
  onChange: (value: string) => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{label}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-2 py-4">
        <CodeEditor
          aria-label={label}
          aria-invalid={invalid}
          language="json"
          modelPath={`tooltab://json-diff/${modelKey}.json`}
          value={value}
          height={320}
          onChange={onChange}
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

export function JsonDiffPathPage() {
  return (
    <ToolPage>
      <JsonDiffPathPageContent />
    </ToolPage>
  );
}
