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
} from "@heroui/react";
import {
  Download,
  ImageIcon,
  LoaderCircle,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import { buttonVariants } from "@heroui/styles";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { useObjectUrl } from "@/hooks/use-object-url";
import { renderImage } from "@/lib/browser-image";
import {
  MAX_BATCH_FILES,
  MAX_FILE_BYTES,
  outputFilename,
  validateDimensions,
} from "@workspace/tools/image/options";

type Options = {
  quality: number;
  scale: number;
};
type Result = {
  blob: Blob;
  file: File;
  originalHeight: number;
  originalWidth: number;
  outputHeight: number;
  outputName: string;
  outputWidth: number;
};
type BatchResult = {
  results: Result[];
  zipBlob: Blob | null;
};
type DecodedImage = {
  cleanup: () => void;
  height: number;
  source: CanvasImageSource;
  width: number;
};

const DEFAULT_OPTIONS: Options = { quality: 82, scale: 100 };
const SUPPORTED_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jfif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "svgz",
  "tif",
  "tiff",
  "webp",
]);

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function supportedFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return (
    Number.isSafeInteger(file.size) &&
    file.size > 0 &&
    file.size <= MAX_FILE_BYTES &&
    (file.type.startsWith("image/") ||
      (extension ? SUPPORTED_EXTENSIONS.has(extension) : false))
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function uniqueOutputName(fileName: string, counts: Map<string, number>) {
  const name = outputFilename(fileName, "webp");
  const count = counts.get(name) ?? 0;
  counts.set(name, count + 1);
  if (!count) return name;
  return name.replace(/\.webp$/, `-${count + 1}.webp`);
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error))
    return m["tools.imageToAvifConverter.conversionFailedError"]();
  if (
    ["decodeError", "invalidFile", "invalidDimensions"].includes(error.message)
  )
    return m["tools.imageToAvifConverter.invalidImageError"]();
  if (error.message === "canvasUnsupported")
    return m["tools.imageToAvifConverter.canvasUnavailableError"]();
  if (error.message === "unsupported")
    return m["shared.imageToWebpConverter.webpUnsupportedError"]();
  return m["tools.imageToAvifConverter.conversionFailedError"]();
}

