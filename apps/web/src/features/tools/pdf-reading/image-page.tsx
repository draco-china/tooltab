import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Pagination,
  ProgressBar,
  Select,
  Skeleton,
  Slider,
} from "@heroui/react";
import {
  Download,
  FileArchive,
  FileImage,
  FileText,
  TriangleAlert,
} from "lucide-react";
import {
  type MutableRefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { MAX_PDF_INPUT, PdfEditingError } from "@workspace/tools/pdf/core";
import { formatFileSize } from "@/lib/file-size";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { getLocale } from "@/paraglide/runtime.js";
import type { ImageFile, ImageResult } from "./types";
import type { ReadingSource } from "@workspace/tools/pdf/reading";
import {
  type ImageFormat,
  type ImageOptions as Options,
  imageFormats,
  imageDefaults as DEFAULT_OPTIONS,
} from "@workspace/tools/pdf/rendering";
import { runReadingWorker } from "./worker-client";

type SourceState = { file: File; pageCount: number; source: ReadingSource };
type PageImage = {
  dpi: number;
  fileName: string;
  height: number;
  size: number;
  url: string;
  width: number;
};
type ZipResult = { fileName: string; url: string };

const DPI_PRESETS = [72, 96, 144, 200, 300, 600] as const;

function PdfToImageConverterPageContent() {
  const fieldId = useId();
  const [sourceState, setSourceState] = useState<SourceState | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [options, setOptions] = useState<Options>({ ...DEFAULT_OPTIONS });
  const [page, setPage] = useState(1);
  const [currentImage, setCurrentImage] = useState<PageImage | null>(null);
  const [zipResult, setZipResult] = useState<ZipResult | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const sourceRef = useRef<SourceState | null>(null);
  const readerRef = useRef<FileReader | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const renderController = useRef<AbortController | null>(null);
  const exportController = useRef<AbortController | null>(null);
  const loadRevision = useRef(0);
  const renderRevision = useRef(0);
  const exportRevision = useRef(0);
  const currentUrl = useRef("");
  const zipUrl = useRef("");

  useEffect(
    () => () => {
      cancelLoad(loadRevision, loadController, readerRef);
      cancelJob(renderRevision, renderController);
      cancelJob(exportRevision, exportController);
      sourceRef.current?.source.bytes.fill(0);
      sourceRef.current = null;
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      if (zipUrl.current) URL.revokeObjectURL(zipUrl.current);
      currentUrl.current = "";
      zipUrl.current = "";
    },
    [],
  );

  useEffect(() => {
    if (!sourceState) return;
    cancelJob(renderRevision, renderController);
    clearCurrentImage(currentUrl, setCurrentImage);
    const revision = renderRevision.current;
    const controller = new AbortController();
    renderController.current = controller;
    setIsRendering(true);
    setError("");
    let output: ImageResult | undefined;
    void (async () => {
      try {
        const result = await runReadingWorker(
          {
            kind: "image",
            source: sourceState.source,
            pages: String(page),
            ...options,
          },
          controller.signal,
        );
        if (result.kind !== "image") throw new PdfEditingError("invalid_pdf");
        output = result;
        if (revision !== renderRevision.current || controller.signal.aborted)
          return;
        const image = result.files[0];
        if (!image) throw new PdfEditingError("invalid_pdf");
        const blob = new Blob([new Uint8Array(image.bytes)], {
          type: imageMime(options.format),
        });
        const url = URL.createObjectURL(blob);
        currentUrl.current = url;
        setCurrentImage({
          dpi: result.dpi,
          fileName: pageImageName(
            sourceState.file.name,
            image.page,
            options.format,
          ),
          height: image.height,
          size: blob.size,
          url,
          width: image.width,
        });
      } catch (cause) {
        if (revision === renderRevision.current && !controller.signal.aborted)
          setError(errorMessage(cause, "render"));
      } finally {
        releaseImageResult(output);
        if (revision === renderRevision.current) {
          renderController.current = null;
          setIsRendering(false);
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [options, page, sourceState]);

  function clearZipResult() {
    if (zipUrl.current) URL.revokeObjectURL(zipUrl.current);
    zipUrl.current = "";
    setZipResult(null);
  }

  function releaseSource() {
    sourceRef.current?.source.bytes.fill(0);
    sourceRef.current = null;
    setSourceState(null);
    setPendingFile(null);
  }

  function clearFile() {
    cancelLoad(loadRevision, loadController, readerRef);
    cancelJob(renderRevision, renderController);
    cancelJob(exportRevision, exportController);
    clearCurrentImage(currentUrl, setCurrentImage);
    clearZipResult();
    releaseSource();
    setPage(1);
    setProgress(null);
    setIsLoadingDocument(false);
    setIsRendering(false);
    setIsExporting(false);
    setError("");
  }

  async function selectFile(file: File) {
    clearFile();
    if (!isPdf(file)) {
      setError(m["tools.pdfInfoViewer.unsupportedFile"]());
      return;
    }
    if (!file.size) {
      setError(m["tools.pdfToImageConverter.invalidPdfError"]());
      return;
    }
    if (file.size > MAX_PDF_INPUT) {
      setError(m["tools.pdfPageNumberAdder.statesTooLarge"]());
      return;
    }

    const revision = loadRevision.current;
    const controller = new AbortController();
    loadController.current = controller;
    setPendingFile(file);
    setIsLoadingDocument(true);
    let bytes: Uint8Array | undefined;
    let adopted = false;
    try {
      bytes = await readFile(file, controller.signal, readerRef);
      const result = await runReadingWorker(
        {
          kind: "info",
          source: {
            bytes,
            name: file.name,
            type: file.type,
            lastModified: file.lastModified,
          },
        },
        controller.signal,
      );
      if (revision !== loadRevision.current || controller.signal.aborted)
        return;
      if (result.kind === "info" && result.document.encrypted)
        throw new PdfEditingError("encrypted_pdf");
      const pageCount = result.kind === "info" ? result.document.pageCount : 0;
      if (!pageCount) throw new PdfEditingError("invalid_pdf");
      const next = {
        file,
        pageCount,
        source: {
          bytes,
          name: file.name,
          type: file.type,
          lastModified: file.lastModified,
        },
      };
      adopted = true;
      sourceRef.current = next;
      setSourceState(next);
      setPendingFile(null);
    } catch (cause) {
      if (revision === loadRevision.current && !controller.signal.aborted)
        setError(errorMessage(cause, "load"));
    } finally {
      if (!adopted) bytes?.fill(0);
      if (revision === loadRevision.current) {
        loadController.current = null;
        setPendingFile(null);
        setIsLoadingDocument(false);
      }
    }
  }

  function updatePage(value: number) {
    if (!sourceState) return;
    const next = clampInteger(value, page, 1, sourceState.pageCount);
    if (next === page) return;
    cancelJob(renderRevision, renderController);
    clearCurrentImage(currentUrl, setCurrentImage);
    setPage(next);
  }

  function updateOptions(next: Options) {
    cancelJob(renderRevision, renderController);
    cancelJob(exportRevision, exportController);
    clearCurrentImage(currentUrl, setCurrentImage);
    clearZipResult();
    setProgress(null);
    setIsRendering(false);
    setIsExporting(false);
    setError("");
    setOptions(normalizeOptions(next));
  }

  async function exportAllPages() {
    if (!sourceState || isRendering || isExporting) return;
    cancelJob(exportRevision, exportController);
    clearZipResult();
    const revision = exportRevision.current;
    const controller = new AbortController();
    exportController.current = controller;
    setIsExporting(true);
    setProgress([0, sourceState.pageCount]);
    setError("");
    let output: ImageResult | undefined;
    let singleArchive: Uint8Array | undefined;
    try {
      const result = await runReadingWorker(
        {
          kind: "image",
          source: sourceState.source,
          pages: "",
          ...options,
        },
        controller.signal,
        60000,
        (done, total) => {
          if (revision === exportRevision.current) setProgress([done, total]);
        },
      );
      if (result.kind !== "image") throw new PdfEditingError("invalid_pdf");
      output = result;
      if (revision !== exportRevision.current || controller.signal.aborted)
        return;
      let archive = result.archive;
      if (!archive) {
        const image = result.files[0];
        if (!image) throw new PdfEditingError("invalid_pdf");
        singleArchive = await createSingleImageArchive(
          image,
          pageImageName(sourceState.file.name, image.page, options.format),
          controller.signal,
        );
        archive = singleArchive;
      }
      if (revision !== exportRevision.current || controller.signal.aborted)
        return;
      const blob = new Blob([new Uint8Array(archive)], {
        type: "application/zip",
      });
      const url = URL.createObjectURL(blob);
      zipUrl.current = url;
      setZipResult({
        fileName: zipFileName(
          sourceState.file.name,
          options.dpi,
          options.format,
        ),
        url,
      });
    } catch (cause) {
      if (revision === exportRevision.current && !controller.signal.aborted)
        setError(errorMessage(cause, "export"));
    } finally {
      singleArchive?.fill(0);
      releaseImageResult(output);
      if (revision === exportRevision.current) {
        exportController.current = null;
        setProgress(null);
        setIsExporting(false);
      }
    }
  }

  const activeFile = pendingFile ?? sourceState?.file ?? null;
  return (
    <>
      <div className="grid gap-6" data-tool="pdf-to-image-converter">
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-6 xl:sticky xl:top-6">
            <UploadCard
              file={activeFile}
              isLoading={isLoadingDocument}
              pageCount={sourceState?.pageCount ?? 0}
              onClear={clearFile}
              onSelect={(file) => void selectFile(file)}
            />
            <SettingsCard
              currentImage={currentImage}
              disabled={!sourceState || isLoadingDocument || isRendering}
              fieldId={fieldId}
              isExporting={isExporting}
              onExport={() => void exportAllPages()}
              onOptionsChange={updateOptions}
              options={options}
              pageCount={sourceState?.pageCount ?? 0}
              progress={progress}
              zipResult={zipResult}
            />
          </div>

          <PreviewCard
            currentImage={currentImage}
            isLoadingDocument={isLoadingDocument}
            isRendering={isRendering}
            onPageChange={updatePage}
            page={page}
            pageCount={sourceState?.pageCount ?? 0}
          />
        </div>

        {error ? <ErrorAlert error={error} /> : null}
      </div>

      <ToolArticle className="mt-10">
        <h2>{m["tools.pdfToImageConverter.article.whatTitle"]()}</h2>
        <p>{m["tools.pdfToImageConverter.article.what"]()}</p>
        <h2>{m["tools.dockerRunToComposeConverter.article.whenTitle"]()}</h2>
        <p>{m["tools.pdfToImageConverter.article.when"]()}</p>
        <h2>{m["tools.pdfToImageConverter.article.tipsTitle"]()}</h2>
        <p>{m["tools.pdfToImageConverter.article.tips"]()}</p>
        <h2>{m["tools.pdfToImageConverter.article.privacyTitle"]()}</h2>
        <p>{m["tools.pdfToImageConverter.article.privacy"]()}</p>
      </ToolArticle>
    </>
  );
}

function UploadCard({
  file,
  isLoading,
  onClear,
  onSelect,
  pageCount,
}: {
  file: File | null;
  isLoading: boolean;
  onClear: () => void;
  onSelect: (file: File) => void;
  pageCount: number;
}) {
  const locale = getLocale();
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.pdfPageNumberAdder.uploadTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.pdfToImageConverter.uploadDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        <ToolFilePicker
          accept={["application/pdf", ".pdf"]}
          clearLabel={m["tools.pdfToImageConverter.removePdfLabel"]()}
          description={m["tools.pdfInfoViewer.supportedFormats"]()}
          fileName={file?.name}
          isDisabled={isLoading}
          label={
            file
              ? m["tools.pdfPageOrganizer.changePdfLabel"]()
              : m["tools.pdfPageOrganizer.addPdfLabel"]()
          }
          onClear={onClear}
          onSelect={onSelect}
        />
        {isLoading ? (
          <FileSkeleton
            label={m["tools.pdfToImageConverter.loadingDocumentLabel"]()}
          />
        ) : file ? (
          <div className="grid gap-3 rounded-xl border border-border bg-surface p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-default text-muted">
                <FileText aria-hidden className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-medium">
                  {m["tools.pdfInfoViewer.selectedPdf"]()}
                </h3>
                <p className="mt-1 text-sm break-all text-muted">{file.name}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip variant="secondary">
                {m["tools.audioRecorder.size"]()}:{" "}
                {formatFileSize(file.size, locale)}
              </Chip>
              {pageCount ? (
                <Chip variant="tertiary">
                  {m["shared.pdfEditing.pages"]()}: {pageCount}
                </Chip>
              ) : null}
            </div>
          </div>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function SettingsCard({
  currentImage,
  disabled,
  fieldId,
  isExporting,
  onExport,
  onOptionsChange,
  options,
  pageCount,
  progress,
  zipResult,
}: {
  currentImage: PageImage | null;
  disabled: boolean;
  fieldId: string;
  isExporting: boolean;
  onExport: () => void;
  onOptionsChange: (options: Options) => void;
  options: Options;
  pageCount: number;
  progress: [number, number] | null;
  zipResult: ZipResult | null;
}) {
  const lossy = options.format !== "png";
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.pdfToImageConverter.settingsTitle"]()}
        </Card.Title>
        <Card.Description>
          {m["tools.pdfToImageConverter.settingsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-5 py-4">
        <Select
          variant="secondary"
          selectedKey={options.format}
          isDisabled={disabled || isExporting}
          onSelectionChange={(value) => {
            if (imageFormats.includes(value as ImageFormat))
              onOptionsChange({ ...options, format: value as ImageFormat });
          }}
        >
          <Label>{m["tools.svgToImage.format"]()}</Label>
          <Select.Trigger className="min-h-11 w-full">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item
                id="png"
                textValue={m[
                  "tools.codeScreenshotGenerator.downloadPngLabel"
                ]()}
              >
                {m["tools.codeScreenshotGenerator.downloadPngLabel"]()}
              </ListBox.Item>
              <ListBox.Item
                id="jpeg"
                textValue={m["tools.pdfToImageConverter.jpegFormat"]()}
              >
                {m["tools.pdfToImageConverter.jpegFormat"]()}
              </ListBox.Item>
              <ListBox.Item
                id="webp"
                textValue={m[
                  "tools.codeScreenshotGenerator.downloadWebpLabel"
                ]()}
              >
                {m["tools.codeScreenshotGenerator.downloadWebpLabel"]()}
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>

        <div className="grid gap-2">
          <Label htmlFor={`${fieldId}-dpi`}>
            {m["tools.pdfToImageConverter.dpiLabel"]()}
          </Label>
          <Input
            id={`${fieldId}-dpi`}
            className="min-h-11"
            autoComplete="off"
            type="number"
            inputMode="numeric"
            min={72}
            max={600}
            step={1}
            disabled={disabled || isExporting}
            value={String(options.dpi)}
            onChange={(event) =>
              onOptionsChange({
                ...options,
                dpi: clampInteger(
                  Number(event.currentTarget.value),
                  options.dpi,
                  72,
                  600,
                ),
              })
            }
          />
          <p className="text-xs leading-5 text-muted">
            {m["tools.pdfToImageConverter.dpiDescription"]()}
          </p>
          <fieldset
            aria-label={m["tools.pdfToImageConverter.dpiPresetLabel"]()}
            className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-3"
          >
            {DPI_PRESETS.map((dpi) => (
              <Button
                key={dpi}
                size="sm"
                variant={options.dpi === dpi ? "primary" : "outline"}
                aria-pressed={options.dpi === dpi}
                isDisabled={disabled || isExporting}
                onPress={() => onOptionsChange({ ...options, dpi })}
              >
                {dpi}
              </Button>
            ))}
          </fieldset>
        </div>

        <div className="grid gap-3" data-disabled={!lossy || undefined}>
          <div className="flex items-center justify-between gap-3">
            <Label>{m["common.formatquality"]()}</Label>
            <span className="text-sm text-muted">
              {Math.round(options.quality * 100)}%
            </span>
          </div>
          <Slider
            aria-label={m["common.formatquality"]()}
            className="min-h-11"
            isDisabled={disabled || isExporting || !lossy}
            minValue={0.1}
            maxValue={1}
            step={0.01}
            value={options.quality}
            onChange={(value) =>
              onOptionsChange({ ...options, quality: Number(value) })
            }
          >
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
          <p className="text-xs leading-5 text-muted">
            {m["tools.pdfToImageConverter.qualityDescription"]()}
          </p>
        </div>
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="grid gap-3">
        <ToolPanelActionGroup>
          {currentImage && !isExporting ? (
            <a
              href={currentImage.url}
              download={currentImage.fileName}
              className={buttonVariants({ variant: "outline" })}
            >
              <Download aria-hidden className="size-4" />
              {m["tools.pdfToImageConverter.downloadCurrentLabel"]()}
            </a>
          ) : (
            <Button variant="outline" isDisabled>
              <Download aria-hidden className="size-4" />
              {m["tools.pdfToImageConverter.downloadCurrentLabel"]()}
            </Button>
          )}
          <Button
            isDisabled={!pageCount || disabled || isExporting}
            onPress={onExport}
          >
            <FileArchive aria-hidden className="size-4" />
            {isExporting
              ? m["tools.pdfToImageConverter.exportingAllLabel"]()
              : m["tools.pdfToImageConverter.exportAllLabel"]()}
          </Button>
        </ToolPanelActionGroup>
        {progress ? (
          <div className="grid gap-2">
            <p className="text-sm text-muted">
              {m["tools.pdfToImageConverter.exportProgressLabel"]()}:{" "}
              {progress[0]} / {progress[1]}
            </p>
            <ProgressBar
              aria-label={m["tools.pdfToImageConverter.exportProgressLabel"]()}
              value={progress[1] ? (progress[0] / progress[1]) * 100 : 0}
            >
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          </div>
        ) : null}
        {zipResult ? (
          <a
            href={zipResult.url}
            download={zipResult.fileName}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-default px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-default/80 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          >
            <Download aria-hidden className="size-4" />
            {m["common.downloadall"]()}
          </a>
        ) : null}
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function PreviewCard({
  currentImage,
  isLoadingDocument,
  isRendering,
  onPageChange,
  page,
  pageCount,
}: {
  currentImage: PageImage | null;
  isLoadingDocument: boolean;
  isRendering: boolean;
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
}) {
  const locale = getLocale();
  const hasDocument = pageCount > 0;
  const summary = m["tools.pdfToImageConverter.pageSummary"]({
    page: String(page),
    total: String(Math.max(1, pageCount)),
  });
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["common.archivepreview"]()}</Card.Title>
        <Card.Description>
          {m["tools.pdfToImageConverter.previewDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="min-h-112 gap-4 py-4">
        <div className="flex min-h-96 flex-1 items-center justify-center rounded-xl border border-border bg-default/30 p-3">
          {isLoadingDocument || (hasDocument && isRendering) ? (
            <PreviewSkeleton />
          ) : currentImage ? (
            <img
              src={currentImage.url}
              alt={m["tools.pdfToImageConverter.previewAlt"]({
                page: String(page),
              })}
              className="max-h-[70vh] max-w-full rounded-lg bg-white object-contain shadow-sm"
            />
          ) : (
            <EmptyPreview />
          )}
        </div>
        <div className="grid justify-items-center gap-2">
          {currentImage ? (
            <p className="text-sm text-muted">
              {m["tools.pdfToImageConverter.imageDetails"]({
                dpi: String(currentImage.dpi),
                height: String(currentImage.height),
                size: formatFileSize(currentImage.size, locale),
                width: String(currentImage.width),
              })}
            </p>
          ) : null}
          <Pagination
            aria-label={m["tools.pdfToImageConverter.pageLabel"]()}
            className="justify-center"
            size="sm"
          >
            <Pagination.Content className="flex-wrap justify-center">
              <Pagination.Item>
                <Pagination.Previous
                  aria-label={`${m["tools.pdfToImageConverter.pageLabel"]()} ${Math.max(1, page - 1)}`}
                  isDisabled={!hasDocument || page <= 1 || isRendering}
                  onPress={() => onPageChange(page - 1)}
                >
                  <Pagination.PreviousIcon />
                </Pagination.Previous>
              </Pagination.Item>
              <Pagination.Item>
                <Input
                  className="min-h-9 w-20"
                  aria-label={m["tools.pdfToImageConverter.pageInputLabel"]()}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.max(1, pageCount)}
                  step={1}
                  disabled={!hasDocument || isRendering}
                  value={String(page)}
                  onChange={(event) =>
                    onPageChange(Number(event.currentTarget.value))
                  }
                />
              </Pagination.Item>
              <Pagination.Item>
                <Pagination.Summary>{summary}</Pagination.Summary>
              </Pagination.Item>
              <Pagination.Item>
                <Pagination.Next
                  aria-label={`${m["tools.pdfToImageConverter.pageLabel"]()} ${Math.min(
                    Math.max(1, pageCount),
                    page + 1,
                  )}`}
                  isDisabled={!hasDocument || page >= pageCount || isRendering}
                  onPress={() => onPageChange(page + 1)}
                >
                  <Pagination.NextIcon />
                </Pagination.Next>
              </Pagination.Item>
            </Pagination.Content>
          </Pagination>
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function FileSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-3 w-2/3 rounded" />
        </div>
      </div>
      <Skeleton className="h-7 w-32 rounded-full" />
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div
      role="status"
      aria-label={m["tools.markdownPreviewer.localProcessingLabel"]()}
      className="grid w-full max-w-lg gap-4"
    >
      <Skeleton className="mx-auto aspect-3/4 w-full max-w-sm rounded-lg" />
      <div className="grid gap-2 text-center">
        <p className="font-medium">
          {m["tools.markdownPreviewer.localProcessingLabel"]()}
        </p>
        <p className="text-sm text-muted">
          {m["tools.pdfToImageConverter.renderingPreviewDescription"]()}
        </p>
      </div>
    </div>
  );
}

function EmptyPreview() {
  return (
    <div className="grid max-w-md place-items-center gap-3 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-default text-muted">
        <FileImage aria-hidden className="size-5" />
      </span>
      <h3 className="font-medium">{m["tools.pdfInfoViewer.noFileTitle"]()}</h3>
      <p className="text-sm text-muted">
        {m["tools.pdfToImageConverter.emptyPreviewDescription"]()}
      </p>
    </div>
  );
}

function ErrorAlert({ error }: { error: string }) {
  return (
    <Alert status="danger" role="alert">
      <Alert.Indicator>
        <TriangleAlert aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{m["tools.pdfToImageConverter.errorTitle"]()}</Alert.Title>
        <Alert.Description>{error}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

async function readFile(
  file: File,
  signal: AbortSignal,
  readerRef: MutableRefObject<FileReader | null>,
) {
  signal.throwIfAborted();
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    readerRef.current = reader;
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      if (readerRef.current === reader) readerRef.current = null;
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
      finish(() =>
        reject(signal.reason ?? new DOMException("Aborted", "AbortError")),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    reader.onload = () =>
      finish(() => {
        if (!(reader.result instanceof ArrayBuffer)) {
          reject(new PdfEditingError("read_failed"));
          return;
        }
        resolve(new Uint8Array(reader.result));
      });
    reader.onerror = () =>
      finish(() => reject(new PdfEditingError("read_failed")));
    reader.onabort = () =>
      finish(() => reject(new DOMException("Aborted", "AbortError")));
    try {
      reader.readAsArrayBuffer(file);
    } catch {
      finish(() => reject(new PdfEditingError("read_failed")));
    }
  });
}

function createSingleImageArchive(
  file: ImageFile,
  name: string,
  signal: AbortSignal,
  timeoutMs = 60000,
) {
  signal.throwIfAborted();
  if (typeof Worker !== "function")
    return Promise.reject(new PdfEditingError("unsupported"));
  return new Promise<Uint8Array>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./zip-worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      reject(new PdfEditingError("unsupported"));
      return;
    }
    const close = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    const abort = () => {
      close();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      close();
      reject(new PdfEditingError("timeout"));
    }, timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      event.preventDefault();
      close();
      reject(new PdfEditingError("invalid_pdf"));
    };
    worker.onmessage = (event) => {
      close();
      const returned = event.data.files?.[0]?.bytes as Uint8Array | undefined;
      const archive = event.data.archive as Uint8Array | undefined;
      returned?.fill(0);
      if (event.data.error || !archive)
        reject(new PdfEditingError("too_large"));
      else resolve(archive);
    };
    let bytes: Uint8Array | undefined;
    try {
      bytes = new Uint8Array(file.bytes);
      worker.postMessage([{ ...file, bytes, name }], [bytes.buffer]);
    } catch {
      bytes?.fill(0);
      close();
      reject(new PdfEditingError("too_large"));
    }
  });
}

function cancelLoad(
  revision: MutableRefObject<number>,
  controller: MutableRefObject<AbortController | null>,
  reader: MutableRefObject<FileReader | null>,
) {
  revision.current += 1;
  controller.current?.abort();
  controller.current = null;
  if (reader.current?.readyState === FileReader.LOADING) reader.current.abort();
  reader.current = null;
}

function cancelJob(
  revision: MutableRefObject<number>,
  controller: MutableRefObject<AbortController | null>,
) {
  revision.current += 1;
  controller.current?.abort();
  controller.current = null;
}

function clearCurrentImage(
  url: MutableRefObject<string>,
  setImage: (value: PageImage | null) => void,
) {
  if (url.current) URL.revokeObjectURL(url.current);
  url.current = "";
  setImage(null);
}

function releaseImageResult(result?: ImageResult) {
  if (!result) return;
  for (const file of result.files) file.bytes.fill(0);
  result.archive?.fill(0);
}

function errorMessage(cause: unknown, phase: "export" | "load" | "render") {
  if (cause instanceof PdfEditingError) {
    if (cause.code === "too_large")
      return m["tools.pdfPageNumberAdder.statesTooLarge"]();
    if (cause.code === "timeout")
      return m["tools.pdfToImageConverter.statesTimeoutError"]();
    if (cause.code === "unsupported")
      return m["tools.pdfToImageConverter.canvasUnavailableError"]();
    if (cause.code === "invalid_pdf" || cause.code === "read_failed")
      return m["tools.pdfToImageConverter.invalidPdfError"]();
    if (cause.code === "encrypted_pdf")
      return m["tools.pdfToImageConverter.loadFailedError"]();
  }
  if (phase === "load") return m["tools.pdfToImageConverter.loadFailedError"]();
  if (phase === "render")
    return m["tools.pdfToImageConverter.renderFailedError"]();
  return m["tools.pdfToImageConverter.exportFailedError"]();
}

function normalizeOptions(options: Options): Options {
  const format = imageFormats.includes(options.format)
    ? options.format
    : DEFAULT_OPTIONS.format;
  return {
    dpi: clampInteger(options.dpi, DEFAULT_OPTIONS.dpi, 72, 600),
    format,
    quality:
      format === "png"
        ? DEFAULT_OPTIONS.quality
        : Math.min(1, Math.max(0.1, options.quality)),
  };
}

function clampInteger(
  value: number,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function pageImageName(name: string, page: number, format: ImageFormat) {
  return `${baseName(name)}-p${Math.max(1, Math.round(page))}.${
    format === "jpeg" ? "jpg" : format
  }`;
}

function zipFileName(name: string, dpi: number, format: ImageFormat) {
  return `${baseName(name)}-${dpi}dpi-${format}-images.zip`;
}

function baseName(name: string) {
  const value = name.trim().replace(/\.pdf$/iu, "") || "document";
  return [...value].slice(0, 140).join("");
}

function imageMime(format: ImageFormat) {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

function isPdf(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export default function PdfToImageConverterPage() {
  return (
    <ToolPage>
      <PdfToImageConverterPageContent />
    </ToolPage>
  );
}
