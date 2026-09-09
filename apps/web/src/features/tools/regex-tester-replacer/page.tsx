import { downloadUrl as startDownload } from "@/lib/download";
import { useObjectUrl } from "@/hooks/use-object-url";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Chip,
  Input,
  Label,
  Skeleton,
  TextArea,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  Download,
  FileText,
  RefreshCcw,
  Search,
  TriangleAlert,
} from "lucide-react";
import {
  Fragment,
  startTransition,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  type AnalysisJob,
  type Match,
  type RegexResult,
  TextAnalysisError,
} from "@workspace/tools/text/analysis";
import { runTextAnalysisWorker } from "../text-analysis/worker-client";

type RegexFlag = "g" | "i" | "m" | "s" | "u" | "y";
type ResultView = "preview" | "matches" | "replace";

const DEFAULT_SOURCE = "Order #123-ABC\nOrder #456-DEF";
const DEFAULT_PATTERN = "#(\\d+)-([A-Z]+)";
const DEFAULT_REPLACEMENT = "ID:$1 Code:$2";
const FLAGS = ["g", "i", "m", "s", "u", "y"] as const;
const VIEWS = ["preview", "matches", "replace"] as const;
const STORAGE_PREFIX = "tools:regex-tester-replacer";

function RegexTesterReplacerPageContent() {
  const sourceId = useId();
  const patternId = useId();
  const replacementId = useId();
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [pattern, setPattern] = useState(DEFAULT_PATTERN);
  const [replacement, setReplacement] = useState(DEFAULT_REPLACEMENT);
  const [flags, setFlags] = useState<RegexFlag[]>(["g"]);
  const [view, setView] = useState<ResultView>("preview");

  useEffect(() => {
    try {
      setSource(storedString("source-text", DEFAULT_SOURCE));
      setPattern(storedString("pattern", DEFAULT_PATTERN));
      setReplacement(storedString("replacement", DEFAULT_REPLACEMENT));
      setFlags(storedFlags());
      const storedView = localStorage.getItem(
        `${STORAGE_PREFIX}:active-result-view`,
      );
      if (VIEWS.includes(storedView as ResultView))
        setView(storedView as ResultView);
    } catch {
      // Optional persistence must not block the tester.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}:source-text`, source);
      localStorage.setItem(`${STORAGE_PREFIX}:pattern`, pattern);
      localStorage.setItem(`${STORAGE_PREFIX}:replacement`, replacement);
      localStorage.setItem(`${STORAGE_PREFIX}:flags`, JSON.stringify(flags));
      localStorage.setItem(`${STORAGE_PREFIX}:active-result-view`, view);
    } catch {
      // Storage may be unavailable while live analysis remains usable.
    }
  }, [flags, pattern, ready, replacement, source, view]);

  const patternError = useMemo(
    () => compileError(pattern, flags),
    [flags, pattern],
  );
  const job = useMemo<AnalysisJob | null>(
    () =>
      ready && source && pattern.trim() && !patternError
        ? {
            kind: "regex",
            input: source,
            pattern,
            replacement,
            flags: flags.join(""),
          }
        : null,
    [flags, pattern, patternError, ready, replacement, source],
  );
  const task = useRegexTask(job);
  const result = task.result;
  const hasInput = Boolean(source && pattern.trim());
  const exportState = getExportState(view, result);
  const exportBlob = useMemo(
    () =>
      exportState.value
        ? new Blob([exportState.value], {
            type: exportState.name.endsWith(".tsv")
              ? "text/tab-separated-values;charset=utf-8"
              : exportState.name.endsWith(".json")
                ? "application/json;charset=utf-8"
                : "text/plain;charset=utf-8",
          })
        : null,
    [exportState.value, exportState.name],
  );
  const downloadUrl = useObjectUrl(exportBlob);

  function loadSample() {
    startTransition(() => {
      setSource(DEFAULT_SOURCE);
      setPattern(DEFAULT_PATTERN);
      setReplacement(DEFAULT_REPLACEMENT);
      setFlags(["g"]);
    });
  }

  return (
    <div className="grid gap-6">
      <div
        className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"
        data-regex-input-panels
      >
        <SourceCard
          id={sourceId}
          value={source}
          onChange={setSource}
          onLoadSample={loadSample}
          onClear={() => setSource("")}
        />
        <PatternCard
          patternId={patternId}
          replacementId={replacementId}
          pattern={pattern}
          replacement={replacement}
          flags={flags}
          patternError={patternError}
          onPatternChange={setPattern}
          onReplacementChange={setReplacement}
          onFlagChange={(flag, selected) =>
            setFlags((current) =>
              selected
                ? FLAGS.filter(
                    (item) => item === flag || current.includes(item),
                  )
                : current.filter((item) => item !== flag),
            )
          }
        />
      </div>

      <SummaryCard
        busy={task.busy}
        canShow={hasInput && !patternError && Boolean(result)}
        summary={result?.summary}
      />

      <ResultsCard
        busy={task.busy}
        hasInput={hasInput}
        patternError={patternError}
        taskError={task.error}
        result={result}
        view={view}
        onViewChange={setView}
        exportValue={exportState.value}
        downloadUrl={downloadUrl}
        downloadName={exportState.name}
      />

      <ToolArticle>
        <h2>{m["tools.regexTesterReplacer.articleTestTitle"]()}</h2>
        <p>{m["tools.regexTesterReplacer.articleTestBody"]()}</p>
        <h2>{m["tools.regexTesterReplacer.articleCheckTitle"]()}</h2>
        <ul>
          {[
            m["tools.regexTesterReplacer.articleCheckItems0"](),
            m["tools.regexTesterReplacer.articleCheckItems1"](),
            m["tools.regexTesterReplacer.articleCheckItems2"](),
            m["tools.regexTesterReplacer.articleCheckItems3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.regexTesterReplacer.articleUsesTitle"]()}</h2>
        <ul>
          {[
            m["tools.regexTesterReplacer.articleUsesItems0"](),
            m["tools.regexTesterReplacer.articleUsesItems1"](),
            m["tools.regexTesterReplacer.articleUsesItems2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

function SourceCard({
  id,
  value,
  onChange,
  onLoadSample,
  onClear,
}: Readonly<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  onLoadSample: () => void;
  onClear: () => void;
}>) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Card.Title>{m["shared.textAnalysis.input"]()}</Card.Title>
            <Card.Description>
              {m["tools.regexTesterReplacer.sourceDescription"]()}
            </Card.Description>
          </div>
          <ToolPanelActionGroup className="shrink-0 justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onPress={onLoadSample}
            >
              <FileText aria-hidden className="size-4" />
              {m["shared.addressTools.sample"]()}
            </Button>
            <Button type="button" size="sm" variant="ghost" onPress={onClear}>
              <RefreshCcw aria-hidden className="size-4" />
              {m["shared.asciiArt.clear"]()}
            </Button>
          </ToolPanelActionGroup>
        </div>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        <TextArea
          id={id}
          aria-label={m["shared.textAnalysis.input"]()}
          value={value}
          rows={12}
          placeholder={m["tools.regexTesterReplacer.sourceTextPlaceholder"]()}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="min-h-80 flex-1 resize-y font-mono text-sm"
        />
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function PatternCard({
  patternId,
  replacementId,
  pattern,
  replacement,
  flags,
  patternError,
  onPatternChange,
  onReplacementChange,
  onFlagChange,
}: Readonly<{
  patternId: string;
  replacementId: string;
  pattern: string;
  replacement: string;
  flags: RegexFlag[];
  patternError: string | null;
  onPatternChange: (value: string) => void;
  onReplacementChange: (value: string) => void;
  onFlagChange: (flag: RegexFlag, selected: boolean) => void;
}>) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.regexTesterReplacer.patternTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.regexTesterReplacer.patternDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-5 py-4">
        <TextField className="grid gap-2" isInvalid={Boolean(patternError)}>
          <Label htmlFor={patternId}>
            {m["shared.textAnalysis.pattern"]()}
          </Label>
          <Input
            id={patternId}
            value={pattern}
            maxLength={65536}
            placeholder={m["tools.regexTesterReplacer.patternPlaceholder"]()}
            onChange={(event) => onPatternChange(event.currentTarget.value)}
            className="font-mono text-sm"
          />
          {patternError ? (
            <p className="text-sm text-danger">
              {m["tools.regexTesterReplacer.invalidPatternLabel"]({
                message: patternError,
              })}
            </p>
          ) : null}
        </TextField>

        <TextField className="grid gap-2">
          <Label htmlFor={replacementId}>
            {m["tools.regexTesterReplacer.replacementLabel"]()}
          </Label>
          <Input
            id={replacementId}
            value={replacement}
            maxLength={1048576}
            placeholder={m[
              "tools.regexTesterReplacer.replacementPlaceholder"
            ]()}
            onChange={(event) => onReplacementChange(event.currentTarget.value)}
            className="font-mono text-sm"
          />
          <p className="text-sm text-muted">
            {m["tools.regexTesterReplacer.replacementHint"]()}
          </p>
        </TextField>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <div className="text-sm font-medium">
              {m["tools.regexTesterReplacer.flagsLabel"]()}
            </div>
            <p className="text-sm text-muted">
              {m["tools.regexTesterReplacer.flagsHint"]()}
            </p>
          </div>
          <div className="grid gap-3">
            {FLAGS.map((flag) => (
              <Checkbox
                key={flag}
                isSelected={flags.includes(flag)}
                onChange={(selected) => onFlagChange(flag, selected === true)}
              >
                <Checkbox.Content className="flex items-center gap-3 text-sm">
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <span className="font-mono text-xs text-muted uppercase">
                    {flag}
                  </span>
                  <span>{flagLabel(flag)}</span>
                </Checkbox.Content>
              </Checkbox>
            ))}
          </div>
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function SummaryCard({
  busy,
  canShow,
  summary,
}: Readonly<{
  busy: boolean;
  canShow: boolean;
  summary?: RegexResult["summary"];
}>) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["common.icalSummary"]()}</Card.Title>
        <Card.Description>
          {m["tools.regexTesterReplacer.summaryDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        {busy ? (
          <div className="flex flex-wrap gap-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-7 w-28 rounded-full" />
            ))}
          </div>
        ) : canShow && summary ? (
          <div className="flex flex-wrap gap-3">
            <Chip size="sm" variant="secondary">
              {m["tools.jsonpathTester.matchCountLabel"]({
                count: summary.matchCount,
              })}
            </Chip>
            <Chip size="sm" variant="secondary">
              {m["tools.regexTesterReplacer.groupsCountLabel"]({
                count: summary.groupCount,
              })}
            </Chip>
            <Chip size="sm" variant="secondary">
              {m["tools.regexTesterReplacer.zeroLengthCountLabel"]({
                count: summary.zeroLengthCount,
              })}
            </Chip>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {m["tools.regexTesterReplacer.summaryEmpty"]()}
          </p>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultsCard({
  busy,
  hasInput,
  patternError,
  taskError,
  result,
  view,
  onViewChange,
  exportValue,
  downloadUrl,
  downloadName,
}: Readonly<{
  busy: boolean;
  hasInput: boolean;
  patternError: string | null;
  taskError: TextAnalysisError["code"] | "";
  result: RegexResult | null;
  view: ResultView;
  onViewChange: (view: ResultView) => void;
  exportValue: string;
  downloadUrl: string;
  downloadName: string;
}>) {
  const showActions =
    Boolean(result && exportValue && downloadUrl) && view !== "preview";
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.regexTesterReplacer.resultsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-5 py-4">
        {patternError ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>
                {m["tools.regexTesterReplacer.invalidPatternLabel"]({
                  message: patternError,
                })}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : taskError ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>
                {taskError === "too_large"
                  ? m["tools.regexTesterReplacer.inputTooLarge"]()
                  : m["tools.regexTesterReplacer.processingError"]()}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : busy ? (
          <div className="grid min-h-72 content-start gap-4">
            <Skeleton className="h-8 w-64 max-w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        ) : !hasInput || !result ? (
          <EmptyResults />
        ) : (
          <>
            <ToggleButtonGroup
              aria-label={m["shared.textAnalysis.view"]()}
              selectionMode="single"
              selectedKeys={new Set([view])}
              className="flex w-full flex-wrap justify-start"
              onSelectionChange={(selection) => {
                const next = String([...selection][0] ?? "");
                if (VIEWS.includes(next as ResultView))
                  onViewChange(next as ResultView);
              }}
            >
              {VIEWS.map((item) => (
                <ToggleButton key={item} id={item} size="sm">
                  {viewLabel(item)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            {view === "preview" ? <Preview result={result} /> : null}
            {view === "matches" ? <Matches result={result} /> : null}
            {view === "replace" ? (
              <TextArea
                aria-label={m["shared.jsonSchemaTools.replace"]()}
                value={result.replacementOutput}
                readOnly
                rows={10}
                placeholder={m[
                  "tools.regexTesterReplacer.replaceOutputEmpty"
                ]()}
                className="min-h-72 resize-y font-mono text-sm"
              />
            ) : null}
            {result.replacementJson && view === "replace" ? (
              <p className="text-sm text-muted">
                {m["tools.regexTesterReplacer.surrogateNote"]()}
              </p>
            ) : null}
          </>
        )}
      </ToolPanelCardContent>
      {showActions ? (
        <ToolPanelCardFooter className="flex flex-wrap justify-end gap-2">
          <ToolCopyButton
            value={exportValue}
            copyLabel={m["common.actions.copy"]()}
            copiedLabel={m["common.actions.copied"]()}
          />
          <Button
            type="button"
            size="sm"
            onPress={() => startDownload(downloadUrl, downloadName)}
          >
            <Download aria-hidden className="size-4" />
            {m["common.actions.download"]()}
          </Button>
          {result?.replacementJson && view === "replace" ? (
            <JsonDownloadButton value={result.replacementJson} />
          ) : null}
        </ToolPanelCardFooter>
      ) : null}
    </ToolPanelCard>
  );
}

function EmptyResults() {
  return (
    <div className="grid min-h-48 place-items-center rounded-xl border border-separator bg-default/20 p-6 text-center">
      <div className="grid justify-items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-default">
          <Search aria-hidden className="size-5 text-muted" />
        </span>
        <div className="grid gap-1">
          <h3 className="font-medium">{m["common.passresultstitle"]()}</h3>
          <p className="text-sm text-muted">
            {m["tools.regexTesterReplacer.summaryEmpty"]()}
          </p>
        </div>
      </div>
    </div>
  );
}

function Preview({ result }: Readonly<{ result: RegexResult }>) {
  return (
    <div className="grid gap-3">
      <section
        aria-label={m["common.archivepreview"]()}
        className="min-h-72 overflow-x-auto rounded-xl border border-separator p-3"
      >
        {result.segments.length ? (
          <pre className="font-mono text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">
            {result.segments.map((segment) => (
              <Fragment
                key={`${segment.index}:${segment.isMatch}:${segment.text}`}
              >
                {segment.isMatch ? (
                  <mark className="rounded bg-warning/30 px-0.5 text-foreground">
                    {segment.text}
                  </mark>
                ) : (
                  segment.text
                )}
              </Fragment>
            ))}
          </pre>
        ) : (
          <p className="text-sm text-muted">
            {m["tools.regexTesterReplacer.previewEmpty"]()}
          </p>
        )}
      </section>
      {result.previewTruncated ? (
        <p className="text-sm text-muted">
          {m["tools.regexTesterReplacer.previewTruncatedLabel"]({
            count: 5000,
          })}
        </p>
      ) : null}
    </div>
  );
}

function Matches({ result }: Readonly<{ result: RegexResult }>) {
  if (!result.matches.length)
    return (
      <p className="text-sm text-muted">
        {m["tools.regexTesterReplacer.matchesEmpty"]()}
      </p>
    );
  return (
    <div className="grid gap-3">
      <div className="grid gap-3">
        {result.matches.map((match, index) => (
          <MatchCard
            key={`${match.index}:${match.end}:${match.match}`}
            index={index}
            match={match}
          />
        ))}
      </div>
      {result.matchesTruncated ? (
        <p className="text-sm text-muted">
          {m["tools.regexTesterReplacer.matchesTruncatedLabel"]({ count: 200 })}
        </p>
      ) : null}
    </div>
  );
}

function MatchCard({
  index,
  match,
}: Readonly<{ index: number; match: Match }>) {
  return (
    <article className="rounded-xl border border-separator bg-default/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" variant="secondary">
          {m["tools.regexTesterReplacer.matchIndexLabel"]({ count: index + 1 })}
        </Chip>
        <span className="text-sm text-muted">
          {m["tools.regexTesterReplacer.matchRangeLabel"]({
            start: match.index,
            end: match.end,
          })}
        </span>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-separator p-2 font-mono text-sm wrap-break-word whitespace-pre-wrap">
        {match.match || m["tools.regexTesterReplacer.matchEmptyLabel"]()}
      </pre>
      {match.groups.length ? (
        <div className="mt-3 grid gap-2">
          <div className="text-sm font-medium">
            {m["tools.regexTesterReplacer.capturedGroupsLabel"]()}
          </div>
          <div className="flex flex-wrap gap-2">
            {indexedGroups(match).map((group) => (
              <Chip key={group.id} size="sm" variant="tertiary">
                {group.value ??
                  m["tools.regexTesterReplacer.matchEmptyLabel"]()}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      {Object.keys(match.namedGroups).length ? (
        <div className="mt-3 grid gap-2">
          <div className="text-sm font-medium">
            {m["tools.regexTesterReplacer.namedGroupsLabel"]()}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(match.namedGroups).map(([name, value]) => (
              <Chip key={name} size="sm" variant="tertiary">
                {name}=
                {value ?? m["tools.regexTesterReplacer.matchEmptyLabel"]()}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function JsonDownloadButton({ value }: Readonly<{ value: string }>) {
  const blob = useMemo(
    () =>
      value
        ? new Blob([value], { type: "application/json;charset=utf-8" })
        : null,
    [value],
  );
  const url = useObjectUrl(blob);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      isDisabled={!url}
      onPress={() => startDownload(url, "replacement.json")}
    >
      <Download aria-hidden className="size-4" />
      {m["tools.regexTesterReplacer.losslessDownloadLabel"]()}
    </Button>
  );
}

function useRegexTask(job: AnalysisJob | null) {
  const [result, setResult] = useState<RegexResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextAnalysisError["code"] | "">("");
  const revision = useRef(0);
  useEffect(() => {
    const current = ++revision.current;
    const controller = new AbortController();
    setResult(null);
    setError("");
    setBusy(Boolean(job));
    if (!job) return () => controller.abort();
    const timer = window.setTimeout(() => {
      void runTextAnalysisWorker(job, controller.signal)
        .then((output) => {
          if (current === revision.current && output.kind === "regex")
            setResult(output);
        })
        .catch((cause) => {
          if (current === revision.current && !controller.signal.aborted)
            setError(
              cause instanceof TextAnalysisError ? cause.code : "invalid_input",
            );
        })
        .finally(() => {
          if (current === revision.current) setBusy(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [job]);
  return { result, busy, error };
}

function compileError(pattern: string, flags: RegexFlag[]) {
  if (!pattern.trim()) return null;
  try {
    new RegExp(pattern, flags.join(""));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function getExportState(view: ResultView, result: RegexResult | null) {
  if (!result || view === "preview") return { name: "result.txt", value: "" };
  return view === "matches"
    ? { name: "regex-matches.tsv", value: result.matchesTsv }
    : { name: "replaced-text.txt", value: result.replacementOutput };
}

function flagLabel(flag: RegexFlag) {
  switch (flag) {
    case "g":
      return m["tools.regexTesterReplacer.globalFlagLabel"]();
    case "i":
      return m["shared.textAnalysis.ignorecase"]();
    case "m":
      return m["tools.regexTesterReplacer.multilineFlagLabel"]();
    case "s":
      return m["shared.textAnalysis.dotall"]();
    case "u":
      return m["tools.regexTesterReplacer.unicodeFlagLabel"]();
    case "y":
      return m["tools.regexTesterReplacer.stickyFlagLabel"]();
  }
}

function viewLabel(view: ResultView) {
  switch (view) {
    case "preview":
      return m["common.archivepreview"]();
    case "matches":
      return m["tools.regexTesterReplacer.matchesTabLabel"]();
    case "replace":
      return m["shared.jsonSchemaTools.replace"]();
  }
}

function indexedGroups(match: Match) {
  return match.groups.map((value, index) => ({
    id: `${match.index}:group:${index}`,
    value,
  }));
}

function storedString(key: string, fallback: string) {
  return safeLocalStorage.getItem(`${STORAGE_PREFIX}:${key}`) ?? fallback;
}

function storedFlags(): RegexFlag[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(`${STORAGE_PREFIX}:flags`) ?? "null",
    );
    if (!Array.isArray(parsed)) return ["g"];
    return FLAGS.filter((flag) => parsed.includes(flag));
  } catch {
    return ["g"];
  }
}

export default function RegexTesterReplacerPage() {
  return (
    <ToolPage instructions={m["tools.regexTesterReplacer.usage"]()}>
      <RegexTesterReplacerPageContent />
    </ToolPage>
  );
}
