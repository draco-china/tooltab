import {
  MAX_HASH_FILE_BYTES,
  MAX_HASH_TEXT_BYTES,
  ShaHashError,
} from "@workspace/tools/hash/sha-input";
import { formatHash, type HashFormat } from "@workspace/tools/hash/format";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Skeleton, Spinner, TextArea } from "@heroui/react";
import { FileText, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { hashBytes } from "@workspace/tools/hash/sha";
import { readHashFile } from "./logic";

const DEFAULT_TEXT = "Hello, browser-native world!";
const STORAGE_KEY = "tools:sha256-hash-text-or-file:text";

type Sha256Digest = Record<HashFormat, string>;
type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: Sha256Digest }
  | { status: "error"; message: string };

function Sha256HashTextOrFileContent() {
  const locale = getLocale();
  const id = useId();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<DigestState>({ status: "loading" });
  const debouncedText = useDebouncedValue(text);

  useEffect(() => {
    safeLocalStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!file && text !== debouncedText) {
      setState({ status: "loading" });
      return;
    }
    if (!file && debouncedText.length === 0) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    void hashSource(file ?? debouncedText, controller.signal)
      .then((digest) => {
        if (!controller.signal.aborted) setState({ status: "ready", digest });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: errorMessage(error, file !== null),
        });
      });

    return () => controller.abort();
  }, [debouncedText, file, text]);

  const sourceDescription = file
    ? `${file.name} • ${formatFileSize(file.size, locale)}`
    : m["common.adler32plaintextdescription"]();

  return (
    <>
      <div className="grid gap-6" data-tool-panels data-sha256-hash-page>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
            <Card.Description>{sourceDescription}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
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
                <TextArea
                  id={`${id}-text`}
                  aria-label={m["common.adler32plaintextlabel"]()}
                  className="min-h-64 flex-1 resize-y font-mono text-sm"
                  spellCheck={false}
                  value={text}
                  onChange={(event) => setText(event.currentTarget.value)}
                />
              </div>
            )}
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              description={m["shared.hashTextOrFile.shafilehint"]()}
              fileName={file ? sourceDescription : undefined}
              clearLabel={m["common.adler32plaintextlabel"]()}
              inputTestId="sha256-file-input"
              onSelect={setFile}
              onClear={file ? () => setFile(null) : undefined}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
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
          <ToolPanelCardContent
            className="py-4"
            aria-busy={state.status === "loading"}
          >
            <DigestSection state={state} />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <Sha256Article />
    </>
  );
}

function DigestSection({ state }: { state: DigestState }) {
  if (state.status === "idle") {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center text-sm text-muted">
        {m["common.adler32plaintextdescription"]()}
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
            className="grid min-w-0 gap-3 border-b border-separator py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-sm font-medium">{label}</h3>
              <ToolCopyButton
                value={value}
                copyLabel={m["common.adler32copyresultlabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={state.status === "loading"}
                ariaLabel={label}
                size="icon-sm"
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

function Sha256Article() {
  return (
    <ToolArticle>
      <h2>{m["tools.sha256HashTextOrFile.article.title"]()}</h2>
      <p>{m["tools.sha256HashTextOrFile.article.summary"]()}</p>
      <p>
        <strong>
          {m["shared.blakeHash.blake2bArticleCharacteristicsLabel"]()}
        </strong>
      </p>
      <ul>
        <li>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristics2Title"]()}
          </strong>
          : {m["shared.blakeHash.blake2bArticleCharacteristics2Body"]()}
        </li>
        <li>
          <strong>
            {m["tools.md4HashTextOrFile.article.characteristics10"]()}
          </strong>
          : {m["tools.md4HashTextOrFile.article.characteristics11"]()}
        </li>
        <li>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristics3Title"]()}
          </strong>
          : {m["shared.blakeHash.blake2bArticleCharacteristics3Body"]()}
        </li>
        <li>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristics4Title"]()}
          </strong>
          : {m["shared.blakeHash.blake2bArticleCharacteristics4Body"]()}
        </li>
        <li>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristics5Title"]()}
          </strong>
          : {m["shared.blakeHash.blake2bArticleCharacteristics5Body"]()}
        </li>
      </ul>
      <p>
        <strong>{m["common.adler32articlecommonuses"]()}</strong>
      </p>
      <ul>
        <li>{m["shared.blakeHash.blake2bArticleCommonUses1"]()}</li>
        <li>{m["tools.sha256HashTextOrFile.article.uses1"]()}</li>
        <li>{m["tools.sha224HashTextOrFile.article.uses2"]()}</li>
        <li>{m["shared.blakeHash.blake2bArticleCommonUses0"]()}</li>
        <li>{m["tools.sha224HashTextOrFile.article.uses4"]()}</li>
      </ul>
    </ToolArticle>
  );
}

async function hashSource(
  source: string | File,
  signal: AbortSignal,
): Promise<Sha256Digest> {
  let bytes: Uint8Array<ArrayBuffer>;
  if (typeof source === "string") {
    bytes = new TextEncoder().encode(source);
    if (bytes.length > MAX_HASH_TEXT_BYTES) throw new ShaHashError("too-large");
  } else {
    bytes = await readHashFile(source, MAX_HASH_FILE_BYTES, signal);
  }
  try {
    const digest = await hashBytes("SHA-256", bytes, signal);
    try {
      return {
        hex: formatHash(digest, "hex"),
        base64: formatHash(digest, "base64"),
        decimal: formatHash(digest, "decimal"),
        binary: formatHash(digest, "binary"),
      };
    } finally {
      digest.fill(0);
    }
  } finally {
    bytes.fill(0);
  }
}

function errorMessage(error: unknown, file: boolean) {
  if (error instanceof ShaHashError && error.code === "too-large") {
    return m["tools.sha1HashTextOrFile.tooLargeError"]();
  }
  if (error instanceof ShaHashError && error.code === "read-failed") {
    return m["tools.highwayhashHashTextOrFile.fileHashErrorLabel"]();
  }
  return file
    ? m["tools.highwayhashHashTextOrFile.fileHashErrorLabel"]()
    : m["tools.highwayhashHashTextOrFile.textHashErrorLabel"]();
}

function formatFileSize(size: number, locale: string) {
  const format = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${format(size / 1024)} KB`;
  return `${format(size / (1024 * 1024))} MB`;
}

export default function Sha256HashTextOrFile() {
  return (
    <ToolPage>
      <Sha256HashTextOrFileContent />
    </ToolPage>
  );
}