async function decodeSupportedImage(
  file: File,
  signal: AbortSignal,
): Promise<DecodedImage> {
  signal.throwIfAborted();
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    if (signal.aborted) throw error;
  }
  if (bitmap) {
    try {
      signal.throwIfAborted();
      validateDimensions(bitmap);
      return {
        cleanup: () => bitmap.close(),
        height: bitmap.height,
        source: bitmap,
        width: bitmap.width,
      };
    } catch (error) {
      bitmap.close();
      throw error;
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      const cleanup = () => {
        element.onload = null;
        element.onerror = null;
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        element.src = "";
        reject(new DOMException("Aborted", "AbortError"));
      };
      element.onload = () => {
        cleanup();
        if (!element.naturalWidth || !element.naturalHeight) {
          reject(new Error("decodeError"));
          return;
        }
        resolve(element);
      };
      element.onerror = () => {
        cleanup();
        reject(new Error("decodeError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      element.src = objectUrl;
    });
    validateDimensions({
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    });
    return {
      cleanup: () => URL.revokeObjectURL(objectUrl),
      height: image.naturalHeight || image.height,
      source: image,
      width: image.naturalWidth || image.width,
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function convertFile(
  file: File,
  options: Options,
  outputName: string,
  signal: AbortSignal,
): Promise<Result> {
  const image = await decodeSupportedImage(file, signal);
  try {
    signal.throwIfAborted();
    const originalWidth = image.width;
    const originalHeight = image.height;
    const ratio = options.scale / 100;
    const dimensions = validateDimensions({
      width: Math.max(1, Math.round(originalWidth * ratio)),
      height: Math.max(1, Math.round(originalHeight * ratio)),
    });
    const blob = await renderImage(
      image.source,
      dimensions,
      "webp",
      options.quality,
      signal,
    );
    return {
      blob,
      file,
      originalHeight,
      originalWidth,
      outputHeight: dimensions.height,
      outputName,
      outputWidth: dimensions.width,
    };
  } finally {
    image.cleanup();
  }
}

async function createZip(
  results: readonly Result[],
  signal: AbortSignal,
): Promise<Blob> {
  const { zip } = await import("fflate");
  signal.throwIfAborted();
  const files: Record<string, Uint8Array> = {};
  for (const result of results) {
    files[result.outputName] = new Uint8Array(await result.blob.arrayBuffer());
    signal.throwIfAborted();
  }
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const terminate = zip(files, { level: 0 }, (error, data) => {
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(data);
    });
    function abort() {
      terminate();
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
  });
  signal.throwIfAborted();
  return new Blob([new Uint8Array(bytes)], { type: "application/zip" });
}

function ImageToWebpConverterContent() {
  const inputId = useId();
  const task = useRef<AbortController | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      const active = task.current;
      task.current = null;
      active?.abort();
    },
    [],
  );

  function clearResult() {
    setBatchResult(null);
    setError("");
  }

  function selectFiles(selected: readonly File[]) {
    if (!selected.length || busy) return;
    let duplicate = false;
    let invalid = false;
    const keys = new Set(files.map(fileKey));
    const next = [...files];
    for (const file of selected) {
      if (!supportedFile(file) || next.length >= MAX_BATCH_FILES) {
        invalid = true;
        continue;
      }
      const key = fileKey(file);
      if (keys.has(key)) {
        duplicate = true;
        continue;
      }
      keys.add(key);
      next.push(file);
    }
    setFiles(next);
    setBatchResult(null);
    setError(
      invalid
        ? m["tools.imageToAvifConverter.invalidFileTypeError"]()
        : duplicate
          ? m["tools.imageToAvifConverter.duplicateFileError"]()
          : "",
    );
  }

  function removeFile(file: File) {
    if (busy) return;
    setFiles((current) =>
      current.filter((candidate) => fileKey(candidate) !== fileKey(file)),
    );
    clearResult();
  }

  function clearFiles() {
    if (busy) return;
    setFiles([]);
    clearResult();
  }

  function updateOption(key: keyof Options, value: number) {
    if (busy) return;
    setOptions((current) => ({
      ...current,
      [key]: clamp(
        value,
        key === "quality" ? 1 : 10,
        key === "quality" ? 100 : 400,
      ),
    }));
    clearResult();
  }

  async function convert() {
    if (!files.length || busy || task.current) {
      if (!files.length)
        setError(m["tools.imageToAvifConverter.noFilesError"]());
      return;
    }
    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    setBatchResult(null);
    setError("");
    const results: Result[] = [];
    const failures: string[] = [];
    const counts = new Map<string, number>();
    try {
      for (const file of files) {
        controller.signal.throwIfAborted();
        try {
          results.push(
            await convertFile(
              file,
              options,
              uniqueOutputName(file.name, counts),
              controller.signal,
            ),
          );
        } catch (conversionError) {
          if (controller.signal.aborted) throw conversionError;
          failures.push(errorMessage(conversionError));
        }
      }
      const zipBlob =
        results.length > 1 ? await createZip(results, controller.signal) : null;
      controller.signal.throwIfAborted();
      if (task.current !== controller) return;
      setBatchResult({ results, zipBlob });
      if (failures.length) {
        setError(
          results.length
            ? `${m["tools.imageToAvifConverter.partialConversionError"]()} ${failures[0]}`
            : (failures[0] ??
                m["tools.imageToAvifConverter.conversionFailedError"]()),
        );
      }
    } catch {
      if (!controller.signal.aborted && task.current === controller) {
        setBatchResult(results.length ? { results, zipBlob: null } : null);
        setError(m["tools.imageToAvifConverter.zipFailedError"]());
      }
    } finally {
      if (task.current === controller) {
        task.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <UploadCard
          busy={busy}
          files={files}
          onClear={clearFiles}
          onRemove={removeFile}
          onSelect={selectFiles}
        />
        <OptionsCard
          busy={busy}
          inputId={inputId}
          fileCount={files.length}
          onConvert={() => void convert()}
          onUpdate={updateOption}
          options={options}
        />
      </div>
      {error ? <ErrorAlert error={error} /> : null}
      <ResultsCard busy={busy} batchResult={batchResult} />
      <WebpArticle />
    </div>
  );
}

function UploadCard({
  busy,
  files,
  onClear,
  onRemove,
  onSelect,
}: {
  busy: boolean;
  files: readonly File[];
  onClear: () => void;
  onRemove: (file: File) => void;
  onSelect: (files: readonly File[]) => void;
}) {
  const picker = useRef<HTMLDivElement>(null);
  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["tools.imageToAvifConverter.uploadTitle"]()}
        description={m["shared.imageToWebpConverter.uploadDescription"]()}
      />
      <ToolPanelCardContent className="gap-4 py-4">
        <div ref={picker}>
          <ToolFilePicker
            label={m["tools.imageToAvifConverter.chooseImagesLabel"]()}
            accept={["image/*"]}
            description={m["tools.imageToAvifConverter.uploadHint"]()}
            isDisabled={busy}
            multiple
            onSelectFiles={onSelect}
          />
        </div>
        <p className="text-xs leading-5 text-muted">
          {m["shared.imageToWebpConverter.supportedFormatsLabel"]()}
        </p>
        {files.length ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Chip size="sm" variant="secondary">
                {m["tools.imageToAvifConverter.selectedImagesLabel"]()}:{" "}
                {files.length}
              </Chip>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                isDisabled={busy}
                onPress={onClear}
              >
                {m["shared.pdfEditing.clear"]()}
              </Button>
            </div>
            <ul className="grid gap-2">
              {files.map((file) => (
                <li
                  key={fileKey(file)}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-default/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    isDisabled={busy}
                    aria-label={`${m["common.faviconremoveimage"]()}: ${file.name}`}
                    onPress={() => onRemove(file)}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ToolPanelCardContent>
      {files.length ? (
        <ToolPanelCardFooter>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            isDisabled={busy}
            onPress={() => picker.current?.querySelector("input")?.click()}
          >
            {m["tools.imageToAvifConverter.changeImagesLabel"]()}
          </Button>
        </ToolPanelCardFooter>
      ) : null}
    </ToolPanelCard>
  );
}

function OptionsCard({
  busy,
  fileCount,
  inputId,
  onConvert,
  onUpdate,
  options,
}: {
  busy: boolean;
  fileCount: number;
  inputId: string;
  onConvert: () => void;
  onUpdate: (key: keyof Options, value: number) => void;
  options: Options;
}) {
  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["tools.gifToAnimatedWebpConverter.optionsTitle"]()}
        description={m["shared.imageToWebpConverter.optionsDescription"]()}
      />
      <ToolPanelCardContent className="gap-6 py-4">
        <fieldset disabled={busy} className="grid gap-6">
          <NumberSlider
            id={`${inputId}-quality`}
            label={m["common.formatquality"]()}
            description={m["tools.imageToAvifConverter.qualityDescription"]()}
            minimum={1}
            maximum={100}
            value={options.quality}
            onChange={(value) => onUpdate("quality", value)}
          />
          <NumberSlider
            id={`${inputId}-scale`}
            label={m["tools.gifToAnimatedWebpConverter.scaleLabel"]()}
            description={m["tools.imageToAvifConverter.scaleDescription"]()}
            minimum={10}
            maximum={400}
            value={options.scale}
            onChange={(value) => onUpdate("scale", value)}
          />
        </fieldset>
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="flex justify-end">
        <Button
          type="button"
          size="sm"
          isDisabled={!fileCount || busy}
          onPress={onConvert}
        >
          {busy ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
          ) : null}
          {busy
            ? m["tools.imageToAvifConverter.convertingLabel"]()
            : m["shared.imageToWebpConverter.convertLabel"]()}
        </Button>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function NumberSlider({
  description,
  id,
  label,
  maximum,
  minimum,
  onChange,
  value,
}: {
  description: string;
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
        <span className="font-mono text-sm text-muted">{value}%</span>
      </div>
      <p className="text-xs leading-5 text-muted">{description}</p>
      <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_5rem]">
        <Slider
          aria-label={label}
          minValue={minimum}
          maxValue={maximum}
          value={value}
          className="min-h-11"
          onChange={(next) => onChange(Number(next))}
        >
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <Input
          id={id}
          aria-label={label}
          type="number"
          inputMode="numeric"
          min={minimum}
          max={maximum}
          value={String(value)}
          className="min-h-11 border border-border"
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
      </div>
    </div>
  );
}

function ErrorAlert({ error }: { error: string }) {
  return (
    <Alert status="danger" role="alert">
      <Alert.Indicator>
        <TriangleAlert aria-hidden className="size-5" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>
          {m["tools.gifToAnimatedWebpConverter.errorTitle"]()}
        </Alert.Title>
        <Alert.Description>{error}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function ResultsCard({
  batchResult,
  busy,
}: {
  batchResult: BatchResult | null;
  busy: boolean;
}) {
  const results = batchResult?.results ?? [];
  const zipUrl = useObjectUrl(batchResult?.zipBlob ?? null);
  const totalOriginal = results.reduce(
    (total, result) => total + result.file.size,
    0,
  );
  const totalOutput = results.reduce(
    (total, result) => total + result.blob.size,
    0,
  );
  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["shared.imageToWebpConverter.resultTitle"]()}
        description={m["tools.imageToAvifConverter.resultDescription"]()}
        actions={
          zipUrl && results.length > 1 ? (
            <DownloadLink
              href={zipUrl}
              name="webp-images.zip"
              label={m["common.favicondownloadzip"]()}
            />
          ) : null
        }
      />
      <ToolPanelCardContent className="gap-5 py-4">
        {busy ? (
          <ResultSkeleton />
        ) : results.length ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Chip size="sm" variant="secondary">
                {results.length} {m["common.devOutput"]()}
              </Chip>
              <Chip size="sm" variant="tertiary">
                {m["tools.imageToAvifConverter.totalSavedLabel"]()}:{" "}
                {formatSavedText(totalOriginal, totalOutput)}
              </Chip>
              <Chip size="sm" variant="tertiary">
                {formatBytes(totalOutput)}
              </Chip>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {results.map((result) => (
                <ResultPreview key={result.outputName} result={result} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/20 p-6 text-center">
            <div className="rounded-full bg-default p-3">
              <ImageIcon aria-hidden className="size-5" />
            </div>
            <div className="grid gap-1">
              <p className="font-medium">
                {m["tools.imageToAvifConverter.emptyResultTitle"]()}
              </p>
              <p className="max-w-lg text-sm leading-6 text-muted">
                {m["shared.imageToWebpConverter.emptyResultDescription"]()}
              </p>
            </div>
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          className="grid gap-4 rounded-xl border border-border p-4"
        >
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-36 justify-self-end rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function ResultPreview({ result }: { result: Result }) {
  const previewUrl = useObjectUrl(result.blob);
  return (
    <div className="grid min-w-0 gap-4 rounded-xl border border-border bg-default/10 p-4">
      <div className="grid min-h-44 place-items-center overflow-hidden rounded-xl border border-border bg-default/20 p-3">
        {previewUrl ? (
          <img
            alt={result.outputName}
            src={previewUrl}
            className="max-h-52 max-w-full rounded-lg object-contain"
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{result.outputName}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip size="sm" variant="secondary">
            WebP
          </Chip>
          <Chip size="sm" variant="tertiary" className="font-mono">
            {result.outputWidth} × {result.outputHeight}
          </Chip>
        </div>
      </div>
      <dl className="grid gap-2 text-sm text-muted">
        <Metric
          label={m["common.original"]()}
          value={`${result.originalWidth} × ${result.originalHeight}, ${formatBytes(result.file.size)}`}
        />
        <Metric
          label={m["common.devOutput"]()}
          value={`${result.outputWidth} × ${result.outputHeight}, ${formatBytes(result.blob.size)}`}
        />
        <Metric
          label={m["tools.imageToAvifConverter.savedLabel"]()}
          value={formatSavedText(result.file.size, result.blob.size)}
        />
      </dl>
      {previewUrl ? (
        <div className="flex justify-end">
          <DownloadLink
            href={previewUrl}
            name={result.outputName}
            label={m["tools.cssGradientGenerator.downloadWebp"]()}
            secondary
          />
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </div>
  );
}

function DownloadLink({
  href,
  label,
  name,
  secondary = false,
}: {
  href: string;
  label: string;
  name: string;
  secondary?: boolean;
}) {
  return (
    <a
      href={href}
      download={name}
      className={buttonVariants({
        size: "sm",
        variant: secondary ? "outline" : "primary",
      })}
    >
      <Download aria-hidden className="size-4" />
      {label}
    </a>
  );
}

function PanelHeader({
  actions,
  description,
  title,
}: {
  actions?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="grid gap-1">
        <Card.Title>{title}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </div>
      {actions}
    </Card.Header>
  );
}

function WebpArticle() {
  return (
    <ToolArticle>
      <h2>{m["shared.imageToWebpConverter.article.whatTitle"]()}</h2>
      <p>{m["shared.imageToWebpConverter.article.what"]()}</p>
      <h2>{m["shared.imageToWebpConverter.article.whyTitle"]()}</h2>
      <p>{m["shared.imageToWebpConverter.article.why"]()}</p>
      <h2>{m["tools.dnsLookup.article.howTitle"]()}</h2>
      <ol>
        {[
          m["tools.imageToAvifConverter.howSteps0"](),
          m["shared.imageToWebpConverter.article.howSteps1"](),
          m["shared.imageToWebpConverter.article.howSteps2"](),
          m["shared.imageToWebpConverter.article.howSteps3"](),
        ].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h2>{m["shared.imageToWebpConverter.article.tipsTitle"]()}</h2>
      <ul>
        {[
          m["shared.imageToWebpConverter.article.tips0"](),
          m["tools.imageToAvifConverter.tips1"](),
          m["tools.imageToAvifConverter.tips4"](),
          m["shared.imageToWebpConverter.article.tips3"](),
        ].map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </ToolArticle>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSavedText(originalBytes: number, outputBytes: number) {
  const delta = originalBytes - outputBytes;
  const sign = delta < 0 ? "-" : "";
  const absolute = Math.abs(delta);
  const percent = originalBytes > 0 ? (absolute / originalBytes) * 100 : 0;
  const shown =
    percent >= 10
      ? Math.round(percent)
      : percent > 0
        ? percent.toFixed(1)
        : "0";
  return `${sign}${formatBytes(absolute)} (${sign}${shown}%)`;
}

export default function ImageToWebpConverter() {
  return (
    <ToolPage>
      <ImageToWebpConverterContent />
    </ToolPage>
  );
}
