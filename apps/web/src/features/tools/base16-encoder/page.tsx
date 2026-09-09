import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Skeleton,
  Spinner,
  TextArea,
} from "@heroui/react";
import { Download, FileText, TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import {
  Base16EncoderError,
  deriveEncodedFileName,
  encodeBase16,
  encodeTextAsBase16,
  formatFileSize,
} from "./logic";

type EncodingState =
  | { status: "idle" | "loading" }
  | { status: "ready"; encodedText: string }
  | { status: "error"; message: string };

const STORAGE_KEY = "tools:base16-encoder:text";
const DEFAULT_INPUT = "Hello, World!";

function Base16EncoderPageContent() {
  const inputId = useId();
  const fileReadFailedTitle =
    m["shared.baseEncoding.base16FileReadFailedTitle"]();
  const [plainText, setPlainText] = useState(DEFAULT_INPUT);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [encodingState, setEncodingState] = useState<EncodingState>({
    status: "loading",
  });
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const downloadUrlRef = useRef<string | null>(null);
  const deferredPlainText = useDeferredValue(plainText);

  useEffect(() => {
    try {
      const storedText = window.localStorage.getItem(STORAGE_KEY);
      if (storedText !== null) setPlainText(storedText);
    } catch {
      // Persistence is optional.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, plainText);
    } catch {
      // The tool remains usable when storage is unavailable or full.
    }
  }, [plainText]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedFile && deferredPlainText.length === 0) {
      setEncodingState({ status: "idle" });
      return;
    }

    setEncodingState({ status: "loading" });
    const encoding = selectedFile
      ? encodeBase16(selectedFile)
      : Promise.resolve().then(() => encodeTextAsBase16(deferredPlainText));
    void encoding
      .then((encodedText) => {
        if (!cancelled) setEncodingState({ status: "ready", encodedText });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof Base16EncoderError
            ? error.code === "too-large"
              ? m["shared.baseEncoding.toolarge"]()
              : error.code === "invalid-utf8"
                ? m["shared.baseEncoding.invalidutf8"]()
                : fileReadFailedTitle
            : fileReadFailedTitle;
        setEncodingState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [deferredPlainText, selectedFile, fileReadFailedTitle]);

  useEffect(() => {
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }

    if (encodingState.status !== "ready") {
      setDownloadUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(
      new Blob([encodingState.encodedText], {
        type: "text/plain;charset=utf-8",
      }),
    );
    downloadUrlRef.current = nextUrl;
    setDownloadUrl(nextUrl);

    return () => {
      if (downloadUrlRef.current === nextUrl) {
        URL.revokeObjectURL(nextUrl);
        downloadUrlRef.current = null;
      }
    };
  }, [encodingState]);

  const outputText =
    encodingState.status === "ready" ? encodingState.encodedText : "";
  const downloadFileName = deriveEncodedFileName(
    selectedFile ? (selectedFile.name ?? null) : undefined,
  );
  const inputDescription = selectedFile
    ? `${selectedFile.name || "file"} • ${formatFileSize(selectedFile.size)}`
    : m["common.adler32plaintextdescription"]();

  return (
    <div className="grid gap-10">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
            <Card.Description>{inputDescription}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            {selectedFile ? (
              <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/20 p-6 text-center">
                <FileText aria-hidden className="size-5 text-muted" />
                <div className="grid gap-1">
                  <p className="text-sm font-medium break-all text-foreground">
                    {selectedFile.name || "file"}
                  </p>
                  <p className="text-sm text-muted">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
            ) : (
              <TextArea
                id={inputId}
                name="plain-text"
                rows={10}
                autoComplete="off"
                aria-label={m["common.adler32inputlabel"]()}
                value={plainText}
                onChange={(event) => setPlainText(event.currentTarget.value)}
                placeholder={m["shared.baseEncoding.base16InputPlaceholder"]()}
                className="min-h-72 resize-y font-mono text-sm"
              />
            )}
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="grid gap-3">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              fileName={selectedFile?.name}
              inputTestId="base16-encoder-file-input"
              onSelect={setSelectedFile}
              onClear={selectedFile ? () => setSelectedFile(null) : undefined}
            />
            {selectedFile ? (
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onPress={() => setSelectedFile(null)}
                >
                  {m["common.adler32plaintextlabel"]()}
                </Button>
              </div>
            ) : null}
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>
                {m["shared.baseEncoding.base16EncodedOutputLabel"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.base16Encoder.base16EncodedOutputDescription"]()}
              </Card.Description>
            </div>
            {encodingState.status === "loading" ? <Spinner size="sm" /> : null}
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <ToolCopyButton
                value={outputText}
                copyLabel={m["common.actions.copyResult"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={encodingState.status !== "ready"}
              />
              {downloadUrl && encodingState.status === "ready" ? (
                <a
                  href={downloadUrl}
                  download={downloadFileName}
                  className={buttonVariants({ size: "sm" })}
                >
                  <Download aria-hidden className="size-4" />
                  {m["shared.baseEncoding.base16DownloadHexLabel"]()}
                </a>
              ) : (
                <Button type="button" size="sm" isDisabled>
                  <Download aria-hidden className="size-4" />
                  {m["shared.baseEncoding.base16DownloadHexLabel"]()}
                </Button>
              )}
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4" aria-live="polite">
            {encodingState.status === "error" ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>{encodingState.message}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : encodingState.status === "idle" ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">
                {m["shared.baseEncoding.base16EncodedOutputEmptyDescription"]()}
              </div>
            ) : encodingState.status === "loading" ? (
              <section
                aria-busy="true"
                aria-label={m["shared.baseEncoding.base16EncodedOutputLabel"]()}
                className="grid min-h-72 content-start gap-3"
              >
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </section>
            ) : (
              <section
                aria-label={m["shared.baseEncoding.base16EncodedOutputLabel"]()}
                className="min-h-72 w-full rounded-lg border border-border bg-transparent px-3 py-2.5"
              >
                <pre className="overflow-x-auto font-mono text-sm leading-6 break-all whitespace-pre-wrap text-foreground">
                  <code>{outputText}</code>
                </pre>
              </section>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["shared.baseEncoding.base16ArticleTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base16ArticleBody"]()}</p>
        <p>
          <strong>{m["common.adler32articlecommonuses"]()}</strong>
        </p>
        <ul>
          <li>{m["shared.baseEncoding.base16ArticleUseOne"]()}</li>
          <li>{m["shared.baseEncoding.base16ArticleUseTwo"]()}</li>
          <li>{m["shared.baseEncoding.base16ArticleUseThree"]()}</li>
        </ul>
        <p>
          <strong>{m["shared.baseEncoding.base16ArticleNotesTitle"]()}</strong>
        </p>
        <ul>
          <li>{m["shared.baseEncoding.base16ArticleNoteOne"]()}</li>
          <li>{m["shared.baseEncoding.base16ArticleNoteTwo"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function Base16EncoderPage() {
  return (
    <ToolPage instructions={m["tools.base16Encoder.usage"]()}>
      <Base16EncoderPageContent />
    </ToolPage>
  );
}
