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
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { decodeBase16Preview, deriveDecodedFileName } from "./logic";
import { decodeBase16 } from "@workspace/tools/encoding/base";

const STORAGE_KEY = "tools:base16-decoder:text";
const DEFAULT_INPUT = "48656C6C6F2C20576F726C6421";
const FILE_ACCEPT = [
  "text/*",
  ".txt",
  ".log",
  ".md",
  ".json",
  ".csv",
  ".yaml",
  ".yml",
  ".hex",
  ".base16",
] as const;

function Base16DecoderPageContent() {
  const inputId = useId();
  const pendingFileReadId = useRef(0);
  const downloadUrl = useRef<string | null>(null);
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [fileReadFailed, setFileReadFailed] = useState(false);
  const [download, setDownload] = useState<string | null>(null);
  const deferredInput = useDeferredValue(input);
  const decodeState = decodeBase16Preview(deferredInput);

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
      new Blob([decodeBase16(deferredInput)], {
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
    : decodeState.state === "invalid-base16"
      ? m["shared.baseEncoding.base16InvalidHexLabel"]()
      : null;
  const decodedText = decodeState.state === "decoded" ? decodeState.text : "";

  return (
    <div className="grid gap-10" data-tool-panels>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <Card.Title>
                {m["shared.baseEncoding.base16HexInputLabel"]()}
              </Card.Title>
              <Card.Description>
                {sourceFileName
                  ? `${m["common.adler32importfromfilelabel"]()}: ${sourceFileName}`
                  : m["shared.baseEncoding.base16HexInputPlaceholder"]()}
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
              name="base16-input"
              rows={10}
              autoComplete="off"
              spellCheck={false}
              aria-label={m["shared.baseEncoding.base16HexInputLabel"]()}
              aria-invalid={
                !fileReadFailed && decodeState.state === "invalid-base16"
              }
              value={input}
              onChange={(event) => updateInput(event.currentTarget.value)}
              placeholder={m["shared.baseEncoding.base16HexInputPlaceholder"]()}
              className="min-h-72 resize-y font-mono text-sm"
            />
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="grid gap-3">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              accept={[...FILE_ACCEPT]}
              fileName={sourceFileName ?? undefined}
              inputTestId="base16-decoder-file-input"
              onSelect={(file) => void importFile(file)}
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Card.Title>
                {m["shared.baseEncoding.base16DecodedOutputLabel"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.base16Decoder.decodedOutputDescription"]()}
              </Card.Description>
            </div>
            <ToolPanelActionGroup className="shrink-0 sm:justify-end">
              <ToolCopyButton
                value={decodedText}
                copyLabel={m["common.actions.copyResult"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={decodeState.state !== "decoded"}
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
            </ToolPanelActionGroup>
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

export default function Base16DecoderPage() {
  return (
    <ToolPage instructions={m["tools.base16Decoder.usage"]()}>
      <Base16DecoderPageContent />
    </ToolPage>
  );
}
