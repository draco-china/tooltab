import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  Skeleton,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  type MutableRefObject,
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
} from "@workspace/tools/pdf/core";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { formatFileSize } from "@/lib/file-size";
import { getLocale } from "@/paraglide/runtime.js";
import type {
  PdfInfo,
  PdfOutput,
  PdfSource,
} from "@workspace/tools/pdf/editing";
import { numberPlacement } from "@workspace/tools/pdf/numbering";
import { PdfPreview, PdfPreviewDocument } from "../pdf-editing/preview";
import {
  NUMBER_POSITIONS,
  type NumberOptions,
  numberDefaults,
} from "@workspace/tools/pdf/numbering";
import { runPdfWorker } from "../pdf-editing/worker-client";

type FileState = { file: File; source: PdfSource; info: PdfInfo };
type ResultState = {
  fileName: string;
  pageCount: number;
  size: number;
  url: string;
};
type RangeIssue =
  | "descending"
  | "duplicate"
  | "invalid"
  | "out-of-bounds"
  | "too-large";

const POSITION_LABELS = [
  m["shared.pdfEditing.topleft"],
  m["shared.pdfEditing.topcenter"],
  m["shared.pdfEditing.topright"],
  m["shared.pdfEditing.bottomleft"],
  m["shared.pdfEditing.bottomcenter"],
  m["shared.pdfEditing.bottomright"],
] as const;

