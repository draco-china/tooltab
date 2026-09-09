import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Label,
  ListBox,
  Select,
  Skeleton,
  Surface,
} from "@heroui/react";
import { Download, Sparkles, Trash2, TriangleAlert } from "lucide-react";
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
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
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
import { runMarkdownWorker } from "./worker-client";

const DEFAULT_HTML = [
  "<article>",
  "  <h1>Release checklist</h1>",
  "  <p>Turn copied HTML into clean Markdown for docs, READMEs, or knowledge base notes.</p>",
  "  <ul>",
  "    <li>Import exported snippets from a CMS</li>",
  "    <li>Normalize copied markup before committing it</li>",
  "    <li>Keep code samples readable in Markdown</li>",
  "  </ul>",
  '  <pre><code class="language-bash">pnpm build',
  "pnpm test",
  "pnpm lint</code></pre>",
  "</article>",
].join("\n");

const STORAGE_KEYS = {
  html: "tools:html-to-markdown-converter:html-text",
  heading: "tools:html-to-markdown-converter:heading-style",
  bullet: "tools:html-to-markdown-converter:bullet-list-marker",
  code: "tools:html-to-markdown-converter:code-block-style",
} as const;

const HEADING_STYLES = ["atx", "setext"] as const;
const BULLET_STYLES = ["-", "*", "+"] as const;
const CODE_STYLES = ["fenced", "indented"] as const;
type HeadingStyle = (typeof HEADING_STYLES)[number];
type BulletStyle = (typeof BULLET_STYLES)[number];
type CodeStyle = (typeof CODE_STYLES)[number];
type Locale = "zh-CN" | "en-US";

function isOneOf<T extends string>(
  value: string | null,
  values: readonly T[],
): value is T {
  return value !== null && values.includes(value as T);
}

function FormatSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <Select
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key !== null && options.some(([item]) => item === key)) {
          onChange(String(key) as T);
        }
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger aria-label={label} className="min-h-11 w-full">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map(([key, optionLabel]) => (
            <ListBox.Item key={key} id={key} textValue={optionLabel}>
              {optionLabel}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function FormatOptions({
  locale,
  heading,
  bullet,
  code,
  onHeadingChange,
  onBulletChange,
  onCodeChange,
}: {
  locale: Locale;
  heading: HeadingStyle;
  bullet: BulletStyle;
  code: CodeStyle;
  onHeadingChange: (value: HeadingStyle) => void;
  onBulletChange: (value: BulletStyle) => void;
  onCodeChange: (value: CodeStyle) => void;
}) {
  return (
    <Surface className="grid gap-5 rounded-xl border border-border p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-balance">
          {m["tools.htmlToMarkdownConverter.optionsTitle"]({}, { locale })}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted">
          {m["tools.htmlToMarkdownConverter.optionsDescription"](
            {},
            { locale },
          )}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <FormatSelect
          label={m["shared.markdownTools.headings"]({}, { locale })}
          value={heading}
          options={[
            [
              "atx",
              m["tools.htmlToMarkdownConverter.headingStyleAtxLabel"](
                {},
                {
                  locale,
                },
              ),
            ],
            [
              "setext",
              m["tools.htmlToMarkdownConverter.headingStyleSetextLabel"](
                {},
                {
                  locale,
                },
              ),
            ],
          ]}
          onChange={onHeadingChange}
        />
        <FormatSelect
          label={m["tools.htmlToMarkdownConverter.bulletStyleLabel"](
            {},
            { locale },
          )}
          value={bullet}
          options={[
            [
              "-",
              m["tools.htmlToMarkdownConverter.bulletStyleDashLabel"](
                {},
                {
                  locale,
                },
              ),
            ],
            [
              "*",
              m["tools.htmlToMarkdownConverter.bulletStyleAsteriskLabel"](
                {},
                {
                  locale,
                },
              ),
            ],
            [
              "+",
              m["tools.htmlToMarkdownConverter.bulletStylePlusLabel"](
                {},
                {
                  locale,
                },
              ),
            ],
          ]}
          onChange={onBulletChange}
        />
        <FormatSelect
          label={m["tools.htmlToMarkdownConverter.codeBlockStyleLabel"](
            {},
            { locale },
          )}
          value={code}
          options={[
            [
              "fenced",
              m["tools.htmlToMarkdownConverter.codeBlockStyleFencedLabel"](
                {},
                {
                  locale,
                },
              ),
            ],
            [
              "indented",
              m["tools.htmlToMarkdownConverter.codeBlockStyleIndentedLabel"](
                {},
                {
                  locale,
                },
              ),
            ],
          ]}
          onChange={onCodeChange}
        />
      </div>
    </Surface>
  );
}

function Highlighted({ html }: { html: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: the local Worker escapes source before adding highlight spans
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function HtmlToMarkdownContent() {
  const locale = getLocale() as Locale;
  const reader = useRef<FileReader | null>(null);
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const downloadUrlRef = useRef<string | null>(null);
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [heading, setHeading] = useState<HeadingStyle>("atx");
  const [bullet, setBullet] = useState<BulletStyle>("-");
  const [code, setCode] = useState<CodeStyle>("fenced");
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<MarkdownResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [conversionVersion, setConversionVersion] = useState(0);
  const deferredHtml = useDeferredValue(html);

  function invalidate() {
    revision.current++;
    controller.current?.abort();
    if (reader.current) {
      reader.current.onload = null;
      reader.current.onerror = null;
      reader.current.abort();
    }
    controller.current = null;
    reader.current = null;
    setResult(null);
    setError("");
    setBusy(false);
  }

  useEffect(() => {
    try {
      const storedHtml = localStorage.getItem(STORAGE_KEYS.html);
      const storedHeading = localStorage.getItem(STORAGE_KEYS.heading);
      const storedBullet = localStorage.getItem(STORAGE_KEYS.bullet);
      const storedCode = localStorage.getItem(STORAGE_KEYS.code);
      if (storedHtml !== null) setHtml(storedHtml);
      if (isOneOf(storedHeading, HEADING_STYLES)) setHeading(storedHeading);
      if (isOneOf(storedBullet, BULLET_STYLES)) setBullet(storedBullet);
      if (isOneOf(storedCode, CODE_STYLES)) setCode(storedCode);
    } catch {
      // Local storage is optional; the default state remains usable.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.html, html);
      localStorage.setItem(STORAGE_KEYS.heading, heading);
      localStorage.setItem(STORAGE_KEYS.bullet, bullet);
      localStorage.setItem(STORAGE_KEYS.code, code);
    } catch {}
  }, [bullet, code, heading, html, hydrated]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: conversionVersion explicitly retries the Worker when a file or sample replaces identical text
  useEffect(() => {
    if (!hydrated || !deferredHtml.trim()) {
      setResult(null);
      setBusy(false);
      return;
    }
    const current = ++revision.current;
    const timeout = window.setTimeout(() => {
      const nextController = new AbortController();
      controller.current = nextController;
      setBusy(true);
      void (async () =>
        runMarkdownWorker(
          {
            ...markdownDefaults,
            kind: "to-markdown",
            input: deferredHtml,
            language: locale,
            headingStyle: heading,
            bulletListMarker: bullet,
            codeBlockStyle: code,
          },
          nextController.signal,
        ))()
        .then((next) => {
          if (revision.current === current) setResult(next);
        })
        .catch((cause) => {
          if (revision.current !== current || nextController.signal.aborted)
            return;
          setError(
            cause instanceof MarkdownError ? cause.code : "invalid_input",
          );
        })
        .finally(() => {
          if (revision.current === current) {
            controller.current = null;
            setBusy(false);
          }
        });
    }, 200);
    return () => {
      window.clearTimeout(timeout);
      if (controller.current) {
        controller.current.abort();
        controller.current = null;
      }
    };
  }, [
    bullet,
    code,
    conversionVersion,
    deferredHtml,
    heading,
    hydrated,
    locale,
  ]);

  useEffect(() => {
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    if (!result?.output) {
      setDownloadUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(
      new Blob([result.output], { type: "text/markdown;charset=utf-8" }),
    );
    downloadUrlRef.current = nextUrl;
    setDownloadUrl(nextUrl);
    return () => {
      if (downloadUrlRef.current === nextUrl) {
        URL.revokeObjectURL(nextUrl);
        downloadUrlRef.current = null;
      }
    };
  }, [result]);

  useEffect(
    () => () => {
      revision.current++;
      controller.current?.abort();
      if (reader.current) {
        reader.current.onload = null;
        reader.current.onerror = null;
        reader.current.abort();
      }
    },
    [],
  );

  function replaceHtml(value: string) {
    const unchanged = value === html;
    invalidate();
    setHtml(value);
    if (unchanged) setConversionVersion((current) => current + 1);
  }

  function changeOption<T>(
    currentValue: T,
    setter: (value: T) => void,
    value: T,
  ) {
    if (Object.is(currentValue, value)) return;
    invalidate();
    setter(value);
  }

  function importFile(file: File) {
    invalidate();
    if (file.size > MAX_MARKDOWN_INPUT) {
      setError("too_large");
      return;
    }
    const current = revision.current;
    const nextReader = new FileReader();
    reader.current = nextReader;
    setBusy(true);
    nextReader.onload = () => {
      if (revision.current !== current) return;
      try {
        const nextHtml = new TextDecoder("utf8", { fatal: true }).decode(
          nextReader.result as ArrayBuffer,
        );
        reader.current = null;
        setBusy(false);
        startTransition(() => replaceHtml(nextHtml));
      } catch {
        reader.current = null;
        setBusy(false);
        setError("read_failed");
      }
    };
    nextReader.onerror = () => {
      if (revision.current !== current) return;
      reader.current = null;
      setBusy(false);
      setError("read_failed");
    };
    nextReader.readAsArrayBuffer(file);
  }

  return (
    <div className="grid min-w-0 gap-8">
      <FormatOptions
        locale={locale}
        heading={heading}
        bullet={bullet}
        code={code}
        onHeadingChange={(value) => changeOption(heading, setHeading, value)}
        onBulletChange={(value) => changeOption(bullet, setBullet, value)}
        onCodeChange={(value) => changeOption(code, setCode, value)}
      />

      <div className="grid items-stretch gap-6 xl:grid-cols-2" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <Card.Title>
                {m["tools.htmlToMarkdownConverter.inputLabel"]({}, { locale })}
              </Card.Title>
              <Card.Description>
                {m["tools.htmlToMarkdownConverter.inputDescription"](
                  {},
                  { locale },
                )}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onPress={() => replaceHtml(DEFAULT_HTML)}
              >
                <Sparkles aria-hidden className="size-4" />
                {m["shared.bcrypt.sample"]({}, { locale })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                isDisabled={!html && !busy}
                onPress={() => replaceHtml("")}
              >
                <Trash2 aria-hidden className="size-4" />
                {m["shared.textAnalysis.clear"]({}, { locale })}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <CodeEditor
              aria-label={m["tools.htmlToMarkdownConverter.inputLabel"](
                {},
                { locale },
              )}
              language="html"
              modelPath="tooltab://html-to-markdown/source.html"
              value={html.slice(0, MAX_PREVIEW_SOURCE)}
              readOnly={html.length > MAX_PREVIEW_SOURCE}
              height={384}
              onChange={replaceHtml}
            />
          </ToolPanelCardContent>
          <ToolPanelCardFooter
            className="grid gap-3"
            aria-label={m["tools.htmlToMarkdownConverter.toolbarLabel"](
              {},
              { locale },
            )}
          >
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]({}, { locale })}
              accept={[".html", ".htm", ".txt", "text/html", "text/plain"]}
              isDisabled={busy}
              onSelect={importFile}
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <CodeBlock
          code={result?.output ?? ""}
          previewCode={result?.output.slice(0, MAX_PREVIEW_SOURCE)}
          title={m["tools.htmlToMarkdownConverter.outputLabel"]({}, { locale })}
          description={m["tools.htmlToMarkdownConverter.outputDescription"](
            {},
            { locale },
          )}
          language="markdown"
          copyLabel={m["tools.htmlToMarkdownConverter.copyMarkdownLabel"](
            {},
            { locale },
          )}
          copiedLabel={m["common.actions.copied"]({}, { locale })}
          maxHeightClassName="h-96"
          className="h-full"
          codeClassName="[&_.hljs-section]:font-semibold"
          actions={
            downloadUrl ? (
              <a
                href={downloadUrl}
                download="converted.md"
                className={buttonVariants({ size: "sm", variant: "primary" })}
              >
                <Download aria-hidden className="size-4" />
                {m["tools.htmlToMarkdownConverter.downloadMarkdownLabel"](
                  {},
                  { locale },
                )}
              </a>
            ) : (
              <Button type="button" size="sm" variant="primary" isDisabled>
                <Download aria-hidden className="size-4" />
                {m["tools.htmlToMarkdownConverter.downloadMarkdownLabel"](
                  {},
                  { locale },
                )}
              </Button>
            )
          }
          statusContent={
            busy ? (
              <div
                role="status"
                aria-label={m["tools.htmlToMarkdownConverter.outputLabel"](
                  {},
                  { locale },
                )}
                className="grid min-h-96 content-start gap-3"
              >
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ) : error ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.htmlToMarkdownConverter.conversionErrorTitle"](
                      {},
                      { locale },
                    )}
                  </Alert.Title>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : result ? undefined : (
              <section
                aria-label={m["tools.htmlToMarkdownConverter.outputLabel"](
                  {},
                  { locale },
                )}
                className="flex min-h-96 items-center bg-default/20 p-4"
              >
                <p className="text-sm leading-6 text-muted">
                  {m["tools.htmlToMarkdownConverter.outputEmptyDescription"](
                    {},
                    { locale },
                  )}
                </p>
              </section>
            )
          }
        >
          {result ? <Highlighted html={result.highlighted} /> : null}
        </CodeBlock>
      </div>

      <ToolArticle>
        <h2>
          {m["shared.barcodeTools.generatorArticleWhatTitle"]({}, { locale })}
        </h2>
        <p>
          {m["tools.htmlToMarkdownConverter.articleWhatBody"]({}, { locale })}
        </p>
        <h2>
          {m["tools.htmlToMarkdownConverter.articleWhenTitle"]({}, { locale })}
        </h2>
        <ul>
          {[
            m["tools.htmlToMarkdownConverter.articleWhenItems0"](
              {},
              { locale },
            ),
            m["tools.htmlToMarkdownConverter.articleWhenItems1"](
              {},
              { locale },
            ),
            m["tools.htmlToMarkdownConverter.articleWhenItems2"](
              {},
              { locale },
            ),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>
          {m["tools.htmlToMarkdownConverter.articleCheckTitle"]({}, { locale })}
        </h2>
        <ul>
          {[
            m["tools.htmlToMarkdownConverter.articleCheckItems0"](
              {},
              { locale },
            ),
            m["tools.htmlToMarkdownConverter.articleCheckItems1"](
              {},
              { locale },
            ),
            m["tools.htmlToMarkdownConverter.articleCheckItems2"](
              {},
              { locale },
            ),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function HtmlToMarkdown() {
  return (
    <ToolPage>
      <HtmlToMarkdownContent />
    </ToolPage>
  );
}
