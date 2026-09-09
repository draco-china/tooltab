import { useObjectUrl } from "@/hooks/use-object-url";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Label,
  ListBox,
  Select,
  TextArea,
} from "@heroui/react";
import {
  Download,
  FileText,
  RefreshCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  type Base85Variant,
  deriveEncodedFileName,
  encodeBase85,
  formatFileSize,
  isBase85Variant,
} from "./logic";

const DEFAULT_TEXT = "Base85 demo!";
const STORAGE_KEYS = {
  alphabet: "tools:base85-encoder:alphabet",
  text: "tools:base85-encoder:text",
} as const;
const VARIANTS = ["ascii85", "z85"] as const;

function Base85EncoderPageContent() {
  const alphabetId = useId();
  const inputId = useId();
  const fileRevision = useRef(0);
  const invalidBase85 = m["shared.baseEncoding.base85EncoderInvalidBase85"]();
  const readFailed = m["shared.baseEncoding.base16FileReadFailedTitle"]();
  const [plainText, setPlainText] = useState(DEFAULT_TEXT);
  const [variant, setVariant] = useState<Base85Variant>("ascii85");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<{
    text: string;
    input: string;
    file: File | null;
    variant: Base85Variant;
  } | null>(() => ({
    text: encodeBase85(new TextEncoder().encode(DEFAULT_TEXT)),
    input: DEFAULT_TEXT,
    file: null,
    variant: "ascii85",
  }));
  const encodedText =
    result?.input === plainText &&
    result.file === selectedFile &&
    result.variant === variant
      ? result.text
      : "";
  const [errorMessage, setErrorMessage] = useState("");
  const downloadBlob = useMemo(
    () =>
      encodedText
        ? new Blob([encodedText], { type: "text/plain;charset=utf-8" })
        : null,
    [encodedText],
  );
  const downloadUrl = useObjectUrl(downloadBlob);

  useEffect(() => {
    const storedText = safeLocalStorage.getItem(STORAGE_KEYS.text);
    const storedAlphabet = safeLocalStorage.getItem(STORAGE_KEYS.alphabet);
    if (storedText !== null) setPlainText(storedText);
    if (storedAlphabet !== null && isBase85Variant(storedAlphabet)) {
      setVariant(storedAlphabet);
    }
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.text, plainText);
    safeLocalStorage.setItem(STORAGE_KEYS.alphabet, variant);
  }, [plainText, variant]);

  useEffect(() => {
    let cancelled = false;
    setErrorMessage("");
    if (!selectedFile && plainText.length === 0) {
      setResult(null);
      return;
    }

    void (async () => {
      try {
        const bytes = selectedFile
          ? new Uint8Array(await selectedFile.arrayBuffer())
          : new TextEncoder().encode(plainText);
        if (!cancelled)
          setResult({
            text: encodeBase85(bytes, { variant }),
            input: plainText,
            file: selectedFile,
            variant,
          });
      } catch (error) {
        if (cancelled) return;
        setResult(null);
        setErrorMessage(
          error instanceof Error && error.message === "Invalid Base85 length"
            ? invalidBase85
            : readFailed,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invalidBase85, readFailed, plainText, selectedFile, variant]);

  function updateText(value: string) {
    fileRevision.current += 1;
    setSelectedFile(null);
    setPlainText(value);
  }

  function loadSample() {
    fileRevision.current += 1;
    setSelectedFile(null);
    setPlainText(DEFAULT_TEXT);
  }

  function clear() {
    fileRevision.current += 1;
    setSelectedFile(null);
    setPlainText("");
  }

  function selectFile(file: File) {
    fileRevision.current += 1;
    setSelectedFile(file);
  }

  const alphabetLabel = (value: Base85Variant) =>
    value === "z85"
      ? m["shared.baseEncoding.base85DecoderAlphabetZ85"]()
      : m["shared.baseEncoding.base85DecoderAlphabetAscii85"]();
  const outputDescription = `${m["shared.baseEncoding.alphabet"]()}: ${alphabetLabel(variant)}`;

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
              <Card.Description>
                {selectedFile
                  ? `${selectedFile.name} - ${formatFileSize(selectedFile.size)}`
                  : m["shared.baseEncoding.base16InputPlaceholder"]()}
              </Card.Description>
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
              selectedKey={variant}
              onSelectionChange={(value) => {
                const nextVariant = String(value);
                if (value !== null && isBase85Variant(nextVariant)) {
                  setVariant(nextVariant);
                }
              }}
            >
              <Label htmlFor={alphabetId}>
                {m["shared.baseEncoding.alphabet"]()}
              </Label>
              <Select.Trigger
                id={alphabetId}
                aria-label={m["shared.baseEncoding.alphabet"]()}
                className="w-full"
              >
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {VARIANTS.map((value) => (
                    <ListBox.Item
                      key={value}
                      id={value}
                      textValue={alphabetLabel(value)}
                    >
                      {alphabetLabel(value)}
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
                    {selectedFile.name}
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
                  name="base85-input"
                  autoComplete="off"
                  spellCheck={false}
                  rows={10}
                  aria-label={m["common.adler32inputlabel"]()}
                  value={plainText}
                  onChange={(event) => updateText(event.currentTarget.value)}
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
              inputTestId="base85-encoder-file-input"
              onSelect={selectFile}
              onClear={selectedFile ? () => setSelectedFile(null) : undefined}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Card.Title>
              {m["shared.baseEncoding.base85EncoderOutputTitle"]()}
            </Card.Title>
            <Card.Description>{outputDescription}</Card.Description>
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <ToolCopyButton
                value={encodedText}
                copyLabel={m["common.actions.copy"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={!encodedText}
                variant="ghost"
              />
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={deriveEncodedFileName(
                    selectedFile?.name ?? null,
                    variant,
                  )}
                  className={buttonVariants({ size: "sm", variant: "ghost" })}
                >
                  <Download aria-hidden className="size-4" />
                  {m["shared.baseEncoding.base85EncoderDownload"]()}
                </a>
              ) : (
                <Button type="button" variant="ghost" size="sm" isDisabled>
                  <Download aria-hidden className="size-4" />
                  {m["shared.baseEncoding.base85EncoderDownload"]()}
                </Button>
              )}
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4" aria-live="polite">
            {errorMessage ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>{errorMessage}</Alert.Title>
                </Alert.Content>
              </Alert>
            ) : encodedText ? (
              <TextArea
                name="base85-output"
                readOnly
                spellCheck={false}
                rows={10}
                aria-label={m["shared.baseEncoding.base85EncoderOutputTitle"]()}
                value={encodedText}
                className="min-h-64 resize-y font-mono text-sm"
              />
            ) : (
              <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-default/20 p-6 text-center text-sm text-muted">
                {m["shared.baseEncoding.base85EncoderOutputPlaceholder"]()}
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["shared.baseEncoding.base85EncoderArticleWhyTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base85EncoderArticleWhyBody"]()}</p>
        <h2>{m["shared.baseEncoding.base58EncoderArticleHelpTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base85EncoderArticleHelpBody"]()}</p>
        <h2>{m["shared.baseEncoding.base58EncoderArticleWhenTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base85EncoderArticleWhenBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function Base85EncoderPage() {
  return (
    <ToolPage instructions={m["shared.base58Base85Usage.base85Encoder"]()}>
      <Base85EncoderPageContent />
    </ToolPage>
  );
}
