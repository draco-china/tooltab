import { decodeBase32 } from "@workspace/tools/encoding/base";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, TextArea } from "@heroui/react";
import { Download, RefreshCcw, TriangleAlert } from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/base/empty";
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
import { decodeBase32Preview, deriveDecodedFileName } from "./logic";

const STORAGE_KEY = "tools:base32-decoder:text";
const DEFAULT_INPUT = "MZXW6===";
const FILE_ACCEPT = [
  "text/*",
  ".txt",
  ".log",
  ".md",
  ".json",
  ".csv",
  ".yaml",
  ".yml",
  ".b32",
  ".base32",
] as const;

function Base32DecoderPageContent() {
  const inputId = useId();
  const pendingFileReadId = useRef(0);
  const downloadUrl = useRef<string | null>(null);
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [fileReadFailed, setFileReadFailed] = useState(false);
  const [download, setDownload] = useState<string | null>(null);
  const deferredInput = useDeferredValue(input);
  const decodeState = decodeBase32Preview(deferredInput);

  useEffect(() => {
    try {
      const storedText = window.localStorage.getItem(STORAGE_KEY);
      if (storedText !== null) setInput(storedText);
    } catch {
      // Persistence is optional.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, input);
    } catch {
      // The tool remains usable when storage is unavailable or full.
    }
  }, [input]);

  useEffect(() => {
    if (downloadUrl.current) {
      URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = null;
    }
    if (decodeState.state !== "decoded") {
      setDownload(null);
      return;
    }
    const nextUrl = URL.createObjectURL(
      new Blob([decodeBase32(deferredInput)], {
        type: "application/octet-stream",
      }),
    );
    downloadUrl.current = nextUrl;
    setDownload(nextUrl);
    return () => {
      if (downloadUrl.current === nextUrl) {
        URL.revokeObjectURL(nextUrl);
        downloadUrl.current = null;
      }
    };
  }, [decodeState.state, deferredInput]);

  function updateInput(value: string) {
    pendingFileReadId.current += 1;
    setInput(value);
    setSourceFileName(null);
    setFileReadFailed(false);
  }

  async function importFile(file: File) {
    const requestId = pendingFileReadId.current + 1;
    pendingFileReadId.current = requestId;
    setFileReadFailed(false);
    try {
      const nextText = await file.text();
      if (requestId !== pendingFileReadId.current) return;
      startTransition(() => {
        setInput(nextText);
        setSourceFileName(file.name || null);
        setFileReadFailed(false);
      });
    } catch {
      if (requestId !== pendingFileReadId.current) return;
      startTransition(() => {
        setFileReadFailed(true);
        setSourceFileName(null);
      });
    }
  }

  const errorTitle = fileReadFailed
    ? m["shared.baseEncoding.base16FileReadFailedTitle"]()
    : decodeState.state === "invalid-base32"
      ? m["shared.baseEncoding.base32InvalidLabel"]()
      : null;
  const decodedText = decodeState.state === "decoded" ? decodeState.text : "";

  return (
    <div className="grid gap-10" data-tool-panels>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <Card.Title>
                {m["shared.baseEncoding.base32DecoderInputLabel"]()}
              </Card.Title>
              <Card.Description>
                {sourceFileName
                  ? `${m["common.adler32importfromfilelabel"]()}: ${sourceFileName}`
                  : m["shared.baseEncoding.base32DecoderInputPlaceholder"]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={() => updateInput(DEFAULT_INPUT)}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.textcodecSample"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <TextArea
              id={inputId}
              name="base32-input"
              rows={10}
              autoComplete="off"
              spellCheck={false}
              aria-label={m["shared.baseEncoding.base32DecoderInputLabel"]()}
              aria-invalid={
                !fileReadFailed && decodeState.state === "invalid-base32"
              }
              value={input}
              onChange={(event) => updateInput(event.currentTarget.value)}
              placeholder={m[
                "shared.baseEncoding.base32DecoderInputPlaceholder"
              ]()}
              className="min-h-72 resize-y font-mono text-sm"
            />
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              accept={[...FILE_ACCEPT]}
              fileName={sourceFileName ?? undefined}
              inputTestId="base32-decoder-file-input"
              onSelect={(file) => void importFile(file)}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.baseEncoding.base16DecodedOutputLabel"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.base16Decoder.decodedOutputDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4" aria-live="polite">
            {errorTitle ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>{errorTitle}</Alert.Title>
                </Alert.Content>
              </Alert>
            ) : decodeState.state === "empty" ? (
              <Empty className="min-h-72 border border-border">
                <EmptyHeader>
                  <EmptyDescription>
                    {m[
                      "shared.baseEncoding.base16DecodedOutputEmptyDescription"
                    ]()}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : decodeState.state === "decoded" ? (
              <>
                <section
                  aria-label={m[
                    "shared.baseEncoding.base16DecodedOutputLabel"
                  ]()}
                  className="min-h-72 w-full rounded-lg border border-border bg-transparent px-3 py-2.5"
                >
                  <pre className="overflow-x-auto font-mono text-sm leading-6 break-all whitespace-pre-wrap text-foreground">
                    <code>{decodeState.previewText}</code>
                  </pre>
                </section>
                {decodeState.isPreviewTruncated ? (
                  <p className="text-sm text-muted">
                    {m["shared.baseEncoding.base16PreviewTruncatedLabel"]()}
                  </p>
                ) : null}
              </>
            ) : null}
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-end gap-3">
            <ToolCopyButton
              value={decodedText}
              copyLabel={m["common.actions.copyResult"]()}
              copiedLabel={m["common.actions.copied"]()}
              disabled={decodeState.state !== "decoded"}
              variant="ghost"
            />
            {download ? (
              <a
                href={download}
                download={deriveDecodedFileName(sourceFileName)}
                className={buttonVariants({ size: "sm" })}
              >
                <Download aria-hidden className="size-4" />
                {m["shared.aesTools.decryptdownloadfilelabel"]()}
              </a>
            ) : (
              <Button type="button" size="sm" isDisabled>
                <Download aria-hidden className="size-4" />
                {m["shared.aesTools.decryptdownloadfilelabel"]()}
              </Button>
            )}
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["shared.baseEncoding.base32ArticleTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base32ArticleBody"]()}</p>
        <h2>{m["shared.baseEncoding.base32ArticleWhenTitle"]()}</h2>
        <ul>
          <li>{m["shared.baseEncoding.base32DecoderArticleWhenOne"]()}</li>
          <li>{m["shared.baseEncoding.base32DecoderArticleWhenTwo"]()}</li>
          <li>{m["shared.baseEncoding.base32DecoderArticleWhenThree"]()}</li>
        </ul>
        <h2>{m["shared.baseEncoding.base32ArticleNotesTitle"]()}</h2>
        <ul>
          <li>{m["shared.baseEncoding.base32ArticleNoteOne"]()}</li>
          <li>{m["shared.baseEncoding.base32ArticleNoteTwo"]()}</li>
          <li>{m["shared.baseEncoding.base32DecoderArticleNoteThree"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function Base32DecoderPage() {
  return (
    <ToolPage instructions={m["tools.base32Decoder.usage"]()}>
      <Base32DecoderPageContent />
    </ToolPage>
  );
}
