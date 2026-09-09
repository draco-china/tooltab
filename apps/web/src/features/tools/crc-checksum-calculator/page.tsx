import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Card,
  Chip,
  Skeleton,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Binary, TriangleAlert } from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  type CrcResult,
  FILTERS,
  type Filter,
  filterResults,
  resultText,
} from "@workspace/tools/checksum/crc";
import { blobChunks, textBytes } from "../crc-checksum/stream";
import { runCrcStream } from "../crc-checksum/worker-client";

const DEFAULT_TEXT = "123456789";
const STORAGE_KEY = "tools:crc-checksum-calculator:text";
type State =
  | { status: "idle" }
  | { status: "loading" | "ready"; results: CrcResult[] }
  | { status: "error"; message: string; results: CrcResult[] };

function CrcChecksumToolContent() {
  const calculationError = m["tools.crcChecksumCalculator.calculationError"]();
  const inputId = useId();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [file, setFile] = useState<File | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [state, setState] = useState<State>({ status: "loading", results: [] });
  const deferredText = useDeferredValue(text);
  const lastResults = useRef<CrcResult[]>([]);

  useEffect(() => {
    safeLocalStorage.removeItem(STORAGE_KEY);
  }, []);
  useEffect(() => {
    const source =
      file ?? (deferredText ? new Blob([textBytes(deferredText)]) : null);
    if (!source) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading", results: lastResults.current });
    void runCrcStream(blobChunks(source, controller.signal), controller.signal)
      .then(({ results }) => {
        if (controller.signal.aborted) return;
        lastResults.current = results;
        setState({ status: "ready", results });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            message: error instanceof Error ? error.message : calculationError,
            results: lastResults.current,
          });
      });
    return () => controller.abort();
  }, [calculationError, deferredText, file]);

  const visible = useMemo(
    () => filterResults(state.status === "idle" ? [] : state.results, filter),
    [state, filter],
  );
  const filterLabels: Record<Filter, string> = {
    all: m["shared.crcChecksum.all"](),
    "8": m["tools.crcChecksumCalculator.crc8ResultsLabel"](),
    "16": m["tools.crcChecksumCalculator.crc16ResultsLabel"](),
    "32": m["tools.crcChecksumCalculator.crc32ResultsLabel"](),
    "64": m["tools.crcChecksumCalculator.crc64ResultsLabel"](),
    other: m["common.archivekindOther"](),
  };

  return (
    <div className="grid gap-8">
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
          <Card.Description>
            {file
              ? m["tools.crcChecksumCalculator.selectedFileDescription"]()
              : m["tools.crcChecksumCalculator.plainTextDescription"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="gap-5 py-4">
          {!file ? (
            <div className="grid gap-2">
              <label htmlFor={inputId} className="text-sm font-medium">
                {m["common.adler32plaintextlabel"]()}
              </label>
              <TextArea
                id={inputId}
                aria-label={m["common.adler32plaintextlabel"]()}
                value={text}
                spellCheck={false}
                className="min-h-64 resize-y font-mono text-sm"
                onChange={(event) => setText(event.currentTarget.value)}
              />
            </div>
          ) : null}
          <ToolFilePicker
            label={m["common.adler32importfromfilelabel"]()}
            description={
              file
                ? m["tools.crcChecksumCalculator.selectedFileDescription"]()
                : undefined
            }
            fileName={file ? `${file.name} · ${file.size} B` : undefined}
            clearLabel={m["tools.crcChecksumCalculator.switchToTextLabel"]()}
            onSelect={setFile}
            onClear={file ? () => setFile(null) : undefined}
          />
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolPanelCard>
        <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-1">
            <Card.Title>
              {m["tools.crcChecksumCalculator.checksumResultLabel"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.crcChecksumCalculator.resultCountLabel"]({
                count: String(visible.length),
              })}
            </Card.Description>
          </div>
          <ToolCopyButton
            value={resultText(visible)}
            copyLabel={m["shared.crcChecksum.copyVisible"]()}
            copiedLabel={m["common.actions.copied"]()}
            disabled={state.status === "loading" || visible.length === 0}
          />
        </Card.Header>
        <ToolPanelCardContent className="gap-5 py-4">
          <ToggleButtonGroup
            aria-label={m["tools.crcChecksumCalculator.resultFilterLabel"]()}
            selectionMode="single"
            selectedKeys={new Set([filter])}
            className="flex-wrap justify-start"
            onSelectionChange={(selection) => {
              const next = String([...selection][0] ?? "");
              if (FILTERS.includes(next as Filter)) setFilter(next as Filter);
            }}
          >
            {FILTERS.map((value) => (
              <ToggleButton id={value} key={value}>
                {filterLabels[value]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {state.status === "idle" ? (
            <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-default/40 p-6 text-center">
              <div className="grid justify-items-center gap-2">
                <Binary className="size-6 text-muted" aria-hidden />
                <p className="font-medium">
                  {m["tools.crcChecksumCalculator.emptyInputTitle"]()}
                </p>
                <p className="text-sm text-muted">
                  {m["tools.crcChecksumCalculator.emptyInputDescription"]()}
                </p>
              </div>
            </div>
          ) : (
            <>
              {state.status === "error" ? (
                <div
                  role="alert"
                  className="flex gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
                >
                  <TriangleAlert className="size-5 shrink-0" aria-hidden />
                  {state.message || calculationError}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {state.status === "loading" && visible.length === 0
                  ? ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((key) => (
                      <Skeleton key={key} className="h-32 rounded-2xl" />
                    ))
                  : visible.map((result) => (
                      <section
                        key={result.id}
                        className={`grid gap-3 rounded-2xl border border-border bg-default/40 p-4 ${state.status === "loading" ? "opacity-70" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="grid gap-1">
                            <h3 className="text-sm font-medium">
                              {result.name}
                            </h3>
                            <Chip size="sm" variant="secondary">
                              {result.width}{" "}
                              {m["tools.crcChecksumCalculator.bitWidthLabel"]()}
                            </Chip>
                          </div>
                          <ToolCopyButton
                            value={result.hex}
                            copyLabel={m["common.adler32copyresultlabel"]()}
                            copiedLabel={m["common.actions.copied"]()}
                            disabled={state.status === "loading"}
                            size="icon-sm"
                          />
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs text-muted">
                            {m["common.identifierchecksum"]()}
                          </span>
                          <code className="text-sm leading-6 break-all">
                            {result.hex}
                          </code>
                        </div>
                      </section>
                    ))}
              </div>
            </>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["shared.crcChecksum.name"]()}</h2>
        <p>{m["tools.crcChecksumCalculator.articleIntro"]()}</p>
        <h2>{m["tools.archiveViewer.article.whenTitle"]()}</h2>
        <p>{m["tools.crcChecksumCalculator.articleWhenBody"]()}</p>
        <h2>{m["tools.crcChecksumCalculator.articleVariantsTitle"]()}</h2>
        <p>{m["tools.crcChecksumCalculator.articleVariantsBody"]()}</p>
        <h2>{m["tools.crcChecksumCalculator.article.watchTitle"]()}</h2>
        <p>{m["tools.crcChecksumCalculator.articleWatchBody"]()}</p>
        <p>{m["tools.crcChecksumCalculator.articleSecurity"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function CrcChecksumTool() {
  return (
    <ToolPage>
      <CrcChecksumToolContent />
    </ToolPage>
  );
}