function PdfPageNumberAdderPageContent() {
  const fieldId = useId();
  const [fileState, setFileState] = useState<FileState | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [options, setOptions] = useState<NumberOptions>({ ...numberDefaults });
  const [rangeInput, setRangeInput] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResultState | null>(null);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const reader = useRef<FileReader | null>(null);
  const source = useRef<FileState | null>(null);
  const resultUrl = useRef("");

  const pageCount = fileState?.info.pages.length ?? 0;
  const rangeValidation = useMemo(
    () => validatePageRange(rangeInput, pageCount),
    [pageCount, rangeInput],
  );
  const selectedPages = rangeValidation.pages;
  const rangeError = rangeValidation.issue
    ? rangeIssueMessage(rangeValidation.issue)
    : "";
  const previewPages = selectedPages.length
    ? selectedPages
    : pageCount
      ? [1]
      : [];
  const previewOptions = useMemo(
    () => ({
      ...options,
      pages: rangeValidation.issue ? "" : rangeInput,
    }),
    [options, rangeInput, rangeValidation.issue],
  );
  const currentPreviewIndex = Math.min(
    previewIndex,
    Math.max(0, previewPages.length - 1),
  );
  const previewPage = previewPages[currentPreviewIndex] ?? 1;

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
      reader.current?.abort();
      source.current?.source.bytes.fill(0);
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
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

  function invalidateResult() {
    revision.current += 1;
    controller.current?.abort();
    controller.current = null;
    setIsReading(false);
    setIsGenerating(false);
    setError("");
    clearResult();
  }

  function releaseSource() {
    source.current?.source.bytes.fill(0);
    source.current = null;
    setFileState(null);
    setPendingFile(null);
  }

  function removeFile() {
    invalidateResult();
    releaseSource();
    setRangeInput("");
    setPreviewIndex(0);
  }

  async function selectFile(file: File) {
    invalidateResult();
    releaseSource();
    setRangeInput("");
    setPreviewIndex(0);
    if (!isPdf(file)) {
      setError(m["tools.pdfInfoViewer.unsupportedFile"]());
      return;
    }
    if (file.size > MAX_PDF_INPUT) {
      setError(m["tools.pdfPageNumberAdder.statesTooLarge"]());
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
      const inspection = await runPdfWorker(
        { kind: "inspect", source: { name: file.name, bytes } },
        currentController.signal,
      );
      if (
        currentRevision !== revision.current ||
        currentController.signal.aborted
      ) {
        return;
      }
      if (inspection.kind !== "info") throw new PdfEditingError("invalid_pdf");
      const next = {
        file,
        source: { name: file.name, bytes },
        info: inspection,
      };
      adopted = true;
      source.current = next;
      setFileState(next);
      setPendingFile(null);
    } catch (cause) {
      if (
        currentRevision === revision.current &&
        !currentController.signal.aborted
      ) {
        setError(pdfErrorMessage(cause, "read"));
      }
    } finally {
      if (!adopted) bytes?.fill(0);
      if (currentRevision === revision.current) {
        controller.current = null;
        setPendingFile(null);
        setIsReading(false);
      }
    }
  }

  function updateOption<Key extends keyof NumberOptions>(
    key: Key,
    value: NumberOptions[Key],
  ) {
    invalidateResult();
    setOptions((current) => ({ ...current, [key]: value }));
  }

  async function generatePdf() {
    if (!fileState) {
      setError(m["tools.pdfPageNumberAdder.noFileError"]());
      return;
    }
    if (rangeValidation.issue) {
      setError(rangeIssueMessage(rangeValidation.issue));
      return;
    }

    invalidateResult();
    const currentRevision = revision.current;
    const currentController = new AbortController();
    controller.current = currentController;
    setIsGenerating(true);
    let output: PdfOutput | undefined;
    try {
      const response = await runPdfWorker(
        {
          kind: "number",
          source: fileState.source,
          options: { ...options, pages: rangeInput },
          filename: numberedFileName(fileState.file.name),
        },
        currentController.signal,
      );
      if (response.kind !== "output") throw new PdfEditingError("invalid_pdf");
      output = response;
      if (
        currentRevision !== revision.current ||
        currentController.signal.aborted
      ) {
        return;
      }
      const file = output.files[0];
      if (!file) throw new PdfEditingError("invalid_pdf");
      const blob = new Blob([new Uint8Array(file.bytes)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      resultUrl.current = url;
      setResult({
        fileName: file.name,
        pageCount: selectedPages.length,
        size: blob.size,
        url,
      });
    } catch (cause) {
      if (
        currentRevision === revision.current &&
        !currentController.signal.aborted
      ) {
        setError(pdfErrorMessage(cause, "generate"));
      }
    } finally {
      releaseOutputBytes(output);
      if (currentRevision === revision.current) {
        controller.current = null;
        setIsGenerating(false);
      }
    }
  }

  const activeFile = pendingFile ?? fileState?.file ?? null;
  const canGenerate =
    Boolean(fileState) && !isReading && !isGenerating && !rangeError;

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool="pdf-page-number-adder">
        <UploadCard
          file={activeFile}
          fileState={fileState}
          isReading={isReading}
          onRemove={removeFile}
          onSelect={(file) => void selectFile(file)}
        />

        <div className="grid items-start gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <SettingsCard
            canGenerate={canGenerate}
            disabled={!fileState || isReading || isGenerating}
            fieldId={fieldId}
            isGenerating={isGenerating}
            onGenerate={() => void generatePdf()}
            onRangeChange={(value) => {
              invalidateResult();
              setRangeInput(value);
              setPreviewIndex(0);
            }}
            onUpdate={updateOption}
            options={options}
            rangeError={rangeError}
            rangeInput={rangeInput}
          />

          <div className="grid min-w-0 gap-6">
            <PreviewCard
              fileState={fileState}
              options={previewOptions}
              pageCount={pageCount}
              previewIndex={currentPreviewIndex}
              previewPage={previewPage}
              previewPages={previewPages}
              selectedPageCount={selectedPages.length}
              setPreviewIndex={setPreviewIndex}
            />
            <ResultCard isGenerating={isGenerating} result={result} />
          </div>
        </div>

        {error ? <ErrorAlert error={error} /> : null}
      </div>

      <ToolArticle>
        <h2>{m["tools.exifViewer.article.whatTitle"]()}</h2>
        <p>
          {
            m["tools.pdfPageNumberAdder.articleWhatBody"]().split(
              "1-3,5,8-10",
            )[0]
          }
          <code>1-3,5,8-10</code>
          {
            m["tools.pdfPageNumberAdder.articleWhatBody"]().split(
              "1-3,5,8-10",
            )[1]
          }
        </p>
        <h2>{m["tools.exifViewer.article.useCasesTitle"]()}</h2>
        <ul>
          {[
            m["tools.pdfPageNumberAdder.articleUseCases0"](),
            m["tools.pdfPageNumberAdder.articleUseCases1"](),
            m["tools.pdfPageNumberAdder.articleUseCases2"](),
            m["tools.pdfPageNumberAdder.articleUseCases3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.exifViewer.article.privacyTitle"]()}</h2>
        <p>{m["tools.pdfPageNumberAdder.articlePrivacyBody"]()}</p>
        <h2>{m["tools.pdfInfoViewer.article.limitationsTitle"]()}</h2>
        <p>{m["tools.pdfPageNumberAdder.articleLimitationsBody"]()}</p>
      </ToolArticle>
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
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.pdfPageNumberAdder.uploadTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.pdfPageNumberAdder.uploadDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
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
          onClear={onRemove}
        />
        {isReading ? (
          <ReadingSkeleton />
        ) : fileState ? (
          <div className="grid gap-3 rounded-xl border border-border bg-surface p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-default text-muted">
                <FileText aria-hidden className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-medium">
                  {m["tools.pdfInfoViewer.selectedPdf"]()}
                </h3>
                <p className="mt-1 text-sm break-all text-muted">
                  {fileState.file.name}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip variant="secondary">
                {m["shared.pdfEditing.pages"]()}: {fileState.info.pages.length}
              </Chip>
              <Chip variant="tertiary">
                {m["tools.audioRecorder.size"]()}:{" "}
                {formatFileSize(fileState.file.size, locale)}
              </Chip>
            </div>
          </div>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function SettingsCard({
  canGenerate,
  disabled,
  fieldId,
  isGenerating,
  onGenerate,
  onRangeChange,
  onUpdate,
  options,
  rangeError,
  rangeInput,
}: {
  canGenerate: boolean;
  disabled: boolean;
  fieldId: string;
  isGenerating: boolean;
  onGenerate: () => void;
  onRangeChange: (value: string) => void;
  onUpdate: <Key extends keyof NumberOptions>(
    key: Key,
    value: NumberOptions[Key],
  ) => void;
  options: NumberOptions;
  rangeError: string;
  rangeInput: string;
}) {
  return (
    <ToolPanelCard className="xl:sticky xl:top-6">
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.pdfPageNumberAdder.settingsTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.pdfPageNumberAdder.settingsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-5 py-4">
        <div className="grid gap-2">
          <Label htmlFor={`${fieldId}-range`}>
            {m["tools.pdfPageNumberAdder.pageRangeLabel"]()}
          </Label>
          <p className="text-xs leading-5 text-muted">
            {m["tools.pdfPageNumberAdder.pageRangeDescription"]()}
          </p>
          <Input
            id={`${fieldId}-range`}
            className="min-h-11"
            autoComplete="off"
            disabled={disabled}
            aria-invalid={Boolean(rangeError)}
            placeholder={m["tools.pdfPageNumberAdder.pageRangePlaceholder"]()}
            value={rangeInput}
            onChange={(event) => onRangeChange(event.currentTarget.value)}
          />
          {rangeError ? (
            <p role="alert" className="text-sm text-danger">
              {rangeError}
            </p>
          ) : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${fieldId}-start`}>
              {m["shared.pdfEditing.start"]()}
            </Label>
            <Input
              id={`${fieldId}-start`}
              className="min-h-11"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={1}
              max={999999}
              disabled={disabled}
              value={String(options.startNumber)}
              onChange={(event) =>
                onUpdate(
                  "startNumber",
                  clampInteger(
                    Number(event.currentTarget.value),
                    options.startNumber,
                    1,
                    999999,
                  ),
                )
              }
            />
          </div>
          <ToggleField
            label={m["common.archiveformat"]()}
            value={options.format}
            disabled={disabled}
            options={[
              ["number", m["shared.pdfEditing.onlynumber"]()],
              [
                "number-total",
                m["tools.pdfPageNumberAdder.numberTotalFormat"](),
              ],
            ]}
            onChange={(value) =>
              onUpdate("format", value as NumberOptions["format"])
            }
          />
        </div>

        <PositionField
          disabled={disabled}
          value={options.position}
          onChange={(value) => onUpdate("position", value)}
        />

        <ToggleField
          label={m["shared.pdfEditing.font"]()}
          value={options.fontFamily}
          disabled={disabled}
          options={[
            ["serif", m["tools.pdfPageNumberAdder.serifFont"]()],
            ["sans-serif", m["tools.pdfPageNumberAdder.sansSerifFont"]()],
          ]}
          onChange={(value) =>
            onUpdate("fontFamily", value as NumberOptions["fontFamily"])
          }
        />

        <NumberSlider
          id={`${fieldId}-font-size`}
          label={m["tools.codeScreenshotGenerator.fontSizeLabel"]()}
          description={m["tools.pdfPageNumberAdder.fontSizeDescription"]()}
          disabled={disabled}
          minimum={6}
          maximum={72}
          value={options.fontSize}
          onChange={(value) => onUpdate("fontSize", value)}
        />
        <NumberSlider
          id={`${fieldId}-margin-x`}
          label={m["tools.pdfPageNumberAdder.horizontalMarginLabel"]()}
          description={m["tools.pdfPageNumberAdder.marginDescription"]()}
          disabled={disabled}
          minimum={0}
          maximum={144}
          value={options.marginX}
          onChange={(value) => onUpdate("marginX", value)}
        />
        <NumberSlider
          id={`${fieldId}-margin-y`}
          label={m["tools.pdfPageNumberAdder.verticalMarginLabel"]()}
          description={m["tools.pdfPageNumberAdder.marginDescription"]()}
          disabled={disabled}
          minimum={0}
          maximum={144}
          value={options.marginY}
          onChange={(value) => onUpdate("marginY", value)}
        />
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="justify-end">
        <Button isDisabled={!canGenerate} onPress={onGenerate}>
          <Sparkles aria-hidden className="size-4" />
          {isGenerating
            ? m["shared.bcryptTools.generatorGeneratingLabel"]()
            : m["tools.pdfPageNumberAdder.generateLabel"]()}
        </Button>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function PreviewCard({
  fileState,
  options,
  pageCount,
  previewIndex,
  previewPage,
  previewPages,
  selectedPageCount,
  setPreviewIndex,
}: {
  fileState: FileState | null;
  options: NumberOptions;
  pageCount: number;
  previewIndex: number;
  previewPage: number;
  previewPages: number[];
  selectedPageCount: number;
  setPreviewIndex: (value: number | ((current: number) => number)) => void;
}) {
  const status = pageCount
    ? m["tools.pdfPageNumberAdder.previewPageStatus"]({
        page: previewPage,
        total: pageCount,
      })
    : m["tools.pdfPageNumberAdder.previewSamplePage"]();
  const selectedLabel = pageCount
    ? selectedPageCount === pageCount
      ? m["tools.pdfPageNumberAdder.allPagesSelected"]()
      : m["tools.pdfPageNumberAdder.selectedPagesCount"]({
          count: selectedPageCount,
        })
    : m["tools.pdfPageNumberAdder.previewSamplePage"]();
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.pdfPageNumberAdder.previewTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.pdfPageNumberAdder.previewDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-3 py-4">
        <div className="mx-auto w-full max-w-md rounded-xl bg-default/40 p-3">
          {fileState ? (
            <PdfPreviewDocument bytes={fileState.source.bytes}>
              <PdfPreview
                page={previewPage}
                options={options}
                label={status}
                unavailable={m["tools.pdfInfoViewer.parseError"]()}
              />
            </PdfPreviewDocument>
          ) : (
            <SamplePage options={options} />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            isIconOnly
            size="sm"
            variant="outline"
            aria-label={m[
              "tools.pdfPageNumberAdder.previousPreviewPageLabel"
            ]()}
            isDisabled={previewIndex <= 0}
            onPress={() => setPreviewIndex((index) => Math.max(0, index - 1))}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <span
            aria-live="polite"
            className="rounded-full border border-border bg-surface px-3 py-1 text-center text-sm text-muted"
          >
            {status}
          </span>
          <Button
            isIconOnly
            size="sm"
            variant="outline"
            aria-label={m["tools.pdfPageNumberAdder.nextPreviewPageLabel"]()}
            isDisabled={previewIndex >= previewPages.length - 1}
            onPress={() =>
              setPreviewIndex((index) =>
                Math.min(previewPages.length - 1, index + 1),
              )
            }
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>
        <p className="text-center text-sm text-muted">{selectedLabel}</p>
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
  const locale = getLocale();
  return (
    <ToolPanelCard aria-live="polite">
      <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-1">
          <Card.Title>{m["shared.macIntegrity.result"]()}</Card.Title>
          <Card.Description>
            {m["tools.pdfPageNumberAdder.resultDescription"]()}
          </Card.Description>
        </div>
        {result && !isGenerating ? (
          <a
            href={result.url}
            download={result.fileName}
            className={`${buttonVariants({ size: "sm", variant: "primary" })} gap-2`}
          >
            <Download aria-hidden className="size-4" />
            {m["shared.pdfEditing.download"]()}
          </a>
        ) : null}
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        {isGenerating ? (
          <ResultSkeleton />
        ) : result ? (
          <div className="grid gap-4 rounded-xl border border-border bg-surface p-4">
            <div>
              <h3 className="font-medium">
                {m["tools.pdfPageNumberAdder.resultReadyTitle"]()}
              </h3>
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
                {formatFileSize(result.size, locale)}
              </Chip>
            </div>
          </div>
        ) : (
          <EmptyState
            title={m["tools.pdfPageNumberAdder.emptyResultTitle"]()}
            description={m["tools.pdfPageNumberAdder.emptyResultDescription"]()}
          />
        )}
      </ToolPanelCardContent>
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
        className="grid w-full grid-cols-2 [&_button]:min-h-11 [&_button]:flex-1 [&_button]:whitespace-normal"
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

function PositionField({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (value: NumberOptions["position"]) => void;
  value: NumberOptions["position"];
}) {
  return (
    <div className="grid gap-2">
      <Label>{m["tools.cssGradientGenerator.stopPosition"]()}</Label>
      <ToggleButtonGroup
        aria-label={m["tools.cssGradientGenerator.stopPosition"]()}
        className="grid w-full grid-cols-3 gap-2 [&_button]:h-20 [&_button]:flex-col [&_button]:px-2 [&_button]:whitespace-normal"
        isDetached
        isDisabled={disabled}
        selectionMode="single"
        selectedKeys={new Set([value])}
        onSelectionChange={(selection) => {
          const next = String([...selection][0] ?? "");
          if (NUMBER_POSITIONS.includes(next as NumberOptions["position"]))
            onChange(next as NumberOptions["position"]);
        }}
      >
        {NUMBER_POSITIONS.map((position, index) => (
          <ToggleButton key={position} id={position}>
            <span className="relative size-7 shrink-0 rounded border border-border bg-surface">
              <span
                className={`absolute size-1.5 rounded-full bg-foreground ${positionDot(position)}`}
              />
            </span>
            <span className="text-xs leading-tight">
              {POSITION_LABELS[index]()}
            </span>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}

function NumberSlider({
  description,
  disabled,
  id,
  label,
  maximum,
  minimum,
  onChange,
  value,
}: {
  description: string;
  disabled: boolean;
  id: string;
  label: string;
  maximum: number;
  minimum: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="font-mono text-sm text-muted">{value} pt</span>
      </div>
      <p className="text-xs leading-5 text-muted">{description}</p>
      <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_5rem]">
        <Slider
          aria-label={label}
          className="min-h-11"
          isDisabled={disabled}
          minValue={minimum}
          maxValue={maximum}
          value={value}
          onChange={(next) => onChange(Number(next))}
        >
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <Input
          id={id}
          className="min-h-11"
          aria-label={label}
          type="number"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          min={minimum}
          max={maximum}
          value={String(value)}
          onChange={(event) =>
            onChange(
              clampInteger(
                Number(event.currentTarget.value),
                value,
                minimum,
                maximum,
              ),
            )
          }
        />
      </div>
    </div>
  );
}

function SamplePage({ options }: { options: NumberOptions }) {
  const width = 612;
  const height = 792;
  const label =
    options.format === "number-total"
      ? `${options.startNumber}/12`
      : String(options.startNumber);
  const textWidth = label.length * options.fontSize * 0.5;
  const point = numberPlacement(width, height, textWidth, options);
  return (
    <div
      className="relative overflow-hidden rounded border border-border bg-white text-black shadow-sm"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-200" />
      <span className="absolute inset-y-0 left-1/2 border-l border-dashed border-slate-200" />
      <svg
        aria-hidden
        className="absolute inset-0 size-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        <text
          fill="currentColor"
          fontFamily={
            options.fontFamily === "serif"
              ? "Times New Roman, serif"
              : "Helvetica, Arial, sans-serif"
          }
          fontSize={options.fontSize}
          x={point.x}
          y={height - point.y}
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

function ReadingSkeleton() {
  return (
    <div
      role="status"
      aria-label={m["tools.pdfInfoViewer.readingTitle"]()}
      className="grid gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div className="grid gap-2">
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="h-3 w-2/3 rounded" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
      <p className="sr-only">
        {m["tools.pdfPageNumberAdder.readingPdfDescription"]()}
      </p>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div
      role="status"
      aria-label={m["tools.pdfPageNumberAdder.generatingTitle"]()}
      className="grid min-h-48 content-center gap-4 rounded-xl border border-dashed border-border bg-default/20 p-5"
    >
      <div className="grid gap-2">
        <Skeleton className="h-4 w-40 rounded" />
        <Skeleton className="h-3 w-3/4 rounded" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
      <p className="sr-only">
        {m["tools.pdfPageNumberAdder.generatingDescription"]()}
      </p>
    </div>
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
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-5 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-default text-muted">
        <FileText aria-hidden className="size-5" />
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted">{description}</p>
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
        <Alert.Title>{m["tools.pdfInfoViewer.errorTitle"]()}</Alert.Title>
        <Alert.Description>{error}</Alert.Description>
      </Alert.Content>
    </Alert>
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
    return { issue: null, pages: pageRanges(input, pageCount, true).pages };
  } catch (cause) {
    const issue: RangeIssue =
      cause instanceof PdfEditingError
        ? cause.code === "out_of_bounds"
          ? "out-of-bounds"
          : cause.code === "duplicate_page"
            ? "duplicate"
            : cause.code === "too_large"
              ? "too-large"
              : cause.reason === "descending"
                ? "descending"
                : "invalid"
        : "invalid";
    return { issue, pages: [] };
  }
}

function rangeIssueMessage(issue: RangeIssue) {
  if (issue === "too-large")
    return m["tools.pdfPageNumberAdder.statesTooLarge"]();
  if (issue === "out-of-bounds")
    return m["tools.pdfPageNumberAdder.rangeOutOfBounds"]();
  if (issue === "descending")
    return m["tools.pdfPageNumberAdder.rangeDescending"]();
  if (issue === "duplicate")
    return m["tools.pdfPageNumberAdder.rangeDuplicate"]();
  return m["tools.pdfPageNumberAdder.rangeInvalidToken"]();
}

function pdfErrorMessage(cause: unknown, phase: "generate" | "read") {
  if (!(cause instanceof PdfEditingError))
    return phase === "read"
      ? m["tools.pdfInfoViewer.parseError"]()
      : m["tools.pdfPageNumberAdder.generateFailedError"]();
  if (cause.code === "encrypted_pdf")
    return m["tools.pdfPageNumberAdder.encryptedPdfError"]();
  if (cause.code === "too_large")
    return m["tools.pdfPageNumberAdder.statesTooLarge"]();
  if (cause.code === "unsupported")
    return m["tools.pdfPageNumberAdder.statesWorkerUnavailable"]();
  if (cause.code === "timeout")
    return m["tools.pdfPageNumberAdder.statesTimeout"]();
  if (cause.code === "read_failed" || cause.code === "invalid_pdf")
    return m["tools.pdfInfoViewer.parseError"]();
  return m["tools.pdfPageNumberAdder.generateFailedError"]();
}

function releaseOutputBytes(output?: PdfOutput) {
  if (!output) return;
  for (const file of output.files) file.bytes.fill(0);
  output.archive?.fill(0);
}

function numberedFileName(name: string) {
  return pdfFilename(`${name.replace(/\.pdf$/i, "")}-numbered`, "numbered");
}

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function clampInteger(
  value: number,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function positionDot(position: NumberOptions["position"]) {
  if (position === "top-left") return "left-1.5 top-1.5";
  if (position === "top-center") return "left-1/2 top-1.5 -translate-x-1/2";
  if (position === "top-right") return "right-1.5 top-1.5";
  if (position === "bottom-left") return "bottom-1.5 left-1.5";
  if (position === "bottom-center")
    return "bottom-1.5 left-1/2 -translate-x-1/2";
  return "bottom-1.5 right-1.5";
}

export default function PdfPageNumberAdderPage() {
  return (
    <ToolPage>
      <PdfPageNumberAdderPageContent />
    </ToolPage>
  );
}
