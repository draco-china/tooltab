import { Alert, Card, Label, Skeleton, TextArea } from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { getLocale, type Locale } from "@/paraglide/runtime.js";
import type { RipemdAlgorithm } from "@workspace/tools/hash/ripemd";
import { blobChunks } from "@workspace/tools/hash/browser";
import { textBytes } from "@workspace/tools/hash/input";
import type { DigestResult } from "@workspace/tools/hash/format";
import { runStreamHash } from "./worker-client";

const DEFAULT_TEXT = "Hello, browser-native world!";
const DEBOUNCE_MS = 250;

type Message = (typeof m)["common.processing"];

type ArticleMessages = {
  title: Message;
  summary: Message;
  details?: Message;
  characteristicsTitle: Message;
  characteristics: [Message, Message][];
  usesTitle: Message;
  uses: Message[];
  securityTitle?: Message;
  securityStrong?: Message;
  securityBody?: Message;
  comparisonTitle?: Message;
  comparison?: Message[];
  recommendedTitle?: Message;
  recommended?: Message[];
  noteTitle?: Message;
  noteBody?: Message;
};

export type RipemdMessages = {
  textError: Message;
  fileError: Message;
  article: ArticleMessages;
};

type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: DigestResult<RipemdAlgorithm> }
  | { status: "error"; source: "text" | "file" };

type RipemdHashPageProps = {
  algorithm: RipemdAlgorithm;
  messages: RipemdMessages;
  legacyStorageKey: string;
};

export function RipemdHashPage({
  algorithm,
  messages,
  legacyStorageKey,
}: RipemdHashPageProps) {
  const locale = getLocale();
  const id = useId();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<DigestState>({ status: "loading" });
  useEffect(() => {
    safeLocalStorage.removeItem(legacyStorageKey);
  }, [legacyStorageKey]);

  useEffect(() => {
    const controller = new AbortController();
    if (!file && !text.length) {
      setState({ status: "idle" });
      return () => controller.abort();
    }

    setState({ status: "loading" });
    const timer = window.setTimeout(
      () => {
        void hashSource(algorithm, file, text, controller.signal)
          .then((digest) => {
            if (!controller.signal.aborted)
              setState({ status: "ready", digest });
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            setState({
              status: "error",
              source: file ? "file" : "text",
            });
          });
      },
      file ? 0 : DEBOUNCE_MS,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [algorithm, file, text]);

  const sourceDescription = file
    ? `${file.name} • ${formatFileSize(file.size, locale)}`
    : m["common.adler32plaintextdescription"]({}, { locale });

  return (
    <>
      <div
        className="grid gap-6"
        data-tool-panels
        data-ripemd-hash-page={algorithm}
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["common.adler32inputlabel"]({}, { locale })}
            </Card.Title>
            <Card.Description>{sourceDescription}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {file ? (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center">
                <p className="text-sm font-medium break-all">{file.name}</p>
                <p className="text-sm text-muted">
                  {formatFileSize(file.size, locale)}
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor={`${id}-text`}>
                  {m["common.adler32plaintextlabel"]({}, { locale })}
                </Label>
                <TextArea
                  id={`${id}-text`}
                  aria-label={m["common.adler32plaintextlabel"]({}, { locale })}
                  spellCheck={false}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className="min-h-64 flex-1 resize-y font-mono text-sm"
                />
              </div>
            )}
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]({}, { locale })}
              fileName={file ? sourceDescription : undefined}
              clearLabel={m["common.adler32plaintextlabel"]({}, { locale })}
              inputTestId="ripemd-file-input"
              onSelect={setFile}
              onClear={file ? () => setFile(null) : undefined}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["common.adler32hashresultlabel"]({}, { locale })}
            </Card.Title>
            <Card.Description>
              {file
                ? sourceDescription
                : m["common.adler32hashresultdescription"]({}, { locale })}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent
            className="py-4"
            aria-busy={state.status === "loading"}
          >
            <DigestSection state={state} messages={messages} locale={locale} />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{messages.article.title({}, { locale })}</h2>
        <p>{messages.article.summary({}, { locale })}</p>
        {messages.article.details ? (
          <p>{messages.article.details({}, { locale })}</p>
        ) : null}
        <p>
          <strong>
            {messages.article.characteristicsTitle({}, { locale })}
          </strong>
        </p>
        <ul>
          {messages.article.characteristics.map(([title, body]) => (
            <li key={title({}, { locale })}>
              <strong>{title({}, { locale })}</strong>: {body({}, { locale })}
            </li>
          ))}
        </ul>
        {messages.article.securityTitle ? (
          <p>
            <strong>{messages.article.securityTitle({}, { locale })}</strong>
            <br />✅{" "}
            <strong>{messages.article.securityStrong?.({}, { locale })}</strong>
            {messages.article.securityBody?.({}, { locale })}
          </p>
        ) : null}
        <p>
          <strong>{messages.article.usesTitle({}, { locale })}</strong>
        </p>
        <ul>
          {messages.article.uses.map((item) => (
            <li key={item({}, { locale })}>{item({}, { locale })}</li>
          ))}
        </ul>
        {messages.article.comparisonTitle && messages.article.comparison ? (
          <>
            <p>
              <strong>
                {messages.article.comparisonTitle({}, { locale })}
              </strong>
            </p>
            <ul>
              {messages.article.comparison.map((item) => (
                <li key={item({}, { locale })}>{item({}, { locale })}</li>
              ))}
            </ul>
          </>
        ) : null}
        {messages.article.recommendedTitle && messages.article.recommended ? (
          <>
            <p>
              <strong>
                {messages.article.recommendedTitle({}, { locale })}
              </strong>
            </p>
            <ul>
              {messages.article.recommended.map((item) => (
                <li key={item({}, { locale })}>{item({}, { locale })}</li>
              ))}
            </ul>
          </>
        ) : null}
        {messages.article.noteTitle && messages.article.noteBody ? (
          <>
            <p>
              <strong>{messages.article.noteTitle({}, { locale })}</strong>
            </p>
            <p>{messages.article.noteBody({}, { locale })}</p>
          </>
        ) : null}
      </ToolArticle>
    </>
  );
}

