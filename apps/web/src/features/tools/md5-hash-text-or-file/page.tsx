import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Label,
  Skeleton,
  Spinner,
  TextArea,
} from "@heroui/react";
import { FileText, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { formatFileSize } from "@/lib/file-size";
import { safeLocalStorage } from "@/lib/safe-storage";
import { getLocale } from "@/paraglide/runtime.js";
import { blobChunks, textBytes } from "./logic";
import type { HashResult } from "@workspace/tools/hash/md5";
import { runMd5Hash } from "./worker-client";

const DEFAULT_TEXT = "Hello, browser-native world!";
const DEBOUNCE_MS = 250;
const STORAGE_KEY = "tools:md5-hash-text-or-file:text";

type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: HashResult }
  | { status: "error"; message: string };

async function* zeroingChunks(blob: Blob, signal: AbortSignal) {
  for await (const chunk of blobChunks(blob, signal)) {
    try {
      yield chunk;
    } finally {
      chunk.fill(0);
    }
  }
}

async function* zeroingTextChunks(text: string, signal: AbortSignal) {
  const chunk = textBytes(text);
  try {
    signal.throwIfAborted();
    yield chunk;
  } finally {
    chunk.fill(0);
  }
}

function Md5HashContent() {
  const locale = getLocale();
  const textError = m["tools.highwayhashHashTextOrFile.textHashErrorLabel"]();
  const fileError = m["tools.highwayhashHashTextOrFile.fileHashErrorLabel"]();
  const id = useId();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<DigestState>({ status: "loading" });

  useEffect(() => {
    safeLocalStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!file && !text.length) {
      setState({ status: "idle" });
      return () => controller.abort();
    }

    setState({ status: "loading" });
    const timer = window.setTimeout(() => {
      void hashSource(file, text, controller.signal)
        .then((digest) => {
          if (!controller.signal.aborted) setState({ status: "ready", digest });
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setState({
              status: "error",
              message: file ? fileError : textError,
            });
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fileError, textError, file, text]);

  const sourceDescription = file
    ? `${file.name} • ${formatFileSize(file.size, locale)}`
    : m["common.adler32plaintextdescription"]();

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
            <Card.Description>{sourceDescription}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            {file ? (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center">
                <FileText aria-hidden className="size-5 text-muted" />
                <div className="grid gap-1">
                  <p className="text-sm font-medium break-all">{file.name}</p>
                  <p className="text-sm text-muted">
                    {formatFileSize(file.size, locale)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex min-h-8 items-center justify-between gap-3">
                  <Label htmlFor={`${id}-text`}>
                    {m["common.adler32plaintextlabel"]()}
                  </Label>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={m["shared.asciiArt.clear"]()}
                    isDisabled={!text}
                    onPress={() => setText("")}
                  >
                    <X aria-hidden className="size-4" />
                  </Button>
                </div>
                <TextArea
                  id={`${id}-text`}
                  aria-label={m["common.adler32plaintextlabel"]()}
                  spellCheck={false}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className="min-h-64 flex-1 resize-y font-mono text-sm"
                />
              </div>
            )}
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="block">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              fileName={file?.name}
              clearLabel={m["common.adler32plaintextlabel"]()}
              onSelect={setFile}
              onClear={file ? () => setFile(null) : undefined}
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>{m["common.adler32hashresultlabel"]()}</Card.Title>
              <Card.Description>
                {file
                  ? sourceDescription
                  : m["common.adler32hashresultdescription"]()}
              </Card.Description>
            </div>
            {state.status === "loading" ? <Spinner size="sm" /> : null}
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <DigestSection state={state} />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.md5HashTextOrFile.article.title"]()}</h2>
        <p>{m["tools.md5HashTextOrFile.article.summary"]()}</p>
        <p>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristicsLabel"]()}
          </strong>
        </p>
        <ul>
          {[
            [
              m["shared.blakeHash.blake2bArticleCharacteristics2Title"](),
              m["shared.blakeHash.blake2bArticleCharacteristics2Body"](),
            ],
            [
              m["tools.md4HashTextOrFile.article.characteristics10"](),
              m["tools.md4HashTextOrFile.article.characteristics11"](),
            ],
            [
              m["shared.blakeHash.blake2bArticleCharacteristics3Title"](),
              m["shared.blakeHash.blake2bArticleCharacteristics3Body"](),
            ],
            [
              m["tools.md4HashTextOrFile.article.characteristics30"](),
              m["tools.md4HashTextOrFile.article.characteristics31"](),
            ],
            [
              m["tools.md4HashTextOrFile.article.characteristics40"](),
              m["tools.md4HashTextOrFile.article.characteristics41"](),
            ],
          ].map(([title, body]) => (
            <li key={title}>
              <strong>{title}</strong>: {body}
            </li>
          ))}
        </ul>
        <p>
          <strong>
            {m["tools.keccakHashTextOrFile.article.securityTitle"]()}
          </strong>
          <br />
          ⚠️{" "}
          <strong>
            {m["tools.md5HashTextOrFile.article.securityStrong"]()}
          </strong>
          {m["tools.md5HashTextOrFile.article.security"]()}
        </p>
        <p>
          <strong>{m["tools.md4HashTextOrFile.article.usesTitle"]()}</strong>
        </p>
        <ul>
          {[
            m["tools.md4HashTextOrFile.article.uses0"](),
            m["tools.md4HashTextOrFile.article.uses1"](),
            m["tools.md5HashTextOrFile.article.uses2"](),
            m["tools.md4HashTextOrFile.article.uses3"](),
            m["tools.md4HashTextOrFile.article.uses4"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          <strong>
            {m["tools.md4HashTextOrFile.article.alternativesTitle"]()}
          </strong>
        </p>
        <ul>
          {[
            m["tools.md4HashTextOrFile.article.alternatives0"](),
            m["tools.md4HashTextOrFile.article.alternatives1"](),
            m["tools.md4HashTextOrFile.article.alternatives2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function Md5Hash() {
  return (
    <ToolPage instructions={m["tools.md5HashTextOrFile.usage"]()}>
      <Md5HashContent />
    </ToolPage>
  );
}

async function hashSource(
  file: File | null,
  text: string,
  signal: AbortSignal,
) {
  const source = file
    ? zeroingChunks(file, signal)
    : zeroingTextChunks(text, signal);
  return runMd5Hash(source, signal);
}

function DigestSection({ state }: Readonly<{ state: DigestState }>) {
  if (state.status === "idle") {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center text-sm text-muted">
        {m["tools.md5HashTextOrFile.emptyResultDescription"]()}
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
          <Alert.Description>{state.message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <div className="grid gap-3">
      {(
        [
          ["hex", m["common.adler32hexlabel"]()],
          ["base64", m["common.adler32base64label"]()],
          ["decimal", m["common.adler32decimallabel"]()],
          ["binary", m["common.adler32binarylabel"]()],
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
                copyLabel={m["common.adler32copyresultlabel"]()}
                copiedLabel={m["common.actions.copied"]()}
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
