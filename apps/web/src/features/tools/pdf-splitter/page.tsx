import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Check, Download, FileText, TriangleAlert } from "lucide-react";
import {
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
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
  pageRanges,
  formatPagesToRanges,
} from "@workspace/tools/pdf/core";
import { m } from "@/paraglide/messages.js";
import { formatFileSize } from "@/lib/file-size";
import { getLocale } from "@/paraglide/runtime.js";
import type {
  PdfInfo,
  PdfOutput,
  PdfSource,
} from "@workspace/tools/pdf/editing";
import {
  archiveSinglePdf,
  PdfZipError,
} from "../pdf-editing/pdf-splitter-archive-client";
import { PdfPreview, PdfPreviewDocument } from "../pdf-editing/preview";
import { runPdfWorker } from "../pdf-editing/worker-client";

type FileState = { file: File; source: PdfSource; info: PdfInfo };
type OutputMode = "single" | "multiple";
type MultipleMode = "ranges" | "pages";
type RangeIssue = "descending" | "duplicate" | "invalid" | "out-of-bounds";
type ResultState = {
  fileCount: number;
  fileName: string;
  kind: "pdf" | "zip";
  url: string;
};

function PdfSplitterPageContent() {
  const rangeId = useId();
  const [fileState, setFileState] = useState<FileState | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [rangeInput, setRangeInput] = useState("");
  const [outputMode, setOutputMode] = useState<OutputMode>("single");
  const [multipleMode, setMultipleMode] = useState<MultipleMode>("ranges");
  const [isReading, setIsReading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResultState | null>(null);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const reader = useRef<FileReader | null>(null);
  const pendingBytes = useRef<Uint8Array | null>(null);
  const source = useRef<FileState | null>(null);
  const resultUrl = useRef("");
  const lastInteractedPage = useRef<number | null>(null);

  const pageCount = fileState?.info.pages.length ?? 0;
  const rangeValidation = useMemo(
    () => validatePageRange(rangeInput, pageCount),
    [pageCount, rangeInput],
  );
  const selectedPages = rangeValidation.pages;
  const selectedSet = useMemo(() => new Set(selectedPages), [selectedPages]);
  const rangeError = rangeValidation.issue
    ? rangeIssueMessage(rangeValidation.issue)
    : "";

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
      reader.current?.abort();
      pendingBytes.current?.fill(0);
      source.current?.source.bytes.fill(0);
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      controller.current = null;
      reader.current = null;
      pendingBytes.current = null;
      source.current = null;
      resultUrl.current = "";
    },
    [],
  );

  function clearResult() {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = "";
    setResult(null);
  }

  function cancelCurrentWork() {
    revision.current += 1;
    controller.current?.abort();
    reader.current?.abort();
    pendingBytes.current?.fill(0);
    pendingBytes.current = null;
    controller.current = null;
    reader.current = null;
    setIsReading(false);
    setIsGenerating(false);
  }

  function invalidateResult() {
    cancelCurrentWork();
    clearResult();
    setError("");
  }

  function releaseSource() {
    source.current?.source.bytes.fill(0);
    source.current = null;
    setFileState(null);
    setPendingFile(null);
  }

  function resetDocumentState() {
    lastInteractedPage.current = null;
    setRangeInput("");
    setOutputMode("single");
    setMultipleMode("ranges");
  }

  function removeFile() {
    invalidateResult();
    releaseSource();
    resetDocumentState();
  }

  async function selectFile(file: File) {
    invalidateResult();
    releaseSource();
    resetDocumentState();
    if (!isPdf(file)) {
      setError(m["tools.pdfInfoViewer.unsupportedFile"]());
      return;
    }
    if (file.size > MAX_PDF_INPUT) {
      setError(m["tools.pdfSplitter.invalidPdf"]());
      return;
    }

    const currentRevision = revision.current;
    const currentController = new AbortController();
    controller.current = currentController;
    setPendingFile(file);
    setIsReading(true);
    let bytes: Uint8Array | undefined;
    let adopted = false;
    try {
      bytes = await readPdfFile(file, currentController.signal, reader);
      pendingBytes.current = bytes;
      const inspection = await runPdfWorker(
        { kind: "inspect", source: { name: file.name, bytes } },
        currentController.signal,
      );
      if (
        currentRevision !== revision.current ||
        currentController.signal.aborted
      )
        return;
      if (inspection.kind !== "info") throw new PdfEditingError("invalid_pdf");
      const next = {
        file,
        source: { name: file.name, bytes },
        info: inspection,
      };
      adopted = true;
      pendingBytes.current = null;
      source.current = next;
      setFileState(next);
      setPendingFile(null);
      setRangeInput(
        formatPagesToRanges(inspection.pages.map(({ page }) => page)),
      );
    } catch (cause) {
      if (
        currentRevision === revision.current &&
        !currentController.signal.aborted
      ) {
        setPendingFile(null);
        setError(pdfErrorMessage(cause, "read"));
      }
    } finally {
      if (!adopted) {
        bytes?.fill(0);
        if (pendingBytes.current === bytes) pendingBytes.current = null;
      }
      if (currentRevision === revision.current) {
        controller.current = null;
        setIsReading(false);
      }
    }
  }

  function setSelection(pages: readonly number[]) {
    invalidateResult();
    const normalized = [...new Set(pages)].sort((left, right) => left - right);
    setRangeInput(formatPagesToRanges(normalized));
  }

  function togglePage(page: number, useRange: boolean) {
    const next = new Set(selectedPages);
    if (useRange && lastInteractedPage.current !== null) {
      const start = Math.min(lastInteractedPage.current, page);
      const end = Math.max(lastInteractedPage.current, page);
      for (let current = start; current <= end; current += 1) next.add(current);
    } else if (next.has(page)) next.delete(page);
    else next.add(page);
    lastInteractedPage.current = page;
    setSelection([...next]);
  }

  function updateRange(value: string) {
    invalidateResult();
    setRangeInput(value);
  }

  function updateOutputMode(value: OutputMode) {
    invalidateResult();
    setOutputMode(value);
  }

  function updateMultipleMode(value: MultipleMode) {
    invalidateResult();
    setMultipleMode(value);
  }

  async function generateResult() {
    if (!fileState || rangeValidation.issue || !selectedPages.length) return;
    invalidateResult();
    const currentRevision = revision.current;
    const currentController = new AbortController();
    controller.current = currentController;
    setIsGenerating(true);
    let output: PdfOutput | undefined;
    let generatedArchive: Uint8Array | undefined;
    try {
      const baseName = outputBaseName(fileState.file.name, outputMode);
      const response = await runPdfWorker(
        {
          kind: "split",
          source: fileState.source,
          ranges: rangeInput,
          outputMode,
          multipleMode,
          filename: pdfFilename(baseName),
        },
        currentController.signal,
      );
      if (response.kind !== "output") throw new PdfEditingError("invalid_pdf");
      output = response;
      if (
        currentRevision !== revision.current ||
        currentController.signal.aborted
      )
        return;
      const firstFile = output.files[0];
      if (!firstFile) throw new PdfEditingError("invalid_pdf");
      if (outputMode === "multiple" && !output.archive) {
        generatedArchive = await archiveSinglePdf(
          firstFile.name,
          firstFile.bytes,
          currentController.signal,
        );
      }
      if (
        currentRevision !== revision.current ||
        currentController.signal.aborted
      )
        return;
      const archive = output.archive ?? generatedArchive;
      const isZip = Boolean(archive);
      const bytes = archive ?? firstFile.bytes;
      const blob = new Blob([new Uint8Array(bytes)], {
        type: isZip ? "application/zip" : "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      resultUrl.current = url;
      setResult({
        fileCount: output.files.length,
        fileName: isZip ? `${baseName}.zip` : firstFile.name,
        kind: isZip ? "zip" : "pdf",
        url,
      });
    } catch (cause) {
      if (
        currentRevision === revision.current &&
        !currentController.signal.aborted
      )
        setError(
          cause instanceof PdfZipError
            ? m["tools.pdfSplitter.zipFailed"]()
            : pdfErrorMessage(cause, "generate"),
        );
    } finally {
      generatedArchive?.fill(0);
      releaseOutputBytes(output);
      if (currentRevision === revision.current) {
        controller.current = null;
        setIsGenerating(false);
      }
    }
  }

  const activeFile = pendingFile ?? fileState?.file ?? null;
  const canGenerate =
    Boolean(fileState) &&
    !isReading &&
    !isGenerating &&
    !rangeValidation.issue &&
    selectedPages.length > 0;

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool="pdf-splitter">
        <div
          className={`grid items-start gap-5 ${activeFile ? "xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]" : "w-full"}`}
        >
          <UploadCard
            file={activeFile}
            fileState={fileState}
            isReading={isReading}
            onRemove={removeFile}
            onSelect={(file) => void selectFile(file)}
          />

          {activeFile ? (
            <div className="grid min-w-0 gap-5">
              {fileState ? (
                <>
                  <SelectionCard
                    canGenerate={canGenerate}
                    disabled={isGenerating}
                    isGenerating={isGenerating}
                    multipleMode={multipleMode}
                    onGenerate={() => void generateResult()}
                    onMultipleModeChange={updateMultipleMode}
                    onOutputModeChange={updateOutputMode}
                    onRangeChange={updateRange}
                    onSetSelection={setSelection}
                    outputMode={outputMode}
                    pageCount={pageCount}
                    rangeError={rangeError}
                    rangeId={rangeId}
                    rangeInput={rangeInput}
                    selectedPages={selectedPages}
                  />
                  <PageGrid
                    fileState={fileState}
                    onTogglePage={togglePage}
                    selectedPages={selectedSet}
                  />
                </>
              ) : (
                <ReadingCard />
              )}

              {fileState && (isGenerating || result) ? (
                <ResultCard isGenerating={isGenerating} result={result} />
              ) : null}
            </div>
          ) : null}
        </div>

        {error ? <ErrorAlert error={error} /> : null}
      </div>

      <Article />
    </div>
  );
}

