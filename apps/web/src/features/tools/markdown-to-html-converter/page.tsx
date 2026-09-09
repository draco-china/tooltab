import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Skeleton,
  Switch,
  TextArea,
} from "@heroui/react";
import {
  Download,
  Printer,
  RefreshCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { CodeBlock } from "@/components/base/code-block";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { getLocale } from "@/paraglide/runtime.js";
import {
  MAX_MARKDOWN_INPUT,
  MarkdownError,
} from "@workspace/tools/text/markdown-contract";
import {
  MAX_PREVIEW_SOURCE,
  type MarkdownResult,
  markdownDefaults,
} from "../markdown-tools/types";
import { runMarkdownWorker } from "../markdown-tools/worker-client";

type ConversionError = MarkdownError["code"];

function MarkdownToHtmlContent() {
  const locale = getLocale();
  const reader = useRef<FileReader | null>(null);
  const controller = useRef<AbortController | null>(null);
  const conversionTimer = useRef<number | null>(null);
  const printFrame = useRef<HTMLIFrameElement>(null);
  const revision = useRef(0);
  const downloadUrlRef = useRef<string | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [sanitize, setSanitize] = useState(true);
  const [result, setResult] = useState<MarkdownResult | null>(null);
  const [error, setError] = useState<ConversionError | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const deferredMarkdown = useDeferredValue(markdown);

  function stopReader() {
    const current = reader.current;
    if (!current) return;
    current.onload = null;
    current.onerror = null;
    current.onabort = null;
    if (current.readyState === 1) current.abort();
    reader.current = null;
  }

  function revokeDownload() {
    if (!downloadUrlRef.current) return;
    URL.revokeObjectURL(downloadUrlRef.current);
    downloadUrlRef.current = null;
    setDownloadUrl(null);
  }

  function invalidate(hasNextInput = false) {
    revision.current++;
    if (conversionTimer.current !== null) {
      window.clearTimeout(conversionTimer.current);
      conversionTimer.current = null;
    }
    controller.current?.abort();
    controller.current = null;
    stopReader();
    revokeDownload();
    setResult(null);
    setError(null);
    setBusy(hasNextInput);
  }

  function replaceMarkdown(value: string) {
    invalidate(Boolean(value.trim()));
    setMarkdown(value);
  }

  useEffect(() => {
    if (!deferredMarkdown.trim()) {
      setBusy(false);
      return;
    }
    const current = ++revision.current;
    let nextController: AbortController | null = null;
    const timer = window.setTimeout(() => {
      conversionTimer.current = null;
      nextController = new AbortController();
      controller.current = nextController;
      setBusy(true);
      void (async () =>
        runMarkdownWorker(
          {
            ...markdownDefaults,
            kind: "to-html",
            input: deferredMarkdown,
            sanitize,
            language: locale,
            direction: getTextDirection(locale),
          },
          nextController.signal,
        ))()
        .then((next) => {
          if (revision.current !== current || nextController?.signal.aborted)
            return;
          startTransition(() => {
            setResult(next);
            setBusy(false);
          });
        })
        .catch((cause) => {
          if (revision.current !== current || nextController?.signal.aborted)
            return;
          setError(
            cause instanceof MarkdownError ? cause.code : "invalid_input",
          );
          setBusy(false);
        })
        .finally(() => {
          if (controller.current === nextController) controller.current = null;
        });
    }, 180);
    conversionTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (conversionTimer.current === timer) conversionTimer.current = null;
      if (nextController && controller.current === nextController) {
        nextController.abort();
        controller.current = null;
      }
    };
  }, [deferredMarkdown, locale, sanitize]);

  useEffect(() => {
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
      setDownloadUrl(null);
    }
    if (!result?.output) return;
    const url = URL.createObjectURL(
      new Blob([result.output], { type: "text/html;charset=utf-8" }),
    );
    downloadUrlRef.current = url;
    setDownloadUrl(url);
    return () => {
      if (downloadUrlRef.current === url) {
        URL.revokeObjectURL(url);
        downloadUrlRef.current = null;
      }
    };
  }, [result]);

  useEffect(
    () => () => {
      revision.current++;
      if (conversionTimer.current !== null) {
        window.clearTimeout(conversionTimer.current);
        conversionTimer.current = null;
      }
      controller.current?.abort();
      controller.current = null;
      const currentReader = reader.current;
      if (currentReader) {
        currentReader.onload = null;
        currentReader.onerror = null;
        currentReader.onabort = null;
        if (currentReader.readyState === 1) currentReader.abort();
        reader.current = null;
      }
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
        downloadUrlRef.current = null;
      }
    },
    [],
  );

  function importFile(file: File) {
    invalidate(true);
    if (file.size > MAX_MARKDOWN_INPUT) {
      setBusy(false);
      setError("too_large");
      return;
    }
    const current = revision.current;
    const nextReader = new FileReader();
    reader.current = nextReader;
    const finish = () => {
      nextReader.onload = null;
      nextReader.onerror = null;
      nextReader.onabort = null;
      if (reader.current === nextReader) reader.current = null;
    };
    nextReader.onload = () => {
      if (revision.current !== current) return;
      try {
        const value = new TextDecoder("utf8", { fatal: true }).decode(
          nextReader.result as ArrayBuffer,
        );
        finish();
        startTransition(() => replaceMarkdown(value));
      } catch {
        finish();
        setBusy(false);
        setError("read_failed");
      }
    };
    nextReader.onerror = () => {
      if (revision.current !== current) return;
      finish();
      setBusy(false);
      setError("read_failed");
    };
    nextReader.readAsArrayBuffer(file);
  }

  const inputMetrics = formatMetrics(markdown, locale);
  const output = result?.output ?? "";
  const outputMetrics = formatMetrics(output, locale);
  const hasOutput = Boolean(output.trim());

  return (
    <div className="grid min-w-0 gap-8">
      <div className="grid items-stretch gap-6 xl:grid-cols-2" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="gap-4 border-b border-separator">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="grid min-w-0 gap-1.5">
                <Card.Title>
                  {m["tools.markdownPreviewer.sourceLabel"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.markdownToHtmlConverter.markdownDescription"]()}
                </Card.Description>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onPress={() =>
                  replaceMarkdown(
                    m["tools.markdownToHtmlConverter.sampleMarkdown"](),
                  )
                }
              >
                <Sparkles aria-hidden className="size-4" />
                {m["shared.textAnalysis.example"]()}
              </Button>
            </div>
            <Metrics values={inputMetrics} />
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <TextArea
              aria-label={m["tools.markdownPreviewer.sourceLabel"]()}
              value={markdown}
              spellCheck={false}
              rows={18}
              placeholder={m[
                "tools.markdownToHtmlConverter.markdownPlaceholder"
              ]()}
              className="bg-field-background min-h-112 flex-1 resize-y rounded-xl border border-border font-mono text-sm leading-6 tab-2"
              onChange={(event) => replaceMarkdown(event.currentTarget.value)}
            />
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="grid gap-3">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              accept={[
                ".md",
                ".markdown",
                ".txt",
                "text/markdown",
                "text/plain",
              ]}
              isDisabled={busy}
              onSelect={importFile}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onPress={() => {
                  invalidate();
                  setMarkdown("");
                  setSanitize(true);
                }}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.actions.reset"]()}
              </Button>
            </div>
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid gap-4 border-b border-separator xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-center">
            <div className="grid gap-1.5">
              <Metrics values={outputMetrics} html />
            </div>
            <Switch
              aria-label={m["tools.markdownToHtmlConverter.sanitizeLabel"]()}
              isSelected={sanitize}
              onChange={(selected) => {
                invalidate(Boolean(markdown.trim()));
                setSanitize(selected === true);
              }}
            >
              <Switch.Content className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-default/30 p-3">
                <span className="grid gap-1">
                  <span className="text-sm font-medium">
                    {m["tools.markdownToHtmlConverter.sanitizeLabel"]()}
                  </span>
                  <span className="text-sm leading-5 text-muted">
                    {m["tools.markdownToHtmlConverter.sanitizeDescription"]()}
                  </span>
                </span>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </Card.Header>
          <ToolPanelCardContent className="py-4" aria-busy={busy}>
            {busy ? (
              <LoadingOutput
                label={m["tools.markdownToHtmlConverter.outputLabel"]()}
              />
            ) : error ? (
              <ErrorOutput error={error} />
            ) : hasOutput ? (
              <CodeBlock
                code={output}
                previewCode={output.slice(0, MAX_PREVIEW_SOURCE)}
                title={m["tools.markdownToHtmlConverter.outputLabel"]()}
                language="html"
                copyLabel={m["tools.codeScreenshotGenerator.copyHtmlLabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                maxHeightClassName="h-[28rem]"
                className="min-h-112"
                actions={
                  downloadUrl && !busy ? (
                    <a
                      href={downloadUrl}
                      download="markdown.html"
                      className={buttonVariants({
                        size: "sm",
                        variant: "ghost",
                      })}
                    >
                      <Download aria-hidden className="size-4" />
                      {m["tools.markdownPreviewer.downloadHtmlLabel"]()}
                    </a>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" isDisabled>
                      <Download aria-hidden className="size-4" />
                      {m["tools.markdownPreviewer.downloadHtmlLabel"]()}
                    </Button>
                  )
                }
              >
                <Highlighted html={result?.highlighted ?? ""} />
              </CodeBlock>
            ) : (
              <EmptyOutput
                label={m["tools.markdownToHtmlConverter.outputLabel"]()}
                tall
              />
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolPanelCard>
        <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Card.Title>{m["common.archivepreview"]()}</Card.Title>
            <Card.Description>
              {m["tools.markdownToHtmlConverter.previewDescription"]()}
            </Card.Description>
          </div>
          <ToolPanelActionGroup className="shrink-0 sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              isDisabled={!hasOutput || busy}
              onPress={() => {
                const frame = printFrame.current;
                if (!frame?.contentWindow) return;
                frame.contentWindow.focus();
                frame.contentWindow.print();
              }}
            >
              <Printer aria-hidden className="size-4" />
              {m["tools.markdownToHtmlConverter.printHtmlLabel"]()}
            </Button>
          </ToolPanelActionGroup>
        </Card.Header>
        <ToolPanelCardContent className={hasOutput ? "px-0" : "py-4"}>
          {hasOutput ? (
            <iframe
              title={m["common.archivepreview"]()}
              sandbox=""
              srcDoc={result?.preview ?? ""}
              className="block h-88 w-full border-0 bg-white"
            />
          ) : (
            <EmptyOutput label={m["common.archivepreview"]()} />
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>

      {hasOutput ? (
        <iframe
          ref={printFrame}
          title={m["tools.markdownToHtmlConverter.printHtmlLabel"]()}
          sandbox="allow-modals allow-same-origin"
          srcDoc={result?.printDocument ?? ""}
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none fixed top-0 left-[-100vw] size-px opacity-0"
        />
      ) : null}

      <MarkdownArticle />
    </div>
  );
}

function Metrics({
  values,
  html = false,
}: {
  values: { characters: string; lines: string };
  html?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip size="sm" variant="secondary">
        {m["tools.markdownToHtmlConverter.charactersLabel"]()}{" "}
        {values.characters}
      </Chip>
      <Chip size="sm" variant="secondary">
        {m["tools.markdownToHtmlConverter.linesLabel"]()} {values.lines}
      </Chip>
      {html ? (
        <Chip size="sm" variant="secondary">
          HTML
        </Chip>
      ) : null}
    </div>
  );
}

function LoadingOutput({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-112 content-start gap-3 p-4"
    >
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

function ErrorOutput({ error }: { error: ConversionError }) {
  return (
    <section
      aria-label={m["tools.markdownToHtmlConverter.outputLabel"]()}
      className="min-h-112 rounded-xl border border-danger/50 p-3"
    >
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>
            {m["tools.markdownToHtmlConverter.localErrorTitle"]()}
          </Alert.Title>
          <Alert.Description>{errorMessage(error)}</Alert.Description>
        </Alert.Content>
      </Alert>
    </section>
  );
}

function EmptyOutput({
  label,
  tall = false,
}: {
  label: string;
  tall?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className={`flex items-center justify-center rounded-xl border border-dashed border-border bg-default/20 p-6 text-center ${tall ? "min-h-112" : "min-h-88"}`}
    >
      <div className="grid max-w-md justify-items-center gap-2">
        <Sparkles aria-hidden className="size-5 text-muted" />
        <p className="font-medium">
          {m["tools.markdownToHtmlConverter.emptyTitle"]()}
        </p>
        <p className="text-sm leading-6 text-muted">
          {m["tools.markdownToHtmlConverter.emptyDescription"]()}
        </p>
      </div>
    </section>
  );
}

function MarkdownArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.markdownToHtmlConverter.articleWhyTitle"]()}</h2>
      <p>{m["tools.markdownToHtmlConverter.articleWhyBody"]()}</p>
      <h2>{m["tools.markdownToHtmlConverter.articleWhatTitle"]()}</h2>
      <ul>
        {[
          m["tools.markdownToHtmlConverter.articleWhatItems0"](),
          m["tools.markdownToHtmlConverter.articleWhatItems1"](),
          m["tools.markdownToHtmlConverter.articleWhatItems2"](),
          m["tools.markdownToHtmlConverter.articleWhatItems3"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>{m["tools.markdownToHtmlConverter.articleSanitizeTitle"]()}</h2>
      <p>{m["tools.markdownToHtmlConverter.articleSanitizeBody"]()}</p>
      <h2>{m["tools.markdownToHtmlConverter.articleCasesTitle"]()}</h2>
      <ul>
        {[
          m["tools.markdownToHtmlConverter.articleCaseItems0"](),
          m["tools.markdownToHtmlConverter.articleCaseItems1"](),
          m["tools.markdownToHtmlConverter.articleCaseItems2"](),
          m["tools.markdownToHtmlConverter.articleCaseItems3"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </ToolArticle>
  );
}

function Highlighted({ html }: { html: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: the local conversion Worker escapes source before adding highlight spans
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function formatMetrics(value: string, locale: string) {
  const normalized = value.replaceAll("\r\n", "\n");
  const formatter = new Intl.NumberFormat(locale);
  return {
    characters: formatter.format(normalized.length),
    lines: formatter.format(normalized ? normalized.split("\n").length : 0),
  };
}

function getTextDirection(locale: string): "ltr" | "rtl" {
  return locale === "ar" ||
    locale.startsWith("ar-") ||
    locale === "he" ||
    locale.startsWith("he-")
    ? "rtl"
    : "ltr";
}

function errorMessage(error: ConversionError) {
  if (error === "too_large")
    return m["tools.markdownToHtmlConverter.localTooLargeError"]();
  if (error === "unsupported")
    return m["tools.markdownToHtmlConverter.localUnsupportedError"]();
  if (error === "timeout")
    return m["tools.markdownToHtmlConverter.localTimeoutError"]();
  if (error === "busy")
    return m["tools.markdownToHtmlConverter.localBusyError"]();
  if (error === "read_failed")
    return m["tools.markdownToHtmlConverter.localReadError"]();
  return m["tools.markdownToHtmlConverter.localInvalidInputError"]();
}

export default function MarkdownToHtml() {
  return (
    <ToolPage>
      <MarkdownToHtmlContent />
    </ToolPage>
  );
}
