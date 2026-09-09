import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Chip, Skeleton } from "@heroui/react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileText,
  GripVertical,
  RotateCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import {
  MAX_PDF_INPUT,
  PdfEditingError,
  pdfFilename,
} from "@workspace/tools/pdf/core";
import { m } from "@/paraglide/messages.js";
import type {
  PdfInfo,
  PdfPagePlan,
  PdfSource,
} from "@workspace/tools/pdf/editing";
import { PdfPreview, PdfPreviewDocument } from "../pdf-editing/preview";
import { runPdfWorker } from "../pdf-editing/worker-client";

type SourceEntry = {
  id: string;
  name: string;
  size: number;
  source: PdfSource;
  info: PdfInfo;
};
type ExportResult = {
  fileName: string;
  pageCount: number;
  size: number;
};

function PdfPageOrganizerPageContent() {
  const [entry, setEntry] = useState<SourceEntry | null>(null);
  const entryRef = useRef<SourceEntry | null>(null);
  const [pages, setPages] = useState<PdfPagePlan[]>([]);
  const originalPages = useRef<PdfPagePlan[]>([]);
  const [busy, setBusy] = useState<"reading" | "generating" | "">("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExportResult | null>(null);
  const [resultUrl, setResultUrl] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const reader = useRef<FileReader | null>(null);
  const pendingBytes = useRef<Uint8Array | null>(null);
  const resultUrlRef = useRef("");

  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
      if (reader.current?.readyState === FileReader.LOADING) {
        reader.current.abort();
      }
      pendingBytes.current?.fill(0);
      pendingBytes.current = null;
      entryRef.current?.source.bytes.fill(0);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  function revokeResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResultUrl("");
    setResult(null);
  }

  function cancelCurrentWork() {
    revision.current += 1;
    controller.current?.abort();
    if (reader.current?.readyState === FileReader.LOADING)
      reader.current.abort();
    controller.current = null;
    reader.current = null;
    pendingBytes.current?.fill(0);
    pendingBytes.current = null;
    setBusy("");
  }

  function clearSource() {
    cancelCurrentWork();
    revokeResult();
    entryRef.current?.source.bytes.fill(0);
    entryRef.current = null;
    originalPages.current = [];
    setEntry(null);
    setPages([]);
    setDraggedIndex(null);
    setError("");
  }

  function invalidateResult() {
    cancelCurrentWork();
    revokeResult();
    setError("");
  }

  function readFile(file: File, signal: AbortSignal) {
    signal.throwIfAborted();
    return new Promise<Uint8Array>((resolve, reject) => {
      const currentReader = new FileReader();
      reader.current = currentReader;
      const cleanup = () => {
        signal.removeEventListener("abort", abort);
        currentReader.onload = null;
        currentReader.onerror = null;
        currentReader.onabort = null;
        if (reader.current === currentReader) reader.current = null;
      };
      const abort = () => {
        if (currentReader.readyState === FileReader.LOADING) {
          currentReader.abort();
        }
        cleanup();
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      currentReader.onload = () => {
        const value = currentReader.result;
        cleanup();
        if (!(value instanceof ArrayBuffer)) {
          reject(new PdfEditingError("read_failed"));
          return;
        }
        resolve(new Uint8Array(value));
      };
      currentReader.onerror = () => {
        cleanup();
        reject(new PdfEditingError("read_failed"));
      };
      currentReader.onabort = () => {
        cleanup();
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      currentReader.readAsArrayBuffer(file);
    });
  }

  async function selectFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    clearSource();
    if (
      !(
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      )
    ) {
      setError(m["tools.pdfPageOrganizer.invalidPdfTypeError"]());
      return;
    }
    if (file.size > MAX_PDF_INPUT) {
      setError(m["tools.pdfPageOrganizer.invalidPdfError"]());
      return;
    }

    const currentRevision = revision.current;
    const currentController = new AbortController();
    controller.current = currentController;
    setBusy("reading");
    setError("");
    let bytes: Uint8Array | null = null;
    try {
      bytes = await readFile(file, currentController.signal);
      pendingBytes.current = bytes;
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
        bytes.fill(0);
        return;
      }
      const nextPages = info.pages.map((page) => ({
        page: page.page,
        rotation: page.rotation,
      }));
      const nextEntry = {
        id: `${file.name}:${file.size}:${file.lastModified}`,
        name: file.name,
        size: file.size,
        source,
        info,
      };
      entryRef.current = nextEntry;
      originalPages.current = nextPages;
      setEntry(nextEntry);
      setPages(nextPages);
      pendingBytes.current = null;
      bytes = null;
    } catch (cause) {
      bytes?.fill(0);
      if (pendingBytes.current === bytes) pendingBytes.current = null;
      if (
        currentRevision === revision.current &&
        !currentController.signal.aborted
      ) {
        setError(errorMessage(cause));
      }
    } finally {
      if (currentRevision === revision.current) {
        controller.current = null;
        setBusy("");
      }
    }
  }

  function updatePages(nextPages: PdfPagePlan[]) {
    invalidateResult();
    setPages(nextPages);
  }

  function movePage(from: number, to: number) {
    if (busy || from === to || to < 0 || to >= pages.length) return;
    const nextPages = [...pages];
    const [moved] = nextPages.splice(from, 1);
    if (!moved) return;
    nextPages.splice(to, 0, moved);
    updatePages(nextPages);
  }

  function rotatePage(pageNumber: number) {
    if (busy) return;
    updatePages(
      pages.map((page) =>
        page.page === pageNumber
          ? { ...page, rotation: (page.rotation + 90) % 360 }
          : page,
      ),
    );
  }

  function removePage(pageNumber: number) {
    if (busy) return;
    updatePages(pages.filter((page) => page.page !== pageNumber));
  }

  function resetPages() {
    if (busy) return;
    updatePages(originalPages.current.map((page) => ({ ...page })));
  }

  async function generatePdf() {
    if (!entry || !pages.length || busy) {
      if (!pages.length) setError(m["tools.pdfPageOrganizer.noPagesError"]());
      return;
    }
    invalidateResult();
    const currentRevision = revision.current;
    const currentController = new AbortController();
    controller.current = currentController;
    setBusy("generating");
    try {
      const output = await runPdfWorker(
        {
          kind: "organize",
          source: entry.source,
          plan: pages,
          filename: pdfFilename(
            `${entry.name.replace(/\.pdf$/i, "")}-organized`,
          ),
        },
        currentController.signal,
      );
      if (
        currentRevision !== revision.current ||
        currentController.signal.aborted ||
        output.kind !== "output"
      ) {
        if (output.kind === "output") {
          for (const file of output.files) file.bytes.fill(0);
          output.archive?.fill(0);
        }
        return;
      }
      const file = output.files[0];
      if (!file) throw new PdfEditingError("invalid_pdf");
      const blob = new Blob([new Uint8Array(file.bytes)], {
        type: "application/pdf",
      });
      for (const outputFile of output.files) outputFile.bytes.fill(0);
      output.archive?.fill(0);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResultUrl(url);
      setResult({
        fileName: file.name,
        pageCount: file.pages,
        size: blob.size,
      });
    } catch (cause) {
      if (
        currentRevision === revision.current &&
        !currentController.signal.aborted
      ) {
        setError(errorMessage(cause));
      }
    } finally {
      if (currentRevision === revision.current) {
        controller.current = null;
        setBusy("");
      }
    }
  }

  return (
    <div className="flex flex-col gap-8" data-tool="pdf-page-organizer">
      <div className="grid items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-6">
          <UploadCard
            busy={busy}
            entry={entry}
            onClear={clearSource}
            onSelect={(files) => void selectFile(files)}
          />
          <ExportCard
            busy={busy}
            pages={pages.length}
            result={result}
            resultUrl={resultUrl}
            onGenerate={() => void generatePdf()}
          />
        </div>

        <PagesCard
          busy={busy}
          draggedIndex={draggedIndex}
          entry={entry}
          pages={pages}
          onDrag={setDraggedIndex}
          onMove={movePage}
          onRemove={removePage}
          onReset={resetPages}
          onRotate={rotatePage}
        />
      </div>

      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.pdfPageOrganizer.errorTitle"]()}
            </Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <ToolArticle>
        <h2>{m["shared.pdfEditing.organizename"]()}</h2>
        <p>{m["tools.pdfPageOrganizer.articleIntro"]()}</p>
        <h2>{m["tools.archiveViewer.article.whenTitle"]()}</h2>
        <p>{m["tools.pdfPageOrganizer.articleWhenBody"]()}</p>
        <h2>{m["tools.pdfPageOrganizer.articleHowTitle"]()}</h2>
        <p>{m["tools.pdfPageOrganizer.articleHowBody"]()}</p>
        <h2>{m["tools.pdfPageOrganizer.articlePrivacyTitle"]()}</h2>
        <p>{m["tools.pdfPageOrganizer.articlePrivacyBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function UploadCard({
  busy,
  entry,
  onClear,
  onSelect,
}: {
  busy: "reading" | "generating" | "";
  entry: SourceEntry | null;
  onClear: () => void;
  onSelect: (files: File[]) => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {entry
            ? m["tools.pdfInfoViewer.selectedPdf"]()
            : m["tools.pdfPageNumberAdder.uploadTitle"]()}
        </Card.Title>
        {entry ? null : (
          <Card.Description>
            {m["tools.pdfPageOrganizer.uploadDescription"]()}
          </Card.Description>
        )}
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        <ToolFilePicker
          accept={["application/pdf", ".pdf"]}
          description={m["tools.pdfMerger.supportedFormatsLabel"]()}
          fileName={entry?.name}
          isDisabled={Boolean(busy)}
          label={
            entry
              ? m["tools.pdfPageOrganizer.changePdfLabel"]()
              : m["tools.pdfPageOrganizer.addPdfLabel"]()
          }
          clearLabel={m["tools.pdfPageOrganizer.changePdfLabel"]()}
          onClear={entry ? onClear : undefined}
          onSelect={(file) => onSelect([file])}
        />
        {busy === "reading" ? (
          <UploadSkeleton
            label={m["tools.pdfPageOrganizer.readingPdfLabel"]()}
          />
        ) : entry ? (
          <div className="flex flex-wrap gap-2 border-t border-separator pt-4">
            <Chip variant="secondary">
              {m["shared.pdfEditing.pages"]()}: {entry.info.pages.length}
            </Chip>
            <Chip variant="tertiary">
              {m["tools.audioRecorder.size"]()}: {formatBytes(entry.size)}
            </Chip>
          </div>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ExportCard({
  busy,
  pages,
  result,
  resultUrl,
  onGenerate,
}: {
  busy: "reading" | "generating" | "";
  pages: number;
  result: ExportResult | null;
  resultUrl: string;
  onGenerate: () => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="flex flex-col items-start gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <Card.Title>
            {m["tools.codeScreenshotGenerator.exportTitle"]()}
          </Card.Title>
          <Card.Description>
            {m["tools.pdfPageOrganizer.exportDescription"]()}
          </Card.Description>
        </div>
        <div className="flex w-full shrink-0 flex-wrap justify-start gap-2 sm:w-auto sm:justify-end">
          {resultUrl && result ? (
            <a
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
              download={result.fileName}
              href={resultUrl}
            >
              <Download aria-hidden className="size-4" />
              {m["shared.pdfEditing.download"]()}
            </a>
          ) : null}
          <Button
            isDisabled={Boolean(busy) || pages === 0}
            onPress={onGenerate}
          >
            <FileText aria-hidden className="size-4" />
            {busy === "generating"
              ? m["tools.imageToPdfConverter.generatingLabel"]()
              : m["shared.pdfEditing.generate"]()}
          </Button>
        </div>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4" aria-live="polite">
        {busy === "generating" ? (
          <ResultSkeleton
            label={m["tools.imageToPdfConverter.generatingLabel"]()}
          />
        ) : result ? (
          <div className="grid gap-4 rounded-xl border border-border bg-surface p-4">
            <div>
              <h3 className="font-medium">
                {m["tools.pdfPageOrganizer.resultReadyTitle"]()}
              </h3>
              <p className="mt-2 text-xs font-medium text-muted">
                {m["tools.pdfPageOrganizer.outputFileLabel"]()}
              </p>
              <p className="mt-1 text-sm break-all text-muted">
                {result.fileName}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip variant="secondary">
                {m["shared.pdfEditing.pages"]()}: {result.pageCount}
              </Chip>
              <Chip variant="tertiary">
                {m["tools.highwayhashHashTextOrFile.outputSizeLabel"]()}:{" "}
                {formatBytes(result.size)}
              </Chip>
            </div>
          </div>
        ) : (
          <EmptyState
            title={m["tools.pdfPageOrganizer.emptyResultTitle"]()}
            description={m["tools.pdfPageOrganizer.emptyResultDescription"]()}
          />
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function PagesCard({
  busy,
  draggedIndex,
  entry,
  pages,
  onDrag,
  onMove,
  onRemove,
  onReset,
  onRotate,
}: {
  busy: "reading" | "generating" | "";
  draggedIndex: number | null;
  entry: SourceEntry | null;
  pages: PdfPagePlan[];
  onDrag: (index: number | null) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (page: number) => void;
  onReset: () => void;
  onRotate: (page: number) => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="flex-row items-start justify-between gap-4 border-b border-separator">
        <div className="min-w-0 flex-1">
          <Card.Title>{m["tools.pdfPageOrganizer.pagesTitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.pdfPageOrganizer.pagesDescription"]()}
          </Card.Description>
        </div>
        <Button
          size="sm"
          variant="outline"
          isDisabled={Boolean(busy) || pages.length === 0}
          onPress={onReset}
        >
          <RotateCw aria-hidden className="size-4" />
          {m["tools.pdfPageOrganizer.resetPagesLabel"]()}
        </Button>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        {busy === "reading" ? (
          <PagesSkeleton
            label={m["tools.pdfPageOrganizer.readingPdfLabel"]()}
          />
        ) : entry && pages.length ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Chip variant="secondary">
                {m["tools.pdfPageOrganizer.outputPagesLabel"]()}: {pages.length}
              </Chip>
            </div>
            <p className="text-sm text-muted">
              {m["tools.pdfPageOrganizer.dragPagesHint"]()}
            </p>
            <PdfPreviewDocument key={entry.id} bytes={entry.source.bytes}>
              <ol className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {pages.map((page, index) => {
                  const pageInfo = entry.info.pages[page.page - 1];
                  const pageLabel = `${m["tools.pdfPageOrganizer.sourcePageLabel"]()} ${page.page}`;
                  return (
                    // Dragging supplements the labeled move-up and move-down buttons; retain list semantics.
                    <li
                      aria-label={pageLabel}
                      className={`group relative flex min-w-0 flex-col gap-3 rounded-xl border bg-surface p-3 transition-colors ${draggedIndex === index ? "border-accent opacity-70" : "border-border"}`}
                      data-page-index={index}
                      draggable={!busy}
                      key={page.page}
                      onDragEnd={() => onDrag(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragStart={() => onDrag(index)}
                      onDrop={(event) => {
                        event.preventDefault();
                        const from = draggedIndex;
                        onDrag(null);
                        if (from !== null) onMove(from, index);
                      }}
                    >
                      <div className="relative flex aspect-3/4 min-h-44 items-center justify-center overflow-hidden rounded-lg border border-border bg-default/40 p-2">
                        <PdfPreview
                          label={`${m["tools.pdfPageOrganizer.previewAltLabel"]()} ${page.page}`}
                          page={page.page}
                          rotation={page.rotation}
                          unavailable={m[
                            "tools.pdfPageOrganizer.previewUnavailableLabel"
                          ]()}
                        />
                        <Chip
                          className="absolute inset-s-2 top-2"
                          variant="secondary"
                        >
                          {index + 1}
                        </Chip>
                        <span
                          aria-hidden
                          className="absolute inset-e-2 top-2 grid size-8 place-items-center rounded-lg border border-border bg-surface text-muted"
                        >
                          <GripVertical className="size-4" />
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {pageLabel}
                        </p>
                        {pageInfo ? (
                          <p className="mt-1 text-xs text-muted">
                            {m["tools.pdfPageOrganizer.pageSizeLabel"]()}:{" "}
                            {formatPageSize(pageInfo.width, pageInfo.height)}
                          </p>
                        ) : null}
                        <p className="text-xs text-muted">
                          {m["shared.pdfEditing.rotation"]()}: {page.rotation}{" "}
                          deg
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-1 border-t border-separator pt-2">
                        <IconButton
                          disabled={Boolean(busy) || index === 0}
                          icon={<ArrowUp />}
                          label={`${m["shared.pdfEditing.up"]()}: ${pageLabel}`}
                          onPress={() => onMove(index, index - 1)}
                        />
                        <IconButton
                          disabled={Boolean(busy) || index === pages.length - 1}
                          icon={<ArrowDown />}
                          label={`${m["shared.pdfEditing.down"]()}: ${pageLabel}`}
                          onPress={() => onMove(index, index + 1)}
                        />
                        <IconButton
                          disabled={Boolean(busy)}
                          icon={<RotateCw />}
                          label={`${m["shared.pdfEditing.rotate"]()}: ${pageLabel}`}
                          onPress={() => onRotate(page.page)}
                        />
                        <IconButton
                          disabled={Boolean(busy)}
                          icon={<Trash2 />}
                          label={`${m["tools.pdfPageOrganizer.removePageLabel"]()}: ${pageLabel}`}
                          onPress={() => onRemove(page.page)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </PdfPreviewDocument>
          </>
        ) : (
          <EmptyState
            title={m["tools.pdfPageOrganizer.emptyPagesTitle"]()}
            description={m["tools.pdfPageOrganizer.emptyPagesDescription"]()}
          />
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function IconButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
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

function EmptyState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="grid min-h-52 place-items-center p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-2">
        <span className="grid size-10 place-items-center rounded-full bg-default text-muted">
          <FileText aria-hidden className="size-5" />
        </span>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}

function UploadSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-3">
      <Skeleton className="h-14 rounded-xl" />
      <div className="flex gap-2">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
    </div>
  );
}

function PagesSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3"
    >
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="grid gap-3 rounded-xl border border-border p-3"
        >
          <Skeleton className="aspect-3/4 min-h-44 rounded-lg" />
          <Skeleton className="h-4 w-2/3 rounded" />
          <Skeleton className="h-9 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function ResultSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-48 content-center gap-3 rounded-xl border border-border p-4"
    >
      <Skeleton className="mx-auto size-10 rounded-full" />
      <Skeleton className="mx-auto h-5 w-40 rounded" />
      <Skeleton className="mx-auto h-4 w-56 max-w-full rounded" />
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIndex]}`;
}

function formatPageSize(width: number, height: number) {
  return `${formatNumber(width)} x ${formatNumber(height)} pt`;
}

function formatNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, "");
}

function errorMessage(cause: unknown) {
  if (!(cause instanceof PdfEditingError))
    return m["tools.pdfPageOrganizer.exportFailedError"]();
  if (cause.code === "encrypted_pdf")
    return m["tools.pdfPageOrganizer.encryptedPdfError"]();
  if (cause.code === "empty_selection")
    return m["tools.pdfPageOrganizer.noPagesError"]();
  if (cause.code === "invalid_pdf" || cause.code === "read_failed") {
    return m["tools.pdfPageOrganizer.invalidPdfError"]();
  }
  return m["tools.pdfPageOrganizer.exportFailedError"]();
}

export default function PdfPageOrganizerPage() {
  return (
    <ToolPage>
      <PdfPageOrganizerPageContent />
    </ToolPage>
  );
}
