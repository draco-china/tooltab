import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Chip, Skeleton, Switch } from "@heroui/react";
import {
  Download,
  FileText,
  Printer,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { getLocale } from "@/paraglide/runtime.js";
import { slugifyHeading } from "@workspace/tools/text/markdown-heading";
import {
  MAX_MARKDOWN_INPUT,
  MarkdownError,
} from "@workspace/tools/text/markdown-contract";
import { type MarkdownResult, markdownDefaults } from "../markdown-tools/types";
import { runMarkdownWorker } from "../markdown-tools/worker-client";

type PreviewTheme = "clean" | "slate";
type RenderState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; result: MarkdownResult }
  | { state: "error"; code: MarkdownError["code"] };

const PREVIEW_DELAY_MS = 180;
const PRINT_TIMEOUT_MS = 120_000;
const IMPORT_ACCEPT = [
  ".md",
  ".markdown",
  ".mdown",
  ".txt",
  "text/markdown",
  "text/plain",
];
const DEFAULT_MARKDOWN = `# Product launch checklist

Launch notes for the next release stay in Markdown until the draft is ready to
publish.

## Highlights
- Faster onboarding flow
- New keyboard shortcuts
- Print-friendly HTML export

## Release plan
| Milestone | Owner | Status |
| --- | --- | --- |
| Draft copy | Content | Done |
| QA preview | Product | In review |
| Publish docs | Marketing | Pending |

## Snippet
\`\`\`ts
export function greet(name: string) {
  return \`Hello, \${name}!\`
}
\`\`\`

## Follow-up
1. Publish the README
2. Share the changelog
3. Print a copy for review

> Markdown is easiest to proof when you can see the structure and the rendered
> result at the same time.
`;

