import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  Modal,
  ProgressBar,
  useOverlayState,
} from "@heroui/react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  FileText,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import {
  MAX_PDF_INPUT,
  PdfEditingError,
  pdfFilename,
} from "@workspace/tools/pdf/core";
import { m } from "@/paraglide/messages.js";
import type {
  PdfInfo,
  PdfOutput,
  PdfSource,
} from "@workspace/tools/pdf/editing";
import { runPdfWorker } from "../pdf-editing/worker-client";

type Entry = {
  id: string;
  source: PdfSource;
  info: PdfInfo;
  previewUrl: string;
};

function PdfMergerPageContent() {
  const inputId = useId();
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef<Entry[]>([]);
  const [outputName, setOutputName] = useState("merged.pdf");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PdfOutput | null>(null);
  const [resultUrl, setResultUrl] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [draggedId, setDraggedId] = useState("");
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const resultUrlRef = useRef("");
  const previewState = useOverlayState({
    isOpen: Boolean(previewId),
    onOpenChange: (open) => {
      if (!open) setPreviewId("");
    },
  });

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    const addPastedFiles = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) void addFiles(files);
    };
    window.addEventListener("paste", addPastedFiles);
    return () => window.removeEventListener("paste", addPastedFiles);
  });

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
      for (const entry of entriesRef.current) {
        URL.revokeObjectURL(entry.previewUrl);
      }
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  const pageCount = useMemo(
    () => entries.reduce((total, entry) => total + entry.info.pages.length, 0),
    [entries],
  );
  const inputSize = useMemo(
    () =>
      entries.reduce((total, entry) => total + entry.source.bytes.length, 0),
    [entries],
  );
  const previewEntry = entries.find((entry) => entry.id === previewId);

  function revokeResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResultUrl("");
    setResult(null);
  }

  function invalidate() {
    revision.current += 1;
    controller.current?.abort();
    setBusy(false);
    setProgress(null);
    setError("");
    revokeResult();
  }

  async function readFile(file: File, signal: AbortSignal) {
    signal.throwIfAborted();
    return new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      const cleanup = () => {
        signal.removeEventListener("abort", abort);
        reader.onload = null;
        reader.onerror = null;
        reader.onabort = null;
      };
      const abort = () => {
        if (reader.readyState === FileReader.LOADING) reader.abort();
        cleanup();
        reject(signal.reason);
      };
      reader.onload = () => {
        cleanup();
        if (!(reader.result instanceof ArrayBuffer)) {
          reject(new PdfEditingError("read_failed"));
          return;
        }
        resolve(new Uint8Array(reader.result));
      };
      reader.onerror = () => {
        cleanup();
        reject(new PdfEditingError("read_failed"));
      };
      reader.onabort = () => {
        cleanup();
        reject(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
      reader.readAsArrayBuffer(file);
    });
  }

  async function addFiles(files: File[]) {
    if (!files.length || busy) return;
    invalidate();
    const currentRevision = revision.current;
    const currentController = new AbortController();
    controller.current = currentController;
    const signatures = new Set(entriesRef.current.map((entry) => entry.id));
    const accepted = files.filter((file) => {
      const valid =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (!valid) setError(m["tools.pdfMerger.invalidPdfError"]());
      return valid;
    });
    if (!accepted.length) return;
    if (
      entriesRef.current.length + accepted.length > 100 ||
      inputSize + accepted.reduce((total, file) => total + file.size, 0) >
        MAX_PDF_INPUT
    ) {
      setError(m["tools.pdfMerger.mergeFailedError"]());
      return;
    }
    setBusy(true);
    try {
      let nextEntries = entriesRef.current;
      for (const file of accepted) {
        const signature = `${file.name}:${file.size}:${file.lastModified}`;
        if (signatures.has(signature)) {
          setError(m["tools.pdfMerger.duplicateFileError"]());
          continue;
        }
        signatures.add(signature);
        const bytes = await readFile(file, currentController.signal);
        const source = { name: file.name, bytes };
        const info = await runPdfWorker(
          { kind: "inspect", source },
          currentController.signal,
        );
        if (
          currentRevision !== revision.current ||
          currentController.signal.aborted ||
          info.kind !== "info"
        ) {
          return;
        }
        const entry = {
          id: signature,
          source,
          info,
          previewUrl: URL.createObjectURL(file),
        };
        nextEntries = [...nextEntries, entry];
        entriesRef.current = nextEntries;
        setEntries(nextEntries);
      }
    } catch (cause) {
      if (
        !currentController.signal.aborted &&
        currentRevision === revision.current
      ) {
        setError(errorMessage(cause));
      }
    } finally {
      if (currentRevision === revision.current) setBusy(false);
    }
  }

  function updateEntries(nextEntries: Entry[]) {
    invalidate();
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
  }

  function move(from: number, to: number) {
    if (busy || from === to || to < 0 || to >= entries.length) return;
    const next = [...entries];
    const [entry] = next.splice(from, 1);
    if (!entry) return;
    next.splice(to, 0, entry);
    updateEntries(next);
  }

  function removeEntry(id: string) {
    const entry = entries.find((item) => item.id === id);
    if (entry) URL.revokeObjectURL(entry.previewUrl);
    if (previewId === id) setPreviewId("");
    updateEntries(entries.filter((item) => item.id !== id));
  }

  function clearEntries() {
    for (const entry of entries) URL.revokeObjectURL(entry.previewUrl);
    setPreviewId("");
    updateEntries([]);
  }

  async function merge() {
    if (entries.length < 2 || busy) {
      setError(m["tools.pdfMerger.noFilesError"]());
      return;
    }
    invalidate();
    const currentRevision = revision.current;
    const currentController = new AbortController();
    controller.current = currentController;
    setBusy(true);
    setProgress([0, entries.length]);
    try {
      const output = await runPdfWorker(
        {
          kind: "merge",
          sources: entries.map((entry) => entry.source),
          filename: pdfFilename(outputName, "merged"),
        },
        currentController.signal,
        60_000,
        (done, total) => {
          if (currentRevision === revision.current) setProgress([done, total]);
        },
      );
      if (
        currentRevision !== revision.current ||
        currentController.signal.aborted ||
        output.kind !== "output"
      ) {
        return;
      }
      const file = output.files[0];
      if (!file) throw new PdfEditingError("invalid_pdf");
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(file.bytes)], { type: "application/pdf" }),
      );
      resultUrlRef.current = url;
      setResult(output);
      setResultUrl(url);
    } catch (cause) {
      if (
        !currentController.signal.aborted &&
        currentRevision === revision.current
      ) {
        setError(errorMessage(cause));
      }
    } finally {
      if (currentRevision === revision.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-col gap-6" data-tool="pdf-merger">
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <ToolPanelCard>
              <Card.Header className="border-b border-separator">
                <Card.Title>{m["tools.pdfMerger.uploadTitle"]()}</Card.Title>
                <Card.Description>
                  {m["tools.pdfMerger.uploadDescription"]()}
                </Card.Description>
              </Card.Header>
              <ToolPanelCardContent className="gap-4 py-4">
                <ToolFilePicker
                  label={m["tools.pdfMerger.addFilesLabel"]()}
                  accept={["application/pdf", ".pdf"]}
                  description={m["tools.pdfMerger.supportedFormatsLabel"]()}
                  isDisabled={busy}
                  multiple
                  onSelectFiles={(files) => void addFiles(files)}
                />
              </ToolPanelCardContent>
            </ToolPanelCard>

            <ToolPanelCard>
              <Card.Header className="border-b border-separator">
                <div className="min-w-0 flex-1">
                  <Card.Title>{m["tools.pdfMerger.queueTitle"]()}</Card.Title>
                  <Card.Description>
                    {m["tools.pdfMerger.queueDescription"]()}
                  </Card.Description>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  isDisabled={busy || !entries.length}
                  onPress={clearEntries}
                >
                  <Trash2 aria-hidden className="size-4" />
                  {m["shared.pdfEditing.clear"]()}
                </Button>
              </Card.Header>
              <ToolPanelCardContent className="gap-4 py-4">
                {entries.length ? (
                  <>
                    <SummaryChips
                      files={entries.length}
                      pages={pageCount}
                      bytes={inputSize}
                    />
                    <ol className="-mx-1 flex max-h-128 flex-col gap-3 overflow-y-auto px-1">
                      {entries.map((entry, index) => (
                        // Dragging supplements the labeled move-up and move-down buttons; retain list semantics.
                        <li
                          key={entry.id}
                          draggable={!busy}
                          className={`grid gap-3 rounded-xl border bg-surface p-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto] ${draggedId === entry.id ? "border-accent" : "border-border"}`}
                          onDragStart={() => setDraggedId(entry.id)}
                          onDragEnd={() => setDraggedId("")}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const from = entries.findIndex(
                              (item) => item.id === draggedId,
                            );
                            setDraggedId("");
                            if (from >= 0) move(from, index);
                          }}
                        >
                          <span className="grid size-10 place-items-center self-center rounded-lg bg-default text-sm font-medium text-muted">
                            {index + 1}
                          </span>
                          <div className="min-w-0 self-center">
                            <p className="truncate text-sm font-medium">
                              {entry.source.name}
                            </p>
                            <p className="mt-1 text-sm text-muted">
                              {formatBytes(entry.source.bytes.length)} ·{" "}
                              {formatCount(entry.info.pages.length)}
                            </p>
                          </div>
                          <div className="flex items-center justify-end gap-1 self-center">
                            <IconButton
                              label={`${m["shared.pdfEditing.up"]()}: ${entry.source.name}`}
                              disabled={busy || index === 0}
                              onPress={() => move(index, index - 1)}
                              icon={<ArrowUp />}
                            />
                            <IconButton
                              label={`${m["shared.pdfEditing.down"]()}: ${entry.source.name}`}
                              disabled={busy || index === entries.length - 1}
                              onPress={() => move(index, index + 1)}
                              icon={<ArrowDown />}
                            />
                            <IconButton
                              label={`${m["common.archivepreview"]()}: ${entry.source.name}`}
                              disabled={busy}
                              onPress={() => setPreviewId(entry.id)}
                              icon={<Eye />}
                            />
                            <IconButton
                              label={`${m["shared.aesTools.clearfile"]()}: ${entry.source.name}`}
                              disabled={busy}
                              onPress={() => removeEntry(entry.id)}
                              icon={<Trash2 />}
                            />
                          </div>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <Empty
                    icon={<FileText />}
                    title={m["tools.pdfMerger.emptyQueueTitle"]()}
                    description={m["tools.pdfMerger.emptyQueueDescription"]()}
                  />
                )}
              </ToolPanelCardContent>
            </ToolPanelCard>
          </div>

          <div className="flex flex-col gap-6 xl:sticky xl:top-6">
            <ToolPanelCard>
              <Card.Header className="border-b border-separator">
                <Card.Title>{m["tools.pdfMerger.summaryTitle"]()}</Card.Title>
              </Card.Header>
              <ToolPanelCardContent className="gap-5 py-4">
                <SummaryChips
                  files={entries.length}
                  pages={pageCount}
                  bytes={inputSize}
                />
                <div className="grid gap-2">
                  <Label htmlFor={inputId}>
                    {m["shared.pdfEditing.filename"]()}
                  </Label>
                  <Input
                    id={inputId}
                    variant="secondary"
                    autoComplete="off"
                    value={outputName}
                    placeholder={m["tools.pdfMerger.outputFilePlaceholder"]()}
                    onChange={(event) => {
                      invalidate();
                      setOutputName(event.currentTarget.value);
                    }}
                  />
                  <p className="text-sm text-muted">
                    {m["tools.pdfMerger.outputFileDescription"]()}
                  </p>
                </div>
              </ToolPanelCardContent>
              <ToolPanelCardFooter>
                <Button
                  className="w-full"
                  isDisabled={busy || entries.length < 2}
                  onPress={() => void merge()}
                >
                  <FileText aria-hidden className="size-4" />
                  {busy
                    ? m["tools.pdfMerger.mergingLabel"]()
                    : m["tools.pdfMerger.mergeLabel"]()}
                </Button>
              </ToolPanelCardFooter>
            </ToolPanelCard>

            <ToolPanelCard>
              <Card.Header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-separator">
                <Card.Title>{m["shared.macIntegrity.result"]()}</Card.Title>
                {resultUrl && result?.files[0] ? (
                  <a
                    href={resultUrl}
                    download={result.files[0].name}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  >
                    <Download aria-hidden className="size-4" />
                    {m["tools.pdfMerger.downloadPdfLabel"]()}
                  </a>
                ) : null}
                <Card.Description className="col-span-2">
                  {m["tools.pdfMerger.resultDescription"]()}
                </Card.Description>
              </Card.Header>
              <ToolPanelCardContent className="gap-4 py-4" aria-live="polite">
                {result?.files[0] ? (
                  <div className="grid gap-4">
                    <div>
                      <h3 className="font-medium">
                        {m["tools.pdfMerger.resultReadyTitle"]()}
                      </h3>
                      <p className="mt-1 text-sm break-all text-muted">
                        {result.files[0].name}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Chip variant="secondary">
                        {m["shared.pdfEditing.pages"]()}:{" "}
                        {result.files[0].pages}
                      </Chip>
                      <Chip variant="tertiary">
                        {m["tools.highwayhashHashTextOrFile.outputSizeLabel"]()}
                        : {formatBytes(result.files[0].bytes.length)}
                      </Chip>
                    </div>
                  </div>
                ) : (
                  <Empty
                    icon={<FileText />}
                    title={
                      busy
                        ? m["tools.pdfMerger.mergingLabel"]()
                        : m["tools.pdfMerger.emptyResultTitle"]()
                    }
                    description={
                      busy && progress
                        ? progressLabel(progress)
                        : m["tools.pdfMerger.emptyResultDescription"]()
                    }
                  />
                )}
                {busy && progress ? (
                  <ProgressBar
                    value={(progress[0] / progress[1]) * 100}
                    aria-label={progressLabel(progress)}
                  >
                    <ProgressBar.Track>
                      <ProgressBar.Fill />
                    </ProgressBar.Track>
                  </ProgressBar>
                ) : null}
              </ToolPanelCardContent>
            </ToolPanelCard>
          </div>
        </div>

        {error ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>{m["tools.pdfMerger.errorTitle"]()}</Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        {previewEntry ? (
          <Modal.Backdrop
            isOpen={previewState.isOpen}
            onOpenChange={previewState.setOpen}
          >
            <Modal.Container className="max-h-[90vh] overflow-hidden sm:max-w-5xl">
              <Modal.Dialog className="gap-0 p-0">
                <Modal.Header className="border-b border-separator px-4 py-4 pe-12">
                  <Modal.Heading className="break-all">
                    {m["tools.pdfMerger.previewTitle"]({
                      name: previewEntry.source.name,
                    })}
                  </Modal.Heading>
                </Modal.Header>
                <iframe
                  className="h-[70vh] min-h-80 w-full border-0 bg-default"
                  src={previewEntry.previewUrl}
                  title={previewEntry.source.name}
                />
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        ) : null}
      </div>

      <ToolArticle>
        <h2>{m["tools.pdfMerger.articleTitle"]()}</h2>
        <p>{m["tools.pdfMerger.articleIntro"]()}</p>
        <h2>{m["tools.pdfMerger.articleOrderTitle"]()}</h2>
        <p>{m["tools.pdfMerger.articleOrderBody"]()}</p>
        <h2>{m["tools.archiveViewer.article.privacyTitle"]()}</h2>
        <p>
          {m["tools.pdfMerger.articlePrivacyBefore"]()}
          <code>{m["tools.pdfMerger.articlePrivacyCode"]()}</code>
          {m["tools.pdfMerger.articlePrivacyAfter"]()}
        </p>
        <h2>{m["tools.pdfMerger.articleLimitsTitle"]()}</h2>
        <p>{m["tools.pdfMerger.articleLimitsBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onPress,
  icon,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      aria-label={label}
      isDisabled={disabled}
      onPress={onPress}
    >
      {icon}
    </Button>
  );
}

function Empty({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-5 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-default text-muted [&_svg]:size-5">
        {icon}
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted">{description}</p>
    </div>
  );
}

function SummaryChips({
  files,
  pages,
  bytes,
}: {
  files: number;
  pages: number;
  bytes: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip variant="secondary">
        {m["common.archivefiles"]()}: {files}
      </Chip>
      <Chip variant="tertiary">
        {m["shared.pdfEditing.pages"]()}: {pages}
      </Chip>
      <Chip variant="tertiary">
        {m["tools.imageToPdfConverter.fileSizeLabel"]()}: {formatBytes(bytes)}
      </Chip>
    </div>
  );
}

function formatCount(count: number) {
  return count === 1
    ? m["tools.pdfMerger.pageStatusLabel"]({ count: String(count) })
    : m["tools.pdfMerger.pagesStatusLabel"]({ count: String(count) });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function progressLabel(progress: [number, number]) {
  return m["tools.pdfMerger.processingStatusLabel"]({
    completed: String(progress[0]),
    total: String(progress[1]),
  });
}

function errorMessage(error: unknown) {
  if (!(error instanceof PdfEditingError))
    return m["tools.pdfMerger.mergeFailedError"]();
  if (error.code === "encrypted_pdf")
    return m["tools.pdfMerger.encryptedPdfError"]();
  if (error.code === "unsupported")
    return m["tools.pdfMerger.workerUnavailableError"]();
  if (error.code === "invalid_pdf" || error.code === "read_failed")
    return m["tools.pdfMerger.invalidPdfError"]();
  return m["tools.pdfMerger.mergeFailedError"]();
}

export default function PdfMergerPage() {
  return (
    <ToolPage>
      <PdfMergerPageContent />
    </ToolPage>
  );
}
