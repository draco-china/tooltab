import { useObjectUrl } from "@/hooks/use-object-url";
import {
  type Base58AlphabetKey,
  resolveBase58AlphabetKey,
} from "@workspace/tools/encoding/base58";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
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
import { Download, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/base/empty";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { deriveDecodedFileName } from "./logic";
import { runBase58Decoder } from "./worker-client";
import { useAsyncTask } from "@/hooks/use-async-task";

const STORAGE_KEYS = {
  text: "tools:base58-decoder:text",
  alphabet: "tools:base58-decoder:alphabet",
} as const;
const DEFAULT_INPUT = "StV1DL6CwTryKyV";
const DEFAULT_ALPHABET_KEY = "bitcoin" as const;
const FILE_ACCEPT = [
  "text/*",
  ".txt",
  ".log",
  ".md",
  ".json",
  ".csv",
  ".yaml",
  ".yml",
  ".b58",
  ".base58",
] as const;

function Base58DecoderPageContent() {
  const inputId = useId();
  const alphabetId = useId();
  const pendingFileReadId = useRef(0);
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [alphabetKey, setAlphabetKey] =
    useState<Base58AlphabetKey>(DEFAULT_ALPHABET_KEY);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [fileReadFailed, setFileReadFailed] = useState(false);
  const [fileReading, setFileReading] = useState(false);
  const request = useMemo(
    () => ({ input, alphabet: alphabetKey }),
    [input, alphabetKey],
  );
  const task = useAsyncTask(runBase58Decoder);
  const { run, clear: clearTask } = task;
  const [startedRequest, setStartedRequest] = useState<typeof request | null>(
    null,
  );

  useEffect(() => {
    if (fileReading || fileReadFailed || !request.input.trim()) {
      clearTask();
      return;
    }
    setStartedRequest(request);
    void run(request);
    return clearTask;
  }, [request, fileReading, fileReadFailed, run, clearTask]);

  const decodeState = fileReading
    ? { state: "pending" as const }
    : fileReadFailed || !input.trim()
      ? { state: "empty" as const }
      : startedRequest !== request ||
          task.status === "running" ||
          task.status === "idle"
        ? { state: "pending" as const }
        : task.status === "success"
          ? task.result
          : { state: "error" as const };
  const decodedBytes =
    decodeState.state === "decoded" ? decodeState.bytes : null;
  const downloadBlob = useMemo(
    () =>
      decodedBytes
        ? new Blob([decodedBytes], { type: "application/octet-stream" })
        : null,
    [decodedBytes],
  );
  const downloadUrl = useObjectUrl(downloadBlob);
  const download = downloadUrl
    ? { url: downloadUrl, fileName: deriveDecodedFileName(sourceFileName) }
    : null;

  useEffect(
    () => () => {
      pendingFileReadId.current += 1;
    },
    [],
  );

  useEffect(() => {
    const storedText = safeLocalStorage.getItem(STORAGE_KEYS.text);
    const storedAlphabet = safeLocalStorage.getItem(STORAGE_KEYS.alphabet);
    if (storedText !== null) setInput(storedText);
    if (storedAlphabet !== null) {
      setAlphabetKey(resolveBase58AlphabetKey(storedAlphabet));
    }
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.text, input);
  }, [input]);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.alphabet, alphabetKey);
  }, [alphabetKey]);

  function updateInput(value: string) {
    pendingFileReadId.current += 1;
    setFileReading(false);
    setInput(value);
    setSourceFileName(null);
    setFileReadFailed(false);
  }

  function clear() {
    pendingFileReadId.current += 1;
    setFileReading(false);
    setInput("");
    setSourceFileName(null);
    setFileReadFailed(false);
  }

  async function importFile(file: File) {
    const requestId = pendingFileReadId.current + 1;
    pendingFileReadId.current = requestId;
    setFileReading(true);
    setFileReadFailed(false);
    try {
      const nextText = await file.text();
      if (requestId !== pendingFileReadId.current) return;
      setInput(nextText);
      setSourceFileName(file.name || null);
      setFileReadFailed(false);
      setFileReading(false);
    } catch {
      if (requestId !== pendingFileReadId.current) return;
      setFileReadFailed(true);
      setSourceFileName(null);
      setFileReading(false);
    }
  }

  const alphabetOptions = [
    ["bitcoin", m["shared.baseEncoding.base58AlphabetBitcoinLabel"]()],
    ["flickr", m["shared.baseEncoding.base58AlphabetFlickrLabel"]()],
    ["ripple", m["shared.baseEncoding.base58AlphabetRippleLabel"]()],
  ] as const;
  const errorTitle = fileReadFailed
    ? m["shared.baseEncoding.base16FileReadFailedTitle"]()
    : decodeState.state === "error"
      ? m["common.error"]()
      : decodeState.state === "invalid-base58"
        ? m["shared.baseEncoding.base58DecoderInvalidLabel"]()
        : null;
  const decodedText = decodeState.state === "decoded" ? decodeState.text : "";

  return (
    <div className="grid gap-10">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <div className="grid gap-6">
          <Card>
            <Card.Header className="border-b border-separator">
              <Card.Title>{m["shared.jsonSchemaTools.options"]()}</Card.Title>
            </Card.Header>
            <Card.Content>
              <Select
                variant="secondary"
                selectedKey={alphabetKey}
                onSelectionChange={(value) => {
                  if (value !== null) {
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
            </Card.Content>
          </Card>

          <ToolPanelCard>
            <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <Card.Title>
                  {m["shared.baseEncoding.base58DecoderInputTitle"]()}
                </Card.Title>
                <Card.Description>
                  {sourceFileName
                    ? `${m["common.adler32importfromfilelabel"]()}: ${sourceFileName}`
                    : m["shared.baseEncoding.base58DecoderInputPlaceholder"]()}
                </Card.Description>
              </div>
              <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
                <Button type="button" variant="ghost" size="sm" onPress={clear}>
                  <Trash2 aria-hidden className="size-4" />
                  {m["common.base64clear"]()}
                </Button>
              </div>
            </Card.Header>
            <ToolPanelCardContent className="py-4">
              <TextArea
                id={inputId}
                name="base58-input"
                rows={10}
                autoComplete="off"
                spellCheck={false}
                aria-label={m["shared.baseEncoding.base58DecoderInputTitle"]()}
                aria-invalid={
                  !fileReadFailed && decodeState.state === "invalid-base58"
                }
                value={input}
                onChange={(event) => updateInput(event.currentTarget.value)}
                placeholder={m[
                  "shared.baseEncoding.base58DecoderInputPlaceholder"
                ]()}
                className="min-h-72 resize-y font-mono text-sm"
              />
            </ToolPanelCardContent>
            <ToolPanelCardFooter className="grid gap-3">
              <ToolFilePicker
                label={m["common.adler32importfromfilelabel"]()}
                accept={[...FILE_ACCEPT]}
                fileName={sourceFileName ?? undefined}
                inputTestId="base58-decoder-file-input"
                onSelect={(file) => void importFile(file)}
              />
            </ToolPanelCardFooter>
          </ToolPanelCard>
        </div>

        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Card.Title>
              {m["shared.baseEncoding.base16DecodedOutputLabel"]()}
            </Card.Title>
            <Card.Description>
              {m["shared.baseEncoding.base58DecoderOutputDescription"]()}
            </Card.Description>
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <ToolCopyButton
                value={decodedText}
                copyLabel={m["common.actions.copyResult"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={decodeState.state !== "decoded"}
                variant="ghost"
              />
              {download ? (
                <a
                  href={download.url}
                  download={download.fileName}
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
            </div>
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
            ) : decodeState.state === "pending" ? (
              <p role="status" className="text-sm text-muted">
                {m["common.processing"]()}
              </p>
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
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <section
                  aria-label={m[
                    "shared.baseEncoding.base16DecodedOutputLabel"
                  ]()}
                  className="min-h-72 flex-1 overflow-auto rounded-lg border border-border bg-transparent px-3 py-2.5"
                >
                  <pre className="min-h-full font-mono text-sm leading-6 break-all whitespace-pre-wrap text-foreground">
                    <code>{decodeState.previewText}</code>
                  </pre>
                </section>
                {decodeState.isPreviewTruncated ? (
                  <p className="text-sm text-muted">
                    {m["shared.baseEncoding.base16PreviewTruncatedLabel"]()}
                  </p>
                ) : null}
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["shared.baseEncoding.base58DecoderArticlePurposeTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base58DecoderArticlePurposeBody"]()}</p>
        <h2>{m["shared.baseEncoding.base58DecoderArticleAlphabetTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base58DecoderArticleAlphabetBody"]()}</p>
        <h2>{m["shared.baseEncoding.base58DecoderArticleWatchTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base58DecoderArticleWatchBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function Base58DecoderPage() {
  return (
    <ToolPage instructions={m["shared.base58Base85Usage.base58Decoder"]()}>
      <Base58DecoderPageContent />
    </ToolPage>
  );
}
