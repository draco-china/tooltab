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
import { Download, RefreshCcw, Trash2, TriangleAlert } from "lucide-react";
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
import { useAsyncTask } from "@/hooks/use-async-task";
import { useObjectUrl } from "@/hooks/use-object-url";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import {
  Base85DecoderError,
  type Base85Variant,
  deriveDecodedFileName,
  isBase85Variant,
  MAX_BASE85_SOURCE_CHARACTERS,
  previewBase85Bytes,
} from "./logic";
import { runBase85DecoderWorker } from "./worker-client";

const DEFAULT_INPUTS = {
  ascii85: "BOu!rD]j7BEbo7",
  z85: "nm=QNz=Z<$y?aXj",
} as const satisfies Record<Base85Variant, string>;
const STORAGE_KEYS = {
  alphabet: "tools:base85-decoder:alphabet",
  text: "tools:base85-decoder:text",
} as const;
const VARIANTS = ["ascii85", "z85"] as const;

async function decodeTask(
  job: { input: string; variant: Base85Variant },
  signal: AbortSignal,
) {
  return previewBase85Bytes(
    await runBase85DecoderWorker(job.input, job.variant, signal),
  );
}

function Base85DecoderPageContent() {
  const alphabetId = useId();
  const inputId = useId();
  const readRevision = useRef(0);
  const [variant, setVariant] = useState<Base85Variant>("ascii85");
  const [input, setInput] = useState<string>(DEFAULT_INPUTS.ascii85);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [fileReadFailed, setFileReadFailed] = useState(false);
  const deferredInput = useDeferredValue(input);
  const task = useAsyncTask(decodeTask);
  const { run, clear: clearTask } = task;
  const decodeState = task.result ?? { state: "empty" as const };
  const blob = useMemo(
    () =>
      task.result
        ? new Blob([task.result.bytes], { type: "application/octet-stream" })
        : null,
    [task.result],
  );
  const objectUrl = useObjectUrl(blob);
  const downloadUrl = task.result ? objectUrl : "";
  useEffect(() => {
    if (deferredInput.trim()) void run({ input: deferredInput, variant });
    else clearTask();
    return clearTask;
  }, [deferredInput, variant, run, clearTask]);
  useEffect(
    () => () => {
      readRevision.current++;
    },
    [],
  );

  useEffect(() => {
    safeLocalStorage.removeItem(STORAGE_KEYS.text);
    const storedVariant = safeLocalStorage.getItem(STORAGE_KEYS.alphabet);
    if (storedVariant && isBase85Variant(storedVariant)) {
      setVariant(storedVariant);
      setInput(DEFAULT_INPUTS[storedVariant]);
    }
  }, []);
  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.alphabet, variant);
  }, [variant]);

  function updateInput(value: string) {
    if (value === input) return;
    readRevision.current += 1;
    clearTask();
    setInput(value);
    setSourceFileName(null);
    setFileReadFailed(false);
  }
  function updateVariant(next: Base85Variant) {
    if (next === variant) return;
    readRevision.current += 1;
    clearTask();
    if (!sourceFileName && input === DEFAULT_INPUTS[variant]) {
      setInput(DEFAULT_INPUTS[next]);
    }
    setVariant(next);
    setFileReadFailed(false);
  }
  async function selectFile(file: File) {
    const revision = readRevision.current + 1;
    readRevision.current = revision;
    clearTask();
    setFileReadFailed(false);
    try {
      if (file.size > MAX_BASE85_SOURCE_CHARACTERS)
        throw new Base85DecoderError("too-large");
      const text = await file.text();
      if (text.length > MAX_BASE85_SOURCE_CHARACTERS)
        throw new Base85DecoderError("too-large");
      if (revision !== readRevision.current) return;
      if (text === input) void run({ input: text, variant });
      setInput(text);
      setSourceFileName(file.name || null);
    } catch {
      if (revision !== readRevision.current) return;
      setSourceFileName(null);
      setFileReadFailed(true);
    }
  }
  function loadSample() {
    readRevision.current += 1;
    clearTask();
    if (input === DEFAULT_INPUTS[variant]) void run({ input, variant });
    setInput(DEFAULT_INPUTS[variant]);
    setSourceFileName(null);
    setFileReadFailed(false);
  }
  function clear() {
    readRevision.current += 1;
    clearTask();
    setInput("");
    setSourceFileName(null);
    setFileReadFailed(false);
  }
  const alphabetLabel = (value: Base85Variant) =>
    value === "z85"
      ? m["shared.baseEncoding.base85DecoderAlphabetZ85"]()
      : m["shared.baseEncoding.base85DecoderAlphabetAscii85"]();
  const errorTitle = fileReadFailed
    ? m["shared.baseEncoding.base16FileReadFailedTitle"]()
    : task.error instanceof Base85DecoderError &&
        task.error.code === "too-large"
      ? m["shared.baseEncoding.toolarge"]()
      : task.error instanceof Base85DecoderError &&
          task.error.code === "unsupported"
        ? m["tools.base58Encoder.baseunsupported"]()
        : task.error
          ? m["shared.baseEncoding.base85DecoderInvalidBase85Title"]()
          : null;

  return (
    <div className="grid gap-10">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <Card.Title>
                {m["shared.baseEncoding.base85DecoderBase85InputLabel"]()}
              </Card.Title>
              <Card.Description>
                {sourceFileName
                  ? `${m["common.adler32importfromfilelabel"]()}: ${sourceFileName}`
                  : m[
                      "shared.baseEncoding.base85DecoderBase85InputPlaceholder"
                    ]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <Button size="sm" variant="ghost" onPress={loadSample}>
                <RefreshCcw aria-hidden className="size-4" />
                {m["shared.baseEncoding.base58EncoderLoadSampleLabel"]()}
              </Button>
              <Button size="sm" variant="ghost" onPress={clear}>
                <Trash2 aria-hidden className="size-4" />
                {m["common.base64clear"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <Select
              variant="secondary"
              selectedKey={variant}
              onSelectionChange={(key) => {
                const next = String(key);
                if (isBase85Variant(next)) updateVariant(next);
              }}
            >
              <Label htmlFor={alphabetId}>
                {m["shared.baseEncoding.alphabet"]()}
              </Label>
              <Select.Trigger id={alphabetId} className="w-full">
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
            <div className="grid gap-2">
              <Label htmlFor={inputId}>
                {m["shared.baseEncoding.base85DecoderBase85InputLabel"]()}
              </Label>
              <TextArea
                id={inputId}
                aria-label={m[
                  "shared.baseEncoding.base85DecoderBase85InputLabel"
                ]()}
                autoComplete="off"
                spellCheck={false}
                rows={10}
                value={input}
                placeholder={m[
                  "shared.baseEncoding.base85DecoderBase85InputPlaceholder"
                ]()}
                className="min-h-72 resize-y font-mono text-sm"
                onChange={(event) => updateInput(event.currentTarget.value)}
              />
            </div>
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              accept={["text/*", ".txt", ".b85", ".a85", ".ascii85", ".z85"]}
              fileName={sourceFileName ?? undefined}
              inputTestId="base85-decoder-file-input"
              onSelect={(file) => void selectFile(file)}
              onClear={
                sourceFileName ? () => setSourceFileName(null) : undefined
              }
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Card.Title>
              {m["shared.baseEncoding.base16DecodedOutputLabel"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.base85Decoder.decodedOutputDescription"]()}
            </Card.Description>
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <ToolCopyButton
                value={
                  decodeState.state === "decoded"
                    ? (decodeState.text ?? "")
                    : ""
                }
                copyLabel={m["common.actions.copy"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={
                  decodeState.state !== "decoded" || decodeState.text === null
                }
                variant="ghost"
              />
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={deriveDecodedFileName(sourceFileName)}
                  className={buttonVariants({ size: "sm", variant: "ghost" })}
                >
                  <Download aria-hidden className="size-4" />
                  {m["shared.aesTools.decryptdownloadfilelabel"]()}
                </a>
              ) : (
                <Button size="sm" variant="ghost" isDisabled>
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
            ) : task.busy ? (
              <div aria-busy="true">
                <Skeleton className="h-72 w-full" />
              </div>
            ) : decodeState.state === "decoded" && decodeState.text === null ? (
              <p>{m["shared.baseEncoding.binary"]()}</p>
            ) : decodeState.state === "decoded" ? (
              <>
                <TextArea
                  readOnly
                  aria-label={m[
                    "shared.baseEncoding.base16DecodedOutputLabel"
                  ]()}
                  spellCheck={false}
                  rows={10}
                  value={decodeState.previewText}
                  className="min-h-72 resize-y font-mono text-sm"
                />
                {decodeState.isPreviewTruncated ? (
                  <p className="text-sm text-muted">
                    {m["tools.base85Decoder.previewTruncatedLabel"]()}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center text-sm text-muted">
                {m["shared.baseEncoding.base16DecodedOutputEmptyDescription"]()}
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["shared.baseEncoding.base85DecoderArticleWhyTitle"]()}</h2>
        <p>{m["shared.baseEncoding.base85DecoderArticleWhyBody"]()}</p>
        <h2>{m["shared.baseEncoding.base85DecoderArticleHelpTitle"]()}</h2>
        <p>{m["tools.base85Decoder.articleHelpBody"]()}</p>
        <h2>{m["shared.baseEncoding.base32ArticleNotesTitle"]()}</h2>
        <ul>
          {[
            m["shared.baseEncoding.base85DecoderArticleNoteOne"](),
            m["shared.baseEncoding.base85DecoderArticleNoteTwo"](),
            m["tools.base85Decoder.articleNotes2"](),
          ].map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function Base85DecoderPage() {
  return (
    <ToolPage instructions={m["tools.base85Decoder.usage"]()}>
      <Base85DecoderPageContent />
    </ToolPage>
  );
}