async function hashSource(
  algorithm: RipemdAlgorithm,
  file: File | null,
  text: string,
  signal: AbortSignal,
) {
  if (file) return runStreamHash(algorithm, blobChunks(file, signal), signal);
  const bytes = textBytes(text);
  return runStreamHash(algorithm, singleChunk(bytes), signal);
}

async function* singleChunk(bytes: Uint8Array) {
  try {
    yield bytes;
  } finally {
    bytes.fill(0);
  }
}

function DigestSection({
  state,
  messages,
  locale,
}: Readonly<{ state: DigestState; messages: RipemdMessages; locale: Locale }>) {
  if (state.status === "idle") {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center text-sm text-muted">
        {m["common.adler32plaintextdescription"]({}, { locale })}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Description>
            {(state.source === "file"
              ? messages.fileError
              : messages.textError)({}, { locale })}
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <div className="grid gap-3">
      {(
        [
          ["hex", m["common.adler32hexlabel"]({}, { locale })],
          ["base64", m["common.adler32base64label"]({}, { locale })],
          ["decimal", m["common.adler32decimallabel"]({}, { locale })],
          ["binary", m["common.adler32binarylabel"]({}, { locale })],
        ] as const
      ).map(([format, label]) => {
        const value = state.status === "ready" ? state.digest[format] : "";
        return (
          <section
            key={format}
            className="grid gap-3 rounded-xl border border-separator bg-default/20 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-sm font-medium">{label}</h3>
              <ToolCopyButton
                value={value}
                copyLabel={m["common.adler32copyresultlabel"]({}, { locale })}
                copiedLabel={m["common.actions.copied"]({}, { locale })}
                disabled={state.status === "loading"}
              />
            </div>
            {state.status === "loading" ? (
              <Skeleton className="h-5 w-full rounded-lg" />
            ) : (
              <code className="block text-xs leading-6 break-all sm:text-sm">
                {value}
              </code>
            )}
          </section>
        );
      })}
    </div>
  );
}

function formatFileSize(size: number, locale: string) {
  const format = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${format(size / 1024)} KB`;
  return `${format(size / (1024 * 1024))} MB`;
}
