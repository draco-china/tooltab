import { downloadUrl as startDownload } from "@/lib/download";
import { useObjectUrl } from "@/hooks/use-object-url";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Skeleton,
  Switch,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  ArrowLeftRight,
  Download,
  FileText,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  type AnalysisJob,
  type DiffResult,
  type DiffSide,
  MAX_TEXT_BYTES,
  TextAnalysisError,
} from "@workspace/tools/text/analysis";
import { runTextAnalysisWorker } from "../text-analysis/worker-client";

const ORIGINAL = "Hello world\nThis is the original draft.\nKeep this line.";
const MODIFIED =
  "Hello world\nThis is the revised draft.\nKeep this line.\nAdd a closing line.";
const STORAGE_KEY = "tools:text-diff";
type ViewMode = "side" | "unified";

function TextDiffContent() {
  const [original, setOriginal] = useState("");
  const [modified, setModified] = useState("");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [hideUnchanged, setHideUnchanged] = useState(false);
  const [view, setView] = useState<ViewMode>("side");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "null",
      ) as {
        original?: string;
        modified?: string;
        ignoreCase?: boolean;
        ignoreWhitespace?: boolean;
        hideUnchanged?: boolean;
        view?: ViewMode;
      } | null;
      setOriginal(stored?.original ?? "");
      setModified(stored?.modified ?? "");
      setIgnoreCase(stored?.ignoreCase === true);
      setIgnoreWhitespace(stored?.ignoreWhitespace === true);
      setHideUnchanged(stored?.hideUnchanged === true);
      setView(stored?.view === "unified" ? "unified" : "side");
    } catch {
      // Persistence is optional.
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    if (ready)
      safeLocalStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          original,
          modified,
          ignoreCase,
          ignoreWhitespace,
          hideUnchanged,
          view,
        }),
      );
  }, [
    hideUnchanged,
    ignoreCase,
    ignoreWhitespace,
    modified,
    original,
    ready,
    view,
  ]);

  const hasInput = original.length > 0 || modified.length > 0;
  const job = useMemo<AnalysisJob | null>(
    () =>
      ready && hasInput
        ? {
            kind: "diff",
            original,
            modified,
            ignoreCase,
            ignoreWhitespace,
            hideUnchanged,
          }
        : null,
    [
      hasInput,
      hideUnchanged,
      ignoreCase,
      ignoreWhitespace,
      modified,
      original,
      ready,
    ],
  );
  const task = useDiffTask(job);
  const result = task.result;
  const rows = result
    ? hideUnchanged
      ? result.rows.filter((row) => row.kind !== "equal")
      : result.rows
    : [];
  const downloadText = result?.unifiedText ?? "";
  const downloadBlob = useMemo(
    () =>
      downloadText
        ? new Blob([downloadText], { type: "text/plain;charset=utf-8" })
        : null,
    [downloadText],
  );
  const downloadUrl = useObjectUrl(downloadBlob);

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <ToolPanelCard className="xl:col-span-2">
            <Card.Header className="border-b border-separator">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Card.Title>{m["tools.textDiff.inputTitle"]()}</Card.Title>
                  <Card.Description>
                    {m["tools.textDiff.inputDescription"]()}
                  </Card.Description>
                </div>
                <ToolPanelActionGroup className="w-full justify-end sm:w-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      const previousOriginal = original;
                      setOriginal(modified);
                      setModified(previousOriginal);
                    }}
                  >
                    <ArrowLeftRight aria-hidden className="size-4" />
                    {m["shared.textAnalysis.swap"]()}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setOriginal(ORIGINAL);
                      setModified(MODIFIED);
                    }}
                  >
                    <FileText aria-hidden className="size-4" />
                    {m["shared.baseEncoding.base58EncoderLoadSampleLabel"]()}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setOriginal("");
                      setModified("");
                    }}
                  >
                    <RefreshCcw aria-hidden className="size-4" />
                    {m["tools.textDiff.clearTextsLabel"]()}
                  </Button>
                </ToolPanelActionGroup>
              </div>
            </Card.Header>
            <ToolPanelCardContent className="gap-6 py-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Editor
                  side="original"
                  value={original}
                  onChange={setOriginal}
                />
                <Editor
                  side="modified"
                  value={modified}
                  onChange={setModified}
                />
              </div>
              <div className="grid gap-5 border-t border-separator pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="grid gap-2">
                  <ToggleButtonGroup
                    aria-label={m["tools.textDiff.viewModeLabel"]()}
                    selectionMode="single"
                    selectedKeys={new Set([view])}
                    className="grid grid-cols-2"
                    onSelectionChange={(keys) => {
                      const next = String([...keys][0] ?? "");
                      if (next === "side" || next === "unified") setView(next);
                    }}
                  >
                    <ToggleButton id="side" size="sm" className="h-9 w-full">
                      {m["tools.textDiff.sideBySideLabel"]()}
                    </ToggleButton>
                    <ToggleButton id="unified" size="sm" className="h-9 w-full">
                      {m["tools.textDiff.unifiedLabel"]()}
                    </ToggleButton>
                  </ToggleButtonGroup>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Option
                    label={m["tools.textDiff.hideUnchangedLabel"]()}
                    value={hideUnchanged}
                    onChange={setHideUnchanged}
                  />
                  <Option
                    label={m["tools.textDiff.ignoreCaseLabel"]()}
                    value={ignoreCase}
                    onChange={setIgnoreCase}
                  />
                  <Option
                    label={m["tools.textDiff.ignoreWhitespaceLabel"]()}
                    value={ignoreWhitespace}
                    onChange={setIgnoreWhitespace}
                  />
                </div>
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>
        <Summary result={result} busy={task.busy} />
        <Results
          result={result}
          rows={rows}
          view={view}
          hasInput={hasInput}
          busy={task.busy}
          error={task.error}
          downloadUrl={downloadUrl}
        />
      </div>
      <ToolArticle>
        <h2>{m["tools.textDiff.articlePurposeTitle"]()}</h2>
        <p>{m["tools.textDiff.articlePurpose"]()}</p>
        <h2>{m["tools.textDiff.articleResultTitle"]()}</h2>
        <p>{m["tools.textDiff.articleResult"]()}</p>
        <h2>{m["tools.textDiff.articleOptionsTitle"]()}</h2>
        <p>{m["tools.textDiff.articleOptions"]()}</p>
      </ToolArticle>
    </div>
  );
}