function MarkdownPreviewerPageContent() {
  const locale = getLocale();
  const controllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<FileReader | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRef = useRef(0);
  const downloadUrlRef = useRef("");
  const printCleanupRef = useRef<(() => void) | null>(null);
  const previewScrollerRef = useRef<HTMLDivElement | null>(null);
  const previewArticleRef = useRef<HTMLElement | null>(null);
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("clean");
  const [sanitizeHtml, setSanitizeHtml] = useState(true);
  const [showOutline, setShowOutline] = useState(true);
  const [renderVersion, setRenderVersion] = useState(0);
  const [render, setRender] = useState<RenderState>({ state: "loading" });
  const [downloadUrl, setDownloadUrl] = useState("");
  const deferredMarkdown = useDeferredValue(markdown);
  const isPending = deferredMarkdown !== markdown || render.state === "loading";
  const result = render.state === "ready" ? render.result : null;
  const hasMarkdown = markdown.trim().length > 0;

  function stopTransientWork() {
    revisionRef.current++;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    controllerRef.current?.abort();
    controllerRef.current = null;
    releaseReader(readerRef, true);
    printCleanupRef.current?.();
    revokeUrl(downloadUrlRef);
    setDownloadUrl("");
  }

  useEffect(
    () => () => {
      revisionRef.current++;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      controllerRef.current?.abort();
      controllerRef.current = null;
      releaseReader(readerRef, true);
      printCleanupRef.current?.();
      revokeUrl(downloadUrlRef);
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: renderVersion intentionally reruns identical imported or sample content
  useEffect(() => {
    if (!deferredMarkdown.trim()) {
      setRender({ state: "idle" });
      return;
    }

    const revision = ++revisionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRender({ state: "loading" });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void (async () => {
        try {
          const next = await runMarkdownWorker(
            {
              ...markdownDefaults,
              kind: "preview",
              input: deferredMarkdown,
              language: locale,
              direction: "ltr",
              sanitize: sanitizeHtml,
              theme: previewTheme,
            },
            controller.signal,
          );
          if (
            revision === revisionRef.current &&
            controllerRef.current === controller
          ) {
            setRender({ state: "ready", result: next });
          }
        } catch (error) {
          if (
            revision === revisionRef.current &&
            controllerRef.current === controller &&
            !controller.signal.aborted
          ) {
            setRender({
              state: "error",
              code:
                error instanceof MarkdownError ? error.code : "invalid_input",
            });
          }
        } finally {
          if (controllerRef.current === controller) {
            controllerRef.current = null;
          }
        }
      })();
    }, PREVIEW_DELAY_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [deferredMarkdown, locale, previewTheme, renderVersion, sanitizeHtml]);

  useEffect(() => {
    revokeUrl(downloadUrlRef);
    if (!result?.document || !hasMarkdown) {
      setDownloadUrl("");
      return;
    }

    const url = URL.createObjectURL(
      new Blob([result.document], { type: "text/html;charset=utf-8" }),
    );
    downloadUrlRef.current = url;
    setDownloadUrl(url);
    return () => {
      if (downloadUrlRef.current === url) revokeUrl(downloadUrlRef);
    };
  }, [hasMarkdown, result]);

  function changeMarkdown(value: string) {
    stopTransientWork();
    setMarkdown(value);
    setRender(value.trim() ? { state: "loading" } : { state: "idle" });
  }

  function loadSample() {
    if (
      markdown !== DEFAULT_MARKDOWN &&
      !window.confirm(m["tools.markdownPreviewer.loadSampleConfirmMessage"]())
    ) {
      return;
    }
    stopTransientWork();
    startTransition(() => {
      setMarkdown(DEFAULT_MARKDOWN);
      setRender({ state: "loading" });
      setRenderVersion((version) => version + 1);
    });
  }

  function clearMarkdown() {
    if (
      !hasMarkdown ||
      !window.confirm(m["tools.markdownPreviewer.clearConfirmMessage"]())
    )
      return;
    stopTransientWork();
    startTransition(() => {
      setMarkdown("");
      setRender({ state: "idle" });
    });
  }

  function changeTheme(theme: PreviewTheme) {
    if (theme === previewTheme) return;
    stopTransientWork();
    setPreviewTheme(theme);
    setRender(hasMarkdown ? { state: "loading" } : { state: "idle" });
  }

  function changeSanitize(value: boolean) {
    stopTransientWork();
    setSanitizeHtml(value);
    setRender(hasMarkdown ? { state: "loading" } : { state: "idle" });
  }

  function importFile(file: File) {
    stopTransientWork();
    if (file.size > MAX_MARKDOWN_INPUT) {
      setRender({ state: "error", code: "too_large" });
      return;
    }

    const revision = revisionRef.current;
    try {
      const reader = new FileReader();
      readerRef.current = reader;
      setRender({ state: "loading" });
      reader.onload = () => {
        const fileResult = reader.result;
        releaseReader(readerRef, false, reader);
        if (
          revision !== revisionRef.current ||
          !(fileResult instanceof ArrayBuffer)
        ) {
          return;
        }
        try {
          const value = new TextDecoder("utf-8", { fatal: true }).decode(
            fileResult,
          );
          startTransition(() => {
            setMarkdown(value);
            setRender(value.trim() ? { state: "loading" } : { state: "idle" });
            setRenderVersion((version) => version + 1);
          });
        } catch {
          setRender({ state: "error", code: "read_failed" });
        }
      };
      reader.onerror = () => {
        releaseReader(readerRef, false, reader);
        if (revision === revisionRef.current) {
          setRender({ state: "error", code: "read_failed" });
        }
      };
      reader.readAsArrayBuffer(file);
    } catch {
      releaseReader(readerRef, false);
      if (revision === revisionRef.current) {
        setRender({ state: "error", code: "read_failed" });
      }
    }
  }

  function downloadHtml() {
    if (!downloadUrl || !result) return;
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `${slugifyHeading(result.toc[0]?.text ?? m["tools.markdownPreviewer.untitledHeadingLabel"]())}.html`;
    anchor.click();
  }

  function printPreview() {
    if (!result || !hasMarkdown) return;
    printCleanupRef.current?.();
    const frame = document.createElement("iframe");
    frame.title = m["tools.markdownPreviewer.printLabel"]();
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    frame.style.position = "fixed";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let printWindow: Window | null = null;
    const clean = () => {
      if (timeout !== null) clearTimeout(timeout);
      timeout = null;
      frame.onload = null;
      printWindow?.removeEventListener("afterprint", clean);
      frame.remove();
      if (printCleanupRef.current === clean) printCleanupRef.current = null;
    };
    printCleanupRef.current = clean;
    frame.onload = () => {
      printWindow = frame.contentWindow;
      printWindow?.addEventListener("afterprint", clean, { once: true });
      printWindow?.print();
    };
    frame.srcdoc = showOutline ? result.printWithOutline : result.printDocument;
    document.body.append(frame);
    timeout = setTimeout(clean, PRINT_TIMEOUT_MS);
  }

  function scrollToHeading(id: string) {
    const scroller = previewScrollerRef.current;
    const heading = previewArticleRef.current?.querySelector<HTMLElement>(
      `[id="${id.replaceAll('"', '\\"')}"]`,
    );
    if (!scroller || !heading) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    scroller.scrollTo({
      top: Math.max(headingRect.top - scrollerRect.top + scroller.scrollTop, 0),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  const badges = result
    ? [
        [m["shared.markdownTools.words"](), result.stats.words],
        [m["shared.markdownTools.headings"](), result.stats.headings],
        [m["shared.markdownTools.links"](), result.stats.links],
        [m["shared.markdownTools.images"](), result.stats.images],
        [
          m["tools.markdownPreviewer.readTimeLabel"](),
          result.stats.readTimeMinutes,
        ],
      ]
    : [
        [m["shared.markdownTools.words"](), 0],
        [m["shared.markdownTools.headings"](), 0],
        [m["shared.markdownTools.links"](), 0],
        [m["shared.markdownTools.images"](), 0],
        [m["tools.markdownPreviewer.readTimeLabel"](), 0],
      ];

  return (
    <div className="grid gap-8">
      <ToolPanelCard>
        <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid min-w-0 gap-1">
            <Card.Title>
              {m["tools.markdownPreviewer.editorTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.markdownPreviewer.editorDescription"]()}
            </Card.Description>
          </div>
          <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onPress={loadSample}
            >
              <Sparkles aria-hidden className="size-4" />
              {m["shared.baseEncoding.base58EncoderLoadSampleLabel"]()}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              isDisabled={!hasMarkdown}
              onPress={clearMarkdown}
            >
              <Trash2 aria-hidden className="size-4" />
              {m["shared.textAnalysis.clear"]()}
            </Button>
          </div>
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          <div className="relative">
            <CodeEditor
              aria-label={m["tools.markdownPreviewer.sourceLabel"]()}
              language="markdown"
              modelPath="tooltab://markdown/markdown-previewer.md"
              value={markdown}
              height={384}
              onChange={changeMarkdown}
            />
            {!markdown ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-s-4 top-16 z-10 font-mono text-sm text-muted"
              >
                {m["tools.markdownPreviewer.sourcePlaceholder"]()}
              </span>
            ) : null}
          </div>
        </ToolPanelCardContent>
        <ToolPanelCardFooter className="grid gap-4">
          <ToolFilePicker
            label={m["shared.csvJson.import"]()}
            description={m["tools.markdownPreviewer.localFileDescription"]()}
            accept={IMPORT_ACCEPT}
            onSelect={importFile}
          />
        </ToolPanelCardFooter>
      </ToolPanelCard>

      <ToolPanelCard>
        <Card.Header className="gap-4 border-b border-separator">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Card.Title>
                {m["tools.markdownPreviewer.previewTitle"]()}
              </Card.Title>
              <Card.Description className="mt-1.5 max-w-2xl">
                {m["tools.markdownPreviewer.previewDescription"]()}
              </Card.Description>
            </div>
            <div className="flex min-w-0 flex-col gap-3 lg:items-end">
              <fieldset
                aria-label={m["tools.codeScreenshotGenerator.themeLabel"]()}
                className="grid w-full grid-cols-2 rounded-xl border border-border p-1 sm:w-auto"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={previewTheme === "clean" ? "secondary" : "ghost"}
                  aria-pressed={previewTheme === "clean"}
                  onPress={() => changeTheme("clean")}
                >
                  {m["tools.markdownPreviewer.cleanThemeLabel"]()}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={previewTheme === "slate" ? "secondary" : "ghost"}
                  aria-pressed={previewTheme === "slate"}
                  onPress={() => changeTheme("slate")}
                >
                  {m["tools.markdownPreviewer.slateThemeLabel"]()}
                </Button>
              </fieldset>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <Switch isSelected={sanitizeHtml} onChange={changeSanitize}>
                  <Switch.Content className="flex min-h-11 items-center gap-2 text-sm text-muted">
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <span>
                      {m["tools.markdownPreviewer.sanitizeHtmlLabel"]()}
                    </span>
                  </Switch.Content>
                </Switch>
                <Switch
                  isSelected={showOutline}
                  onChange={(value) => {
                    printCleanupRef.current?.();
                    setShowOutline(value);
                  }}
                >
                  <Switch.Content className="flex min-h-11 items-center gap-2 text-sm text-muted">
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <span>
                      {m["tools.markdownPreviewer.showOutlineLabel"]()}
                    </span>
                  </Switch.Content>
                </Switch>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {badges.map(([label, value]) => (
              <Chip key={label} size="sm" variant="secondary">
                {label}{" "}
                <span className="font-medium text-foreground">{value}</span>
              </Chip>
            ))}
          </div>
          <ToolPanelActionGroup className="justify-start sm:justify-end">
            <ToolCopyButton
              value={result?.document ?? ""}
              copyLabel={m["tools.codeScreenshotGenerator.copyHtmlLabel"]()}
              copiedLabel={m["common.actions.copied"]()}
              disabled={!hasMarkdown || !result}
            />
            <Button
              type="button"
              size="sm"
              isDisabled={!downloadUrl || !result}
              onPress={downloadHtml}
            >
              <Download aria-hidden className="size-4" />
              {m["tools.markdownPreviewer.downloadHtmlLabel"]()}
            </Button>
            <Button
              type="button"
              size="sm"
              isDisabled={!hasMarkdown || !result}
              onPress={printPreview}
            >
              <Printer aria-hidden className="size-4" />
              {m["tools.markdownPreviewer.printLabel"]()}
            </Button>
          </ToolPanelActionGroup>
        </Card.Header>

        <ToolPanelCardContent className="p-0" aria-busy={isPending}>
          {isPending ? (
            <PreviewSkeleton
              label={m["tools.markdownPreviewer.localProcessingLabel"]()}
            />
          ) : render.state === "error" ? (
            <PreviewError code={render.code} />
          ) : render.state === "ready" && hasMarkdown ? (
            <div
              className={`grid min-w-0 ${
                showOutline
                  ? "xl:grid-cols-[minmax(0,1fr)_16rem]"
                  : "grid-cols-1"
              }`}
            >
              <section
                ref={previewScrollerRef}
                aria-label={m["tools.markdownPreviewer.previewTitle"]()}
                className={`h-120 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain sm:h-136 ${
                  previewTheme === "slate" ? "bg-slate-950" : "bg-background"
                }`}
              >
                <article
                  ref={previewArticleRef}
                  className={previewArticleClassName(previewTheme)}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: the Worker returns resource-free HTML from sanitizePreview before it reaches this component.
                  dangerouslySetInnerHTML={{
                    __html: extractArticleHtml(render.result.preview),
                  }}
                />
              </section>
              {showOutline ? (
                <PreviewOutline
                  items={render.result.toc}
                  onSelect={scrollToHeading}
                />
              ) : null}
            </div>
          ) : (
            <EmptyPreview />
          )}
          {result?.previewLimited ? (
            <p className="border-t border-separator px-4 py-3 text-sm text-muted">
              {m["tools.markdownPreviewer.localPreviewTruncated"]()}
            </p>
          ) : null}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["tools.markdownPreviewer.article.purposeTitle"]()}</h2>
        <p>{m["tools.markdownPreviewer.articlePurposeBody"]()}</p>
        <h2>{m["tools.markdownPreviewer.articleUseTitle"]()}</h2>
        <p>{m["tools.markdownPreviewer.articleUseBody"]()}</p>
        <h2>{m["tools.markdownPreviewer.articleTipsTitle"]()}</h2>
        <p>{m["tools.markdownPreviewer.articleTipsBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function PreviewOutline({
  items,
  onSelect,
}: {
  items: MarkdownResult["toc"];
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="min-w-0 border-t border-separator px-4 py-4 sm:px-6 xl:flex xl:h-136 xl:flex-col xl:border-s xl:border-t-0 xl:px-0 xl:py-5 xl:ps-6">
      <h2 className="text-base font-semibold">
        {m["tools.markdownPreviewer.outlineTitle"]()}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {m["tools.markdownPreviewer.outlineDescription"]()}
      </p>
      {items.length ? (
        <div className="mt-3 max-h-72 overflow-y-auto pe-2 xl:max-h-none xl:min-h-0 xl:flex-1">
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                fullWidth
                className="w-full rounded-lg px-2.5 py-2 text-start text-sm wrap-break-word text-muted transition-colors hover:bg-default hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
                style={{
                  paddingInlineStart: `${0.25 + (item.level - 1) * 0.85}rem`,
                }}
                onClick={() => onSelect(item.id)}
              >
                {item.text}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex min-h-40 flex-col items-center justify-center rounded-xl border border-border bg-default/20 p-6 text-center">
          <FileText aria-hidden className="size-5 text-muted" />
          <p className="mt-3 font-medium">
            {m["tools.markdownPreviewer.outlineEmptyTitle"]()}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {m["tools.markdownPreviewer.outlineEmptyDescription"]()}
          </p>
        </div>
      )}
    </aside>
  );
}

function EmptyPreview() {
  return (
    <section className="m-4 flex min-h-64 flex-col items-center justify-center rounded-xl border border-border bg-default/20 p-6 text-center sm:m-5">
      <FileText aria-hidden className="size-5 text-muted" />
      <h2 className="mt-3 font-medium">
        {m["tools.markdownPreviewer.previewEmptyTitle"]()}
      </h2>
      <p className="mt-1 max-w-lg text-sm leading-6 text-muted">
        {m["tools.markdownPreviewer.previewEmptyDescription"]()}
      </p>
    </section>
  );
}

function PreviewSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-120 content-start gap-4 p-5 sm:min-h-136 sm:p-6"
    >
      <Skeleton className="h-8 w-3/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-3 h-6 w-2/5" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

function PreviewError({ code }: { code: MarkdownError["code"] }) {
  const description =
    code === "too_large"
      ? m["tools.markdownPreviewer.localFileTooLargeError"]()
      : code === "read_failed"
        ? m["tools.jsonToTomlConverter.errorsReadFailed"]()
        : m["tools.markdownPreviewer.localRenderError"]();
  return (
    <section className="flex min-h-64 items-start p-4 sm:p-5">
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>
            {m["tools.markdownPreviewer.previewTitle"]()}
          </Alert.Title>
          <Alert.Description>{description}</Alert.Description>
        </Alert.Content>
      </Alert>
    </section>
  );
}

function releaseReader(
  ref: { current: FileReader | null },
  abort: boolean,
  expected = ref.current,
) {
  const reader = expected;
  if (!reader) return;
  reader.onload = null;
  reader.onerror = null;
  reader.onabort = null;
  if (abort && reader.readyState === FileReader.LOADING) reader.abort();
  if (ref.current === reader) ref.current = null;
}

function revokeUrl(ref: { current: string }) {
  if (!ref.current) return;
  URL.revokeObjectURL(ref.current);
  ref.current = "";
}

function extractArticleHtml(document: string) {
  return document.match(/<article>([\s\S]*)<\/article>/u)?.[1] ?? "";
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function previewArticleClassName(theme: PreviewTheme) {
  const base =
    "min-h-full w-full max-w-full min-w-0 px-4 py-4 text-sm leading-7 sm:px-6 sm:py-5 [&_a]:break-words [&_a]:text-accent [&_blockquote]:my-5 [&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-4 [&_blockquote]:text-muted [&_code]:rounded-md [&_code]:bg-default [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:mb-3 [&_h1]:scroll-mt-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-7 [&_h2]:scroll-mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:scroll-mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-5 [&_h4]:scroll-mt-4 [&_h4]:font-semibold [&_img]:max-w-full [&_li]:mt-2 [&_ol]:my-4 [&_ol]:ms-5 [&_ol]:list-decimal [&_p:not(:first-child)]:mt-4 [&_pre]:my-5 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-default/50 [&_pre]:px-4 [&_pre]:py-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-5 [&_table]:block [&_table]:w-full [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_ul]:my-4 [&_ul]:ms-5 [&_ul]:list-disc";
  return theme === "slate"
    ? `${base} bg-slate-950 text-slate-100 [&_blockquote]:border-slate-700 [&_blockquote]:text-slate-300 [&_code]:bg-white/10 [&_pre]:border-slate-700 [&_pre]:bg-slate-900 [&_td]:border-slate-800 [&_th]:border-slate-700`
    : `${base} bg-background text-foreground`;
}

export default function MarkdownPreviewerPage() {
  return (
    <ToolPage>
      <MarkdownPreviewerPageContent />
    </ToolPage>
  );
}