function UploadCard({
  file,
  fileState,
  isReading,
  onRemove,
  onSelect,
}: {
  file: File | null;
  fileState: FileState | null;
  isReading: boolean;
  onRemove: () => void;
  onSelect: (file: File) => void;
}) {
  const locale = getLocale();
  return (
    <ToolPanelCard className={file ? "xl:sticky xl:top-6" : ""}>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {file
            ? m["tools.pdfInfoViewer.selectedPdf"]()
            : m["tools.pdfSplitter.selectionTitle"]()}
        </Card.Title>
        <Card.Description>
          {file
            ? m["tools.pdfInfoViewer.supportedFormats"]()
            : m["tools.pdfSplitter.noFileDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="justify-center gap-4 py-4">
        <ToolFilePicker
          label={
            file
              ? m["tools.pdfInfoViewer.changeFile"]()
              : m["tools.pdfInfoViewer.dragDropOrClick"]()
          }
          accept={["application/pdf", ".pdf"]}
          description={m["tools.pdfInfoViewer.supportedFormats"]()}
          fileName={file?.name}
          clearLabel={m["shared.aesTools.clearfile"]()}
          isDisabled={isReading}
          onSelect={onSelect}
          onClear={file ? onRemove : undefined}
        />
        {file ? (
          <dl className="divide-y rounded-xl border border-border bg-default/30 px-3 text-sm">
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-muted">{m["tools.audioRecorder.size"]()}</dt>
              <dd className="font-medium">
                {formatFileSize(file.size, locale)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-muted">{m["shared.pdfEditing.pages"]()}</dt>
              <dd className="font-medium">
                {fileState?.info.pages.length ?? "-"}
              </dd>
            </div>
          </dl>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function SelectionCard({
  canGenerate,
  disabled,
  isGenerating,
  multipleMode,
  onGenerate,
  onMultipleModeChange,
  onOutputModeChange,
  onRangeChange,
  onSetSelection,
  outputMode,
  pageCount,
  rangeError,
  rangeId,
  rangeInput,
  selectedPages,
}: {
  canGenerate: boolean;
  disabled: boolean;
  isGenerating: boolean;
  multipleMode: MultipleMode;
  onGenerate: () => void;
  onMultipleModeChange: (value: MultipleMode) => void;
  onOutputModeChange: (value: OutputMode) => void;
  onRangeChange: (value: string) => void;
  onSetSelection: (pages: readonly number[]) => void;
  outputMode: OutputMode;
  pageCount: number;
  rangeError: string;
  rangeId: string;
  rangeInput: string;
  selectedPages: readonly number[];
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.pdfSplitter.selectionTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.pdfSplitter.selectionDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-5 py-5">
        <div className="grid gap-2">
          <Label htmlFor={rangeId}>{m["shared.pdfEditing.range"]()}</Label>
          <Input
            id={rangeId}
            className="min-h-11"
            autoComplete="off"
            disabled={disabled}
            aria-invalid={Boolean(rangeError)}
            placeholder={m["tools.pdfSplitter.rangePlaceholder"]()}
            value={rangeInput}
            onChange={(event) => onRangeChange(event.currentTarget.value)}
          />
          {rangeError ? (
            <p role="alert" className="text-sm text-danger">
              {rangeError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            isDisabled={disabled}
            onPress={() =>
              onSetSelection(
                Array.from({ length: pageCount }, (_, index) => index + 1),
              )
            }
          >
            {m["shared.pdfEditing.all"]()}
          </Button>
          <Button
            variant="outline"
            isDisabled={disabled}
            onPress={() =>
              onSetSelection(
                Array.from(
                  { length: pageCount },
                  (_, index) => index + 1,
                ).filter((page) => page % 2 === 1),
              )
            }
          >
            {m["shared.pdfEditing.odd"]()}
          </Button>
          <Button
            variant="outline"
            isDisabled={disabled}
            onPress={() =>
              onSetSelection(
                Array.from(
                  { length: pageCount },
                  (_, index) => index + 1,
                ).filter((page) => page % 2 === 0),
              )
            }
          >
            {m["shared.pdfEditing.even"]()}
          </Button>
          <Button
            variant="outline"
            isDisabled={disabled}
            onPress={() => onSetSelection([])}
          >
            {m["common.clear"]()}
          </Button>
        </div>

        <p
          role="status"
          aria-live="polite"
          className="rounded-xl bg-default/50 px-3 py-2 text-sm text-muted"
        >
          {m["tools.pdfSplitter.selectedSummary"]({
            pageCount,
            selectedCount: selectedPages.length,
          })}
        </p>

        <ToggleField
          disabled={disabled}
          label={m["tools.pdfSplitter.outputMode"]()}
          onChange={(value) => onOutputModeChange(value as OutputMode)}
          options={[
            ["single", m["shared.pdfEditing.single"]()],
            ["multiple", m["shared.pdfEditing.multiple"]()],
          ]}
          value={outputMode}
        />

        {outputMode === "multiple" ? (
          <ToggleField
            disabled={disabled}
            label={m["tools.pdfSplitter.splitStrategy"]()}
            onChange={(value) => onMultipleModeChange(value as MultipleMode)}
            options={[
              ["ranges", m["shared.pdfEditing.perrange"]()],
              ["pages", m["shared.pdfEditing.perpage"]()],
            ]}
            value={multipleMode}
          />
        ) : null}

        {!selectedPages.length ? (
          <Alert status="danger">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>
                {m["tools.pdfSplitter.emptySelectionTitle"]()}
              </Alert.Title>
              <Alert.Description>
                {m["tools.pdfSplitter.emptySelectionDescription"]()}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
      </ToolPanelCardContent>
      <ToolPanelCardFooter>
        <Button
          className="w-full"
          isDisabled={!canGenerate}
          onPress={onGenerate}
        >
          {isGenerating
            ? m["shared.bcryptTools.generatorGeneratingLabel"]()
            : m["tools.pdfSplitter.generate"]()}
        </Button>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function ToggleField({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  value: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <ToggleButtonGroup
        aria-label={label}
        className="grid grid-cols-2 [&_button]:min-h-11 [&_button]:whitespace-normal"
        isDisabled={disabled}
        selectionMode="single"
        selectedKeys={new Set([value])}
        onSelectionChange={(selection) => {
          const next = String([...selection][0] ?? "");
          if (next) onChange(next);
        }}
      >
        {options.map(([option, optionLabel]) => (
          <ToggleButton key={option} id={option}>
            {optionLabel}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}

function PageGrid({
  fileState,
  onTogglePage,
  selectedPages,
}: {
  fileState: FileState;
  onTogglePage: (page: number, useRange: boolean) => void;
  selectedPages: ReadonlySet<number>;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Card.Title>{m["tools.pdfSplitter.pageGridTitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.pdfSplitter.pageGridDescription"]()}
            </Card.Description>
          </div>
          <Chip variant="secondary">
            {m["tools.pdfSplitter.selectedSummary"]({
              pageCount: fileState.info.pages.length,
              selectedCount: selectedPages.size,
            })}
          </Chip>
        </div>
      </Card.Header>
      <ToolPanelCardContent className="py-5">
        <PdfPreviewDocument bytes={fileState.source.bytes}>
          <div className="grid max-h-none grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3 overflow-visible sm:max-h-168 sm:overflow-auto sm:pe-1">
            {fileState.info.pages.map(({ page, rotation }) => {
              const selected = selectedPages.has(page);
              const label = m["tools.pdfSplitter.pageTileLabel"]({ page });
              return (
                <Button
                  key={page}
                  type="button"
                  variant="ghost"
                  aria-label={label}
                  aria-pressed={selected}
                  className="group relative flex min-w-0 touch-manipulation flex-col rounded-xl p-1.5 text-start transition-colors hover:bg-default/50 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  onClick={(event) => onTogglePage(page, event.shiftKey)}
                >
                  <span
                    className={`relative flex aspect-3/4 w-full items-center justify-center overflow-hidden rounded-lg border bg-surface shadow-sm transition-colors ${selected ? "border-accent ring-2 ring-accent/20" : "border-border"}`}
                  >
                    <LazyPagePreview
                      label={label}
                      page={page}
                      rotation={rotation}
                      unavailable={m["tools.pdfSplitter.invalidPdf"]()}
                    />
                    <span className="absolute inset-s-2 top-2 rounded-md border border-border bg-surface/95 px-1.5 py-0.5 font-mono text-xs shadow-sm">
                      {page}
                    </span>
                    {selected ? (
                      <span className="absolute inset-e-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-accent-foreground shadow-sm">
                        <Check aria-hidden className="size-4" />
                      </span>
                    ) : null}
                  </span>
                </Button>
              );
            })}
          </div>
        </PdfPreviewDocument>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function LazyPagePreview({
  label,
  page,
  rotation,
  unavailable,
}: {
  label: string;
  page: number;
  rotation: number;
  unavailable: string;
}) {
  const container = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = container.current;
    if (!node || typeof IntersectionObserver !== "function") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={container} className="grid size-full place-items-center">
      {visible ? (
        <PdfPreview
          label={label}
          page={page}
          rotation={rotation}
          unavailable={unavailable}
        />
      ) : (
        <FileText aria-hidden className="size-10 text-muted" />
      )}
    </span>
  );
}

function ReadingCard() {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["shared.macIntegrity.result"]()}</Card.Title>
        <Card.Description>
          {m["tools.pdfSplitter.loadingDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="py-5">
        <div
          role="status"
          aria-label={m["tools.pdfInfoViewer.readingTitle"]()}
          className="grid min-h-44 content-center gap-4 rounded-xl border border-border bg-default/20 p-5"
        >
          <Skeleton className="h-5 w-40 rounded" />
          <Skeleton className="h-4 w-3/4 rounded" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
          <p className="sr-only">
            {m["tools.pdfSplitter.loadingDescription"]()}
          </p>
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultCard({
  isGenerating,
  result,
}: {
  isGenerating: boolean;
  result: ResultState | null;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Card.Title>{m["shared.macIntegrity.result"]()}</Card.Title>
            <Card.Description>
              {m["tools.pdfSplitter.resultsDescription"]()}
            </Card.Description>
          </div>
          {result ? (
            <Chip variant="secondary">
              {m["tools.pdfSplitter.resultFileCount"]({
                count: result.fileCount,
              })}
            </Chip>
          ) : null}
        </div>
      </Card.Header>
      <ToolPanelCardContent className="py-5" aria-live="polite">
        {result ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-default text-muted">
                <FileText aria-hidden className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">
                  {m["tools.pdfSplitter.resultReady"]()}
                </p>
                <p className="mt-1 text-sm break-all text-muted">
                  {result.fileName}
                </p>
              </div>
            </div>
            <a
              href={result.url}
              download={result.fileName}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none sm:w-auto"
            >
              <Download aria-hidden className="size-4" />
              {result.kind === "zip"
                ? m["common.downloadall"]()
                : m["shared.pdfEditing.download"]()}
            </a>
          </div>
        ) : isGenerating ? (
          <div
            role="status"
            aria-label={m["shared.bcryptTools.generatorGeneratingLabel"]()}
            className="grid min-h-44 content-center gap-4 rounded-xl border border-border bg-default/20 p-5"
          >
            <Skeleton className="h-5 w-40 rounded" />
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-11 w-36 rounded-xl" />
          </div>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ErrorAlert({ error }: { error: string }) {
  return (
    <Alert status="danger" role="alert">
      <Alert.Indicator>
        <TriangleAlert aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{m["tools.pdfInfoViewer.errorTitle"]()}</Alert.Title>
        <Alert.Description>{error}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function Article() {
  return (
    <ToolArticle>
      <h2>{m["tools.exifViewer.article.whatTitle"]()}</h2>
      {[m["tools.pdfSplitter.articleWhatParagraphs0"]()].map((paragraph) => (
        <p key={paragraph}>{inlineCode(paragraph)}</p>
      ))}
      <h2>{m["tools.exifViewer.article.useCasesTitle"]()}</h2>
      <ul>
        {[
          m["tools.pdfSplitter.articleUseCases0"](),
          m["tools.pdfSplitter.articleUseCases1"](),
          m["tools.pdfSplitter.articleUseCases2"](),
          m["tools.pdfSplitter.articleUseCases3"](),
        ].map((item) => (
          <li key={item}>{inlineCode(item)}</li>
        ))}
      </ul>
      <h2>{m["tools.pdfSplitter.articleRangesTitle"]()}</h2>
      {[
        m["tools.pdfSplitter.articleRangesParagraphs0"](),
        m["tools.pdfSplitter.articleRangesParagraphs1"](),
      ].map((paragraph) => (
        <p key={paragraph}>{inlineCode(paragraph)}</p>
      ))}
      <h2>{m["tools.exifViewer.article.privacyTitle"]()}</h2>
      {[m["tools.pdfSplitter.articlePrivacyParagraphs0"]()].map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <h2>{m["tools.pdfInfoViewer.article.limitationsTitle"]()}</h2>
      {[m["tools.pdfSplitter.articleLimitationsParagraphs0"]()].map(
        (paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ),
      )}
    </ToolArticle>
  );
}

function inlineCode(value: string): ReactNode[] {
  return value
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") ? (
        <code key={part}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

async function readPdfFile(
  file: File,
  signal: AbortSignal,
  readerRef: MutableRefObject<FileReader | null>,
) {
  signal.throwIfAborted();
  return new Promise<Uint8Array>((resolve, reject) => {
    const fileReader = new FileReader();
    readerRef.current = fileReader;
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      fileReader.onload = null;
      fileReader.onerror = null;
      fileReader.onabort = null;
      if (readerRef.current === fileReader) readerRef.current = null;
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => {
      if (fileReader.readyState === FileReader.LOADING) fileReader.abort();
      finish(() =>
        reject(signal.reason ?? new DOMException("Aborted", "AbortError")),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    fileReader.onload = () =>
      finish(() => resolve(new Uint8Array(fileReader.result as ArrayBuffer)));
    fileReader.onerror = () =>
      finish(() => reject(new PdfEditingError("read_failed")));
    fileReader.onabort = () =>
      finish(() => reject(new DOMException("Aborted", "AbortError")));
    try {
      fileReader.readAsArrayBuffer(file);
    } catch {
      finish(() => reject(new PdfEditingError("read_failed")));
    }
  });
}

function validatePageRange(
  input: string,
  pageCount: number,
): { issue: RangeIssue | null; pages: number[] } {
  if (pageCount < 1) return { issue: null, pages: [] };
  try {
    return { issue: null, pages: pageRanges(input, pageCount).pages };
  } catch (cause) {
    // An empty editor is an unselected state; generation remains disabled.
    if (cause instanceof PdfEditingError && cause.code === "empty_selection")
      return { issue: null, pages: [] };
    const issue: RangeIssue =
      cause instanceof PdfEditingError
        ? cause.code === "out_of_bounds"
          ? "out-of-bounds"
          : cause.code === "duplicate_page"
            ? "duplicate"
            : cause.reason === "descending"
              ? "descending"
              : "invalid"
        : "invalid";
    return { issue, pages: [] };
  }
}

function rangeIssueMessage(issue: RangeIssue) {
  if (issue === "out-of-bounds")
    return m["tools.pdfSplitter.rangeOutOfBounds"]();
  if (issue === "descending") return m["tools.pdfSplitter.rangeDescending"]();
  if (issue === "duplicate") return m["tools.pdfSplitter.rangeDuplicate"]();
  return m["tools.pdfSplitter.rangeInvalid"]();
}

function outputBaseName(filename: string, mode: OutputMode) {
  const safe = pdfFilename(filename, "split-result").replace(/\.pdf$/i, "");
  return `${safe}-${mode === "single" ? "selected" : "split"}`;
}

function pdfErrorMessage(cause: unknown, phase: "generate" | "read") {
  if (!(cause instanceof PdfEditingError))
    return phase === "read"
      ? m["tools.pdfSplitter.invalidPdf"]()
      : m["tools.pdfSplitter.splitFailed"]();
  if (cause.code === "encrypted_pdf")
    return m["tools.pdfSplitter.encryptedPdf"]();
  if (cause.code === "unsupported")
    return m["tools.pdfSplitter.workerUnsupported"]();
  if (cause.code === "read_failed" || cause.code === "invalid_pdf")
    return m["tools.pdfSplitter.invalidPdf"]();
  return m["tools.pdfSplitter.splitFailed"]();
}

function releaseOutputBytes(output?: PdfOutput) {
  if (!output) return;
  for (const file of output.files) file.bytes.fill(0);
  output.archive?.fill(0);
}

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export default function PdfSplitterPage() {
  return (
    <ToolPage>
      <PdfSplitterPageContent />
    </ToolPage>
  );
}
