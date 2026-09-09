import { useObjectUrl } from "@/hooks/use-object-url";
import {
  type Base58AlphabetKey,
  resolveBase58AlphabetKey,
} from "@workspace/tools/encoding/base58";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Label,
  ListBox,
  Select,
  Skeleton,
  TextArea,
} from "@heroui/react";
import {
  Download,
  FileText,
  RefreshCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
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
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { runBase58Encoder } from "./encoder-worker-client";
import {
  Base58EncoderError,
  deriveBase58FileName,
  formatFileSize,
  readBase58Source,
} from "./logic";

type EncodingState =
  | { status: "idle" | "loading" }
  | { status: "ready"; encodedText: string }
  | { status: "error"; message: string };

const DEFAULT_TEXT = "Hello World";
const STORAGE_KEYS = {
  text: "tools:base58-encoder:text",
  alphabet: "tools:base58-encoder:alphabet",
} as const;

function Base58EncoderPageContent() {
  const alphabetId = useId();
  const readFailedLabel = m["shared.baseEncoding.base16FileReadFailedTitle"]();
  const inputId = useId();
  const currentTask = useRef<AbortController | null>(null);
  const [plainText, setPlainText] = useState(DEFAULT_TEXT);
  const [alphabetKey, setAlphabetKey] = useState<Base58AlphabetKey>("bitcoin");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [encodingState, setEncodingState] = useState<EncodingState>({
    status: "loading",
  });
  const [, setRevision] = useState(0);
  const deferredText = useDeferredValue(plainText);

  useEffect(() => {
    const storedText = safeLocalStorage.getItem(STORAGE_KEYS.text);
    const storedAlphabet = safeLocalStorage.getItem(STORAGE_KEYS.alphabet);
    if (storedText !== null) setPlainText(storedText);
    if (storedAlphabet !== null) {
      setAlphabetKey(resolveBase58AlphabetKey(storedAlphabet));
    }
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.text, plainText);
    safeLocalStorage.setItem(STORAGE_KEYS.alphabet, alphabetKey);
  }, [alphabetKey, plainText]);

  useEffect(() => {
    currentTask.current?.abort();
    const controller = new AbortController();
    currentTask.current = controller;

    if (!selectedFile && deferredText !== plainText) {
      setEncodingState({ status: "loading" });
      return () => controller.abort();
    }

    if (!selectedFile && deferredText.length === 0) {
      setEncodingState({ status: "idle" });
      return () => controller.abort();
    }

    setEncodingState({ status: "loading" });
    void (async () => {
      let bytes: Uint8Array<ArrayBuffer> | undefined;
      try {
        bytes = selectedFile
          ? await readBase58Source(selectedFile)
          : new TextEncoder().encode(deferredText);
        controller.signal.throwIfAborted();
        const encodedText = await runBase58Encoder(
          bytes,
          alphabetKey,
          controller.signal,
        );
        controller.signal.throwIfAborted();
        setEncodingState({ status: "ready", encodedText });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Base58EncoderError
            ? error.code === "too-large"
              ? m["shared.baseEncoding.toolarge"]()
              : error.code === "unsupported"
                ? m["tools.base58Encoder.baseunsupported"]()
                : readFailedLabel
            : readFailedLabel;
        setEncodingState({ status: "error", message });
      } finally {
        bytes?.fill(0);
        if (currentTask.current === controller) currentTask.current = null;
      }
    })();

    return () => controller.abort();
  }, [alphabetKey, readFailedLabel, deferredText, plainText, selectedFile]);

  const downloadBlob = useMemo(
    () =>
      encodingState.status === "ready"
        ? new Blob([encodingState.encodedText], {
            type: "text/plain;charset=utf-8",
          })
        : null,
    [encodingState],
  );
  const downloadUrl = useObjectUrl(downloadBlob);

  useEffect(
    () => () => {
      currentTask.current?.abort();
    },
    [],
  );

  const encodedText =
    encodingState.status === "ready" ? encodingState.encodedText : "";
  const alphabetOptions = [
    ["bitcoin", m["shared.baseEncoding.base58AlphabetBitcoinLabel"]()],
    ["flickr", m["shared.baseEncoding.base58AlphabetFlickrLabel"]()],
    ["ripple", m["shared.baseEncoding.base58AlphabetRippleLabel"]()],
  ] as const;
  const alphabetLabel =
    alphabetOptions.find(([key]) => key === alphabetKey)?.[1] ??
    m["shared.baseEncoding.base58AlphabetBitcoinLabel"]();
  const inputDescription = selectedFile
    ? `${selectedFile.name || "file"} - ${formatFileSize(selectedFile.size)}`
    : m["shared.baseEncoding.base16InputPlaceholder"]();

  function invalidate() {
    currentTask.current?.abort();
    setRevision((value) => value + 1);
    setEncodingState({ status: "loading" });
  }

  function clear() {
    invalidate();
    setSelectedFile(null);
    setPlainText("");
  }

  function loadSample() {
    invalidate();
    setSelectedFile(null);
    setPlainText(DEFAULT_TEXT);
  }

  return (
    <div className="grid gap-10">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
              <Card.Description>{inputDescription}</Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={loadSample}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["shared.baseEncoding.base58EncoderLoadSampleLabel"]()}
              </Button>
              <Button type="button" variant="ghost" size="sm" onPress={clear}>
                <Trash2 aria-hidden className="size-4" />
                {m["common.base64clear"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <Select
              variant="secondary"
              selectedKey={alphabetKey}
              onSelectionChange={(value) => {
                if (value !== null) {
                  invalidate();
                  setAlphabetKey(resolveBase58AlphabetKey(String(value)));
                }
              }}
              fullWidth
            >
              <Label>{m["shared.baseEncoding.alphabet"]()}</Label>
              <Select.Trigger
                id={alphabetId}
                aria-label={m["shared.baseEncoding.alphabet"]()}
              >
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {alphabetOptions.map(([value, label]) => (
                    <ListBox.Item key={value} id={value} textValue={label}>
                      {label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            {selectedFile ? (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/20 p-6 text-center">
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
              <div className="grid gap-2">
                <Label htmlFor={inputId}>
                  {m["common.adler32inputlabel"]()}
                </Label>
                <TextArea
                  id={inputId}
                  name="base58-input"
                  autoComplete="off"
                  spellCheck={false}
                  rows={10}
                  aria-label={m["common.adler32inputlabel"]()}
                  value={plainText}
                  onChange={(event) => {
                    invalidate();
                    setPlainText(event.currentTarget.value);
                  }}
                  placeholder={m[
                    "shared.baseEncoding.base16InputPlaceholder"
                  ]()}
                  className="min-h-64 resize-y font-mono text-sm"
                />
              </div>
            )}
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              fileName={selectedFile?.name}
              inputTestId="base58-encoder-file-input"
              onSelect={(file) => {
                invalidate();
                setSelectedFile(file);
              }}
              onClear={
                selectedFile
                  ? () => {
                      invalidate();
                      setSelectedFile(null);
                    }
                  : undefined
              }
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Card.Title>
              {m["shared.baseEncoding.base58EncoderOutputTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["shared.baseEncoding.alphabet"]()}: {alphabetLabel}
            </Card.Description>
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <ToolCopyButton
                value={encodedText}
                copyLabel={m["common.actions.copy"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={encodingState.status !== "ready"}
                variant="ghost"
              />
              {downloadUrl && encodingState.status === "ready" ? (
                <a
                  href={downloadUrl}
                  download={deriveBase58FileName(selectedFile?.name)}
                  className={buttonVariants({ size: "sm", variant: "ghost" })}
                >
                  <Download aria-hidden className="size-4" />
                  {m["shared.baseEncoding.base58EncoderDownloadLabel"]()}
                </a>
              ) : (
                <Button type="button" variant="ghost" size="sm" isDisabled>
                  <Download aria-hidden className="size-4" />
                  {m["shared.baseEncoding.base58EncoderDownloadLabel"]()}
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
            ) : encodingState.status === "loading" ? (
              <section
                aria-busy="true"
                aria-label={m["shared.baseEncoding.base58EncoderOutputTitle"]()}
                className="grid min-h-64 content-start gap-3"
              >
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </section>
            ) : encodingState.status === "ready" ? (
              <TextArea
                name="base58-output"
                readOnly
                spellCheck={false}
                rows={10}
                aria-label={m["shared.baseEncoding.base58EncoderOutputTitle"]()}
                value={encodedText}
                className="min-h-64 resize-y font-mono text-sm"
              />
            ) : (
              <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-default/20 p-6 text-center text-sm text-muted">
                {m["shared.baseEncoding.base58EncoderOutputPlaceholder"]()}
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["shared.baseEncoding.base58EncoderArticleWhyTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base58EncoderArticleWhyBody"]()}</p>
        <h2>{m["shared.baseEncoding.base58EncoderArticleHelpTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base58EncoderArticleHelpBody"]()}</p>
        <h2>{m["shared.baseEncoding.base58EncoderArticleWhenTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base58EncoderArticleWhenBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function Base58EncoderPage() {
  return (
    <ToolPage instructions={m["shared.base58Base85Usage.base58Encoder"]()}>
      <Base58EncoderPageContent />
    </ToolPage>
  );
}