function Editor({
  side,
  value,
  onChange,
}: {
  side: "original" | "modified";
  value: string;
  onChange: (value: string) => void;
}) {
  const label =
    side === "original"
      ? m["shared.textAnalysis.original"]()
      : m["shared.textAnalysis.modified"]();
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted">
          {m["tools.textDiff.textStatsLabel"]({
            lines: String(value ? value.split(/\r\n?|\n/).length : 0),
            chars: String(value.length),
          })}
        </span>
      </div>
      <TextArea
        aria-label={label}
        value={value}
        placeholder={
          side === "original"
            ? m["tools.textDiff.originalPlaceholder"]()
            : m["tools.textDiff.modifiedPlaceholder"]()
        }
        className="min-h-80 resize-y font-mono text-sm"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <ToolFilePicker
        label={
          side === "original"
            ? m["tools.textDiff.importOriginalLabel"]()
            : m["tools.textDiff.importModifiedLabel"]()
        }
        onSelect={(file) => void importText(file, onChange)}
      />
    </div>
  );
}

function Option({
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
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <span>{label}</span>
      </Switch.Content>
    </Switch>
  );
}

function Summary({
  result,
  busy,
}: {
  result: DiffResult | null;
  busy: boolean;
}) {
  const values = [
    [m["tools.textDiff.unchangedLabel"](), result?.stats.unchanged],
    [m["tools.textDiff.changedLabel"](), result?.stats.changed],
    [m["tools.textDiff.addedLabel"](), result?.stats.added],
    [m["tools.textDiff.removedLabel"](), result?.stats.removed],
  ] as const;
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.listComparer.summaryTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.textDiff.summaryDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <div className="flex flex-wrap gap-3">
          {busy
            ? [0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-7 w-24 rounded-full" />
              ))
            : values.map(([label, value]) => (
                <Chip key={label} size="sm" variant="secondary">
                  {label}: {value ?? 0}
                </Chip>
              ))}
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function Results({
  result,
  rows,
  view,
  hasInput,
  busy,
  error,
  downloadUrl,
}: {
  result: DiffResult | null;
  rows: DiffResult["rows"];
  view: ViewMode;
  hasInput: boolean;
  busy: boolean;
  error: string;
  downloadUrl: string;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Card.Title>{m["tools.textDiff.resultsTitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.textDiff.resultsDescription"]()}
          </Card.Description>
        </div>
        {result && hasInput ? (
          <ToolPanelActionGroup className="shrink-0 sm:justify-end">
            <ToolCopyButton
              value={result.unifiedText}
              copyLabel={m["tools.textDiff.copyDiffLabel"]()}
              copiedLabel={m["common.actions.copied"]()}
            />
            <Button
              size="sm"
              isDisabled={!downloadUrl}
              onPress={() =>
                downloadUrl && startDownload(downloadUrl, "text-diff.patch")
              }
            >
              <Download aria-hidden className="size-4" />
              {m["tools.textDiff.downloadDiffLabel"]()}
            </Button>
          </ToolPanelActionGroup>
        ) : null}
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        {error ? (
          <Alert status="danger">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>
                {m["tools.textDiff.processingError"]()}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : busy ? (
          <Skeleton className="h-72 rounded-xl" />
        ) : !hasInput ? (
          <Empty
            title={m["tools.textDiff.emptyStateTitle"]()}
            description={m["tools.textDiff.emptyStateDescription"]()}
          />
        ) : result && rows.length === 0 ? (
          <Empty
            title={m["tools.textDiff.noChangesTitle"]()}
            description={m["tools.textDiff.noChangesDescription"]()}
          />
        ) : (
          <div className="max-h-136 overflow-auto font-mono text-sm">
            <div
              className={
                view === "side"
                  ? "sticky top-0 grid grid-cols-2 border-b border-separator bg-default/95 text-xs font-medium text-muted"
                  : "sticky top-0 border-b border-separator bg-default/95 text-xs font-medium text-muted"
              }
            >
              {view === "side" ? (
                <>
                  <span className="px-3 py-2">{m["common.original"]()}</span>
                  <span className="border-s border-separator px-3 py-2">
                    {m["tools.textDiff.modifiedLegendLabel"]()}
                  </span>
                </>
              ) : (
                <span className="block px-3 py-2">
                  {m["common.original"]()} /{" "}
                  {m["tools.textDiff.modifiedLegendLabel"]()}
                </span>
              )}
            </div>
            {withOccurrenceKeys(rows, (row) =>
              JSON.stringify([
                row.kind,
                row.original.lineNumber,
                row.original.text,
                row.modified.lineNumber,
                row.modified.text,
              ]),
            ).map(({ item: row, key }) => (
              <div
                key={key}
                className={
                  view === "side"
                    ? "grid grid-cols-2 border-b border-separator last:border-0 [&>*+*]:border-s [&>*+*]:border-separator"
                    : "border-b border-separator last:border-0"
                }
              >
                {view === "side" || row.kind !== "add" ? (
                  <Side
                    side={row.original}
                    mark={row.kind === "equal" ? " " : "−"}
                  />
                ) : null}
                {view === "side" ||
                (row.kind !== "remove" && row.kind !== "equal") ? (
                  <Side
                    side={row.modified}
                    mark={row.kind === "equal" ? " " : "+"}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function Side({ side, mark }: { side: DiffSide; mark: string }) {
  return (
    <div className="flex min-w-0 gap-2 p-3">
      <span className="shrink-0 text-muted">
        {side.lineNumber ?? "·"} {mark}
      </span>
      <span className="break-all whitespace-pre-wrap">
        {withOccurrenceKeys(side.tokens, (token) =>
          JSON.stringify([token.kind, token.value]),
        ).map(({ item: token, key }) => (
          <span
            key={key}
            className={
              token.kind === "add"
                ? "bg-success/15 text-success"
                : token.kind === "remove"
                  ? "bg-danger/15 text-danger"
                  : undefined
            }
          >
            {token.value}
          </span>
        ))}
      </span>
    </div>
  );
}
function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-xl border border-separator bg-default/20 p-6 text-center">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}

function withOccurrenceKeys<T>(
  items: readonly T[],
  identity: (item: T) => string,
) {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const base = identity(item);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return { item, key: `${base}:${occurrence}` };
  });
}

function useDiffTask(job: AnalysisJob | null) {
  const [result, setResult] = useState<DiffResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    setBusy(Boolean(job));
    if (!job) return () => controller.abort();
    const timer = window.setTimeout(() => {
      void runTextAnalysisWorker(job, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted && value.kind === "diff")
            setResult(value);
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof TextAnalysisError ? cause.code : "invalid_input",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [job]);
  return { result, busy, error };
}
async function importText(file: File, apply: (value: string) => void) {
  if (file.size > MAX_TEXT_BYTES) return;
  try {
    apply(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      ),
    );
  } catch {}
}
export function TextDiff() {
  return (
    <ToolPage instructions={m["tools.textDiff.usage"]()}>
      <TextDiffContent />
    </ToolPage>
  );
}
