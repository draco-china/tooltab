import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Label,
  ListBox,
  Select,
  Skeleton,
  Slider,
  Switch,
  TextArea,
} from "@heroui/react";
import { Download, ImageIcon, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { formatFileSize } from "@/lib/file-size";
import { runWorkerTask } from "@/lib/worker-task";
import {
  MAX_FILE_BYTES,
  validateDimensions,
} from "@workspace/tools/image/options";
import { getLocale } from "@/paraglide/runtime.js";
import { sortSwatches } from "@workspace/tools/image/palette/quantize";
import {
  formatPaletteExport,
  getExportFileName,
  getExportMimeType,
} from "@workspace/tools/image/palette/quantize";
import {
  DEFAULT_PALETTE_OPTIONS,
  getSampleStride,
  QUALITY_PRESETS,
} from "@workspace/tools/image/palette/quantize";
import type {
  PaletteExportFormat,
  PaletteOptions,
  PaletteQuality,
  PaletteSort,
  PaletteSwatch,
} from "@workspace/tools/image/palette/quantize";

const STORAGE_KEY = "tools:image-palette-extractor:options";
const IMAGE_EXTENSIONS = [
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".svgz",
  ".tif",
  ".tiff",
  ".webp",
] as const;

type Source = {
  name: string;
  size: number;
  width: number;
  height: number;
  url: string;
};

function isImageFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    IMAGE_EXTENSIONS.some((extension) =>
      file.name.toLowerCase().endsWith(extension),
    )
  );
}

function readStoredOptions(): PaletteOptions {
  if (typeof window === "undefined") return DEFAULT_PALETTE_OPTIONS;
  try {
    const value = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<PaletteOptions> | null;
    return {
      colorCount:
        Number.isInteger(value?.colorCount) &&
        Number(value?.colorCount) >= 3 &&
        Number(value?.colorCount) <= 12
          ? Number(value?.colorCount)
          : DEFAULT_PALETTE_OPTIONS.colorCount,
      quality: ["fast", "balanced", "precise"].includes(String(value?.quality))
        ? (value?.quality as PaletteQuality)
        : DEFAULT_PALETTE_OPTIONS.quality,
      sortBy: ["dominance", "hue", "lightness"].includes(String(value?.sortBy))
        ? (value?.sortBy as PaletteSort)
        : DEFAULT_PALETTE_OPTIONS.sortBy,
      ignoreTransparent:
        typeof value?.ignoreTransparent === "boolean"
          ? value.ignoreTransparent
          : DEFAULT_PALETTE_OPTIONS.ignoreTransparent,
    };
  } catch {
    return DEFAULT_PALETTE_OPTIONS;
  }
}

function OptionsCard({
  options,
  disabled,
  onChange,
}: {
  options: PaletteOptions;
  disabled: boolean;
  onChange: (next: PaletteOptions) => void;
}) {
  const update = (next: Partial<PaletteOptions>) =>
    onChange({ ...options, ...next });
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["shared.imagePaletteExtractor.optionsTitle"]()}
        </Card.Title>
        <Card.Description>
          {m["shared.imagePaletteExtractor.optionsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-6 py-4">
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label>{m["shared.imagePaletteExtractor.colorCountLabel"]()}</Label>
            <output className="rounded-lg border border-border bg-default/30 px-2 py-1 font-mono text-sm">
              {options.colorCount}
            </output>
          </div>
          <Slider
            aria-label={m["shared.imagePaletteExtractor.colorCountLabel"]()}
            minValue={3}
            maxValue={12}
            step={1}
            value={options.colorCount}
            isDisabled={disabled}
            onChange={(value) => update({ colorCount: Number(value) })}
          >
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
          <p className="text-sm text-muted">
            {m["shared.imagePaletteExtractor.colorCountDescription"]()}
          </p>
        </div>
        <OptionSelect
          label={m["common.formatquality"]()}
          description={m["shared.imagePaletteExtractor.qualityDescription"]()}
          value={options.quality}
          disabled={disabled}
          options={[
            ["fast", m["shared.imagePaletteExtractor.qualityFast"]()],
            ["balanced", m["shared.imagePaletteExtractor.qualityBalanced"]()],
            ["precise", m["shared.imagePaletteExtractor.qualityPrecise"]()],
          ]}
          onChange={(quality) => update({ quality: quality as PaletteQuality })}
        />
        <OptionSelect
          label={m["shared.imagePaletteExtractor.sortLabel"]()}
          description={m["shared.imagePaletteExtractor.sortDescription"]()}
          value={options.sortBy}
          disabled={disabled}
          options={[
            ["dominance", m["shared.imagePaletteExtractor.sortDominance"]()],
            ["hue", m["common.cssgenHue"]()],
            ["lightness", m["shared.imagePaletteExtractor.sortLightness"]()],
          ]}
          onChange={(sortBy) => update({ sortBy: sortBy as PaletteSort })}
        />
        <div className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border p-4">
          <div className="grid gap-1">
            <Label>
              {m["shared.imagePaletteExtractor.ignoreTransparentLabel"]()}
            </Label>
            <p className="text-sm text-muted">
              {m["shared.imagePaletteExtractor.ignoreTransparentDescription"]()}
            </p>
          </div>
          <Switch
            aria-label={m[
              "shared.imagePaletteExtractor.ignoreTransparentLabel"
            ]()}
            isSelected={options.ignoreTransparent}
            isDisabled={disabled}
            onChange={(ignoreTransparent) => update({ ignoreTransparent })}
          >
            <Switch.Content>
              <span className="sr-only">
                {m["shared.imagePaletteExtractor.ignoreTransparentLabel"]()}
              </span>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function OptionSelect({
  label,
  description,
  value,
  disabled,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  disabled: boolean;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      variant="secondary"
      selectedKey={value}
      isDisabled={disabled}
      onSelectionChange={(key) => key && onChange(String(key))}
    >
      <Label>{label}</Label>
      <Select.Trigger aria-label={label} className="min-h-11 w-full">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map(([key, optionLabel]) => (
            <ListBox.Item key={key} id={key} textValue={optionLabel}>
              {optionLabel}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
      {description ? <p className="text-sm text-muted">{description}</p> : null}
    </Select>
  );
}

function UploadCard({
  locale,
  source,
  onSelect,
  onClear,
}: {
  locale: string;
  source: Source | null;
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["shared.barcodeTools.readerUploadTitle"]()}</Card.Title>
        <Card.Description>
          {m["shared.imagePaletteExtractor.uploadDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        {source ? (
          <div className="overflow-hidden rounded-xl border border-border bg-default/20 p-3">
            <img
              alt=""
              src={source.url}
              className="h-72 w-full rounded-lg object-contain"
            />
          </div>
        ) : null}
        <ToolFilePicker
          label={
            source
              ? m["common.change"]()
              : m["shared.imagePaletteExtractor.chooseImageLabel"]()
          }
          description={`${m["shared.imagePaletteExtractor.uploadHint"]()} ${m[
            "shared.imagePaletteExtractor.supportedFormatsLabel"
          ]()}`}
          fileName={source?.name}
          clearLabel={m["common.faviconremoveimage"]()}
          accept={["image/*"]}
          onSelect={onSelect}
        />
        {source ? (
          <div className="flex flex-wrap gap-2">
            <Chip size="sm" variant="secondary">
              {formatFileSize(source.size, locale)}
            </Chip>
            <Chip size="sm" variant="tertiary" className="font-mono">
              {source.width} × {source.height}
            </Chip>
          </div>
        ) : null}
      </ToolPanelCardContent>
      {source ? (
        <ToolPanelCardFooter className="justify-end">
          <Button variant="outline" onPress={onClear}>
            <Trash2 aria-hidden className="size-4" />
            {m["common.faviconremoveimage"]()}
          </Button>
        </ToolPanelCardFooter>
      ) : null}
    </ToolPanelCard>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-default/20 p-3">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="flex items-center gap-2 font-mono text-sm font-semibold">
        {color ? (
          <span
            aria-hidden
            className="size-3 rounded-full border border-border"
            style={{ backgroundColor: color }}
          />
        ) : null}
        {value}
      </span>
    </div>
  );
}

function formatPercent(value: number) {
  return value > 0 && value < 0.01 ? "<1%" : `${Math.round(value * 100)}%`;
}

function PaletteGrid({ swatches }: { swatches: PaletteSwatch[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {swatches.map((color) => (
        <Card
          key={color.hex}
          className="aspect-square min-h-28 border border-border p-3 shadow-sm"
          style={{ backgroundColor: color.hex, color: color.textColor }}
        >
          <Card.Content className="flex h-full flex-col justify-between p-0">
            <span className="text-xs font-medium opacity-90">
              {formatPercent(color.ratio)}
            </span>
            <ToolCopyButton
              value={color.hex}
              copyLabel={color.hex}
              copiedLabel={m["common.actions.copied"]()}
              ariaLabel={`${m["shared.imagePaletteExtractor.copyColorLabel"]()} ${color.hex}`}
              variant="ghost"
              className="max-w-full justify-start px-1 font-mono font-semibold"
            />
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

function ExportPanel({
  fileName,
  swatches,
  onDownload,
}: {
  fileName: string;
  swatches: PaletteSwatch[];
  onDownload: (content: string, name: string, mime: string) => void;
}) {
  const [format, setFormat] = useState<PaletteExportFormat>("css");
  const content = useMemo(
    () => formatPaletteExport(swatches, format),
    [format, swatches],
  );
  return (
    <section className="grid gap-4 rounded-xl border border-border bg-default/20 p-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-start">
        <div className="grid gap-1">
          <h3 className="font-medium">
            {m["shared.imagePaletteExtractor.exportTitle"]()}
          </h3>
          <p className="text-sm text-muted">
            {m["shared.imagePaletteExtractor.exportDescription"]()}
          </p>
        </div>
        <OptionSelect
          label={m["common.archiveformat"]()}
          description=""
          value={format}
          disabled={false}
          options={[
            ["hex", m["shared.imagePaletteExtractor.exportFormatHex"]()],
            ["css", m["shared.imagePaletteExtractor.exportFormatCss"]()],
            ["json", m["tools.csvToJsonConverter.jsonLabel"]()],
          ]}
          onChange={(value) => setFormat(value as PaletteExportFormat)}
        />
      </div>
      <TextArea
        aria-label={m["shared.imagePaletteExtractor.exportTitle"]()}
        className="min-h-32 resize-y font-mono text-xs"
        readOnly
        value={content}
      />
      <div className="flex flex-wrap gap-3">
        <ToolCopyButton
          value={content}
          copyLabel={m["shared.imagePaletteExtractor.copyPaletteLabel"]()}
          copiedLabel={m["common.actions.copied"]()}
        />
        <Button
          size="sm"
          variant="outline"
          onPress={() =>
            onDownload(
              content,
              getExportFileName(fileName, format),
              getExportMimeType(format),
            )
          }
        >
          <Download aria-hidden className="size-4" />
          {m["shared.imagePaletteExtractor.downloadPaletteLabel"]()}
        </Button>
      </div>
    </section>
  );
}

function ResultsCard({
  source,
  swatches,
  totalPixels,
  busy,
  error,
  onDownload,
}: {
  source: Source | null;
  swatches: PaletteSwatch[];
  totalPixels: number;
  busy: boolean;
  error: string;
  onDownload: (content: string, name: string, mime: string) => void;
}) {
  const dominant = swatches[0];
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["shared.imagePaletteExtractor.resultsTitle"]()}
        </Card.Title>
        <Card.Description>
          {m["shared.imagePaletteExtractor.resultsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-5 py-4" aria-busy={busy}>
        {error ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>
                {m["shared.imagePaletteExtractor.errorTitle"]()}
              </Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {busy ? (
          <div
            className="grid min-h-48 content-center gap-4"
            role="status"
            aria-label={m["shared.imagePaletteExtractor.loadingTitle"]()}
          >
            <div className="text-center">
              <p className="font-medium">
                {m["shared.imagePaletteExtractor.loadingTitle"]()}
              </p>
              <p className="text-sm text-muted">
                {m["shared.imagePaletteExtractor.loadingDescription"]()}
              </p>
            </div>
            <Skeleton className="h-5 rounded-full" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="aspect-square rounded-xl" />
              ))}
            </div>
          </div>
        ) : null}
        {!busy && !error && !swatches.length ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <span className="rounded-full bg-default p-3">
              <ImageIcon aria-hidden className="size-5 text-muted" />
            </span>
            <div className="grid gap-1">
              <p className="font-medium">
                {m["shared.imagePaletteExtractor.emptyResultTitle"]()}
              </p>
              <p className="text-sm text-muted">
                {m["shared.imagePaletteExtractor.emptyResultDescription"]()}
              </p>
            </div>
          </div>
        ) : null}
        {!busy && swatches.length ? (
          <>
            <div className="flex h-5 overflow-hidden rounded-full border border-border bg-default">
              {swatches.map((color) => (
                <div
                  key={color.hex}
                  role="img"
                  aria-label={`${color.hex} ${formatPercent(color.ratio)}`}
                  className="min-w-1"
                  style={{
                    backgroundColor: color.hex,
                    flexGrow: color.count,
                  }}
                />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                label={m["shared.imagePaletteExtractor.extractedColorsLabel"]()}
                value={String(swatches.length)}
              />
              <Metric
                label={m["shared.imagePaletteExtractor.sampledPixelsLabel"]()}
                value={totalPixels.toLocaleString()}
              />
              <Metric
                label={m["shared.imagePaletteExtractor.dominantColorLabel"]()}
                value={dominant?.hex ?? "-"}
                color={dominant?.hex}
              />
            </div>
            <PaletteGrid swatches={swatches} />
            <ExportPanel
              fileName={source?.name ?? "palette"}
              swatches={swatches}
              onDownload={onDownload}
            />
          </>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function Article() {
  return (
    <ToolArticle>
      <h2>{m["tools.exifViewer.article.whatTitle"]()}</h2>
      <p>{m["shared.imagePaletteExtractor.article.what"]()}</p>
      <h2>{m["tools.camera.article.casesTitle"]()}</h2>
      <ul>
        <li>{m["shared.imagePaletteExtractor.article.useItems0"]()}</li>
        <li>{m["shared.imagePaletteExtractor.article.useItems1"]()}</li>
        <li>{m["shared.imagePaletteExtractor.article.useItems2"]()}</li>
        <li>{m["shared.imagePaletteExtractor.article.useItems3"]()}</li>
      </ul>
      <h2>{m["shared.imagePaletteExtractor.article.exportTitle"]()}</h2>
      <p>
        {m["shared.imagePaletteExtractor.article.exportBeforeCode"]()}
        <code>{m["shared.imagePaletteExtractor.article.exportCode"]()}</code>
        {m["shared.imagePaletteExtractor.article.exportAfterCode"]()}
      </p>
      <h2>{m["tools.crcChecksumCalculator.article.watchTitle"]()}</h2>
      <ul>
        <li>{m["shared.imagePaletteExtractor.article.watch.item0"]()}</li>
        <li>{m["shared.imagePaletteExtractor.article.watch.item1"]()}</li>
        <li>{m["shared.imagePaletteExtractor.article.watch.item2"]()}</li>
      </ul>
    </ToolArticle>
  );
}

function ImagePaletteExtractorContent() {
  const locale = getLocale();
  const [options, setOptions] = useState<PaletteOptions>(
    DEFAULT_PALETTE_OPTIONS,
  );
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [swatches, setSwatches] = useState<PaletteSwatch[]>([]);
  const [totalPixels, setTotalPixels] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bitmap = useRef<ImageBitmap | null>(null);
  const previewUrl = useRef("");
  const extractionAbort = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const sortedSwatches = useMemo(
    () => sortSwatches(swatches, options.sortBy),
    [options.sortBy, swatches],
  );

  const releaseDownloads = useCallback(() => {
    for (const [url, timer] of downloads.current) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    downloads.current.clear();
  }, []);

  function stopWorker() {
    revision.current += 1;
    extractionAbort.current?.abort();
    extractionAbort.current = null;
    setBusy(false);
  }

  function releaseImage() {
    bitmap.current?.close();
    bitmap.current = null;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = "";
  }

  function clear() {
    stopWorker();
    releaseImage();
    releaseDownloads();
    setSource(null);
    setSwatches([]);
    setTotalPixels(0);
    setError("");
  }

  useEffect(() => {
    setOptions(readStoredOptions());
    setHasLoadedStorage(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch {
      // Storage is optional; extraction still works in restricted contexts.
    }
  }, [hasLoadedStorage, options]);

  useEffect(
    () => () => {
      revision.current += 1;
      extractionAbort.current?.abort();
      extractionAbort.current = null;
      bitmap.current?.close();
      bitmap.current = null;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = "";
      releaseDownloads();
    },
    [releaseDownloads],
  );

  useEffect(() => {
    if (!source || !bitmap.current) return;
    revision.current += 1;
    const current = revision.current;
    extractionAbort.current?.abort();
    const abortController = new AbortController();
    extractionAbort.current = abortController;
    setBusy(true);
    setError("");
    setSwatches([]);
    setTotalPixels(0);
    const canvas = document.createElement("canvas");
    try {
      const preset = QUALITY_PRESETS[options.quality];
      const ratio = Math.min(
        1,
        preset.maxDimension /
          Math.max(bitmap.current.width, bitmap.current.height),
      );
      canvas.width = Math.max(1, Math.round(bitmap.current.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.current.height * ratio));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("CANVAS_UNAVAILABLE");
      context.drawImage(bitmap.current, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      const result = runWorkerTask(
        {
          pixels,
          width: canvas.width,
          height: canvas.height,
          count: options.colorCount,
          sampleStride: getSampleStride(
            canvas.width,
            canvas.height,
            preset.targetSamples,
          ),
          ignoreTransparent: options.ignoreTransparent,
        },
        {
          create: () =>
            new Worker(new URL("./worker.ts", import.meta.url), {
              type: "module",
            }),
          parse: (data) => {
            if (!data || typeof data !== "object") {
              throw new Error("PALETTE_WORKER_INVALID_RESULT");
            }
            return data as {
              swatches?: PaletteSwatch[];
              totalPixels?: number;
              error?: boolean;
            };
          },
          error: () => new Error("PALETTE_WORKER_FAILED"),
          signal: abortController.signal,
        },
        [pixels.buffer],
      );
      canvas.width = 0;
      canvas.height = 0;
      void result
        .then(
          (data: {
            swatches?: PaletteSwatch[];
            totalPixels?: number;
            error?: boolean;
          }) => {
            if (extractionAbort.current === abortController)
              extractionAbort.current = null;
            if (current !== revision.current) return;
            if (data.swatches?.length) {
              setSwatches(data.swatches);
              setTotalPixels(data.totalPixels ?? 0);
            } else {
              setError(
                data.error
                  ? m["shared.imagePaletteExtractor.loadFailedError"]()
                  : m["shared.imagePaletteExtractor.noPixelsError"](),
              );
            }
            setBusy(false);
          },
        )
        .catch(() => {
          if (extractionAbort.current === abortController)
            extractionAbort.current = null;
          if (current !== revision.current) return;
          setError(m["shared.imagePaletteExtractor.loadFailedError"]());
          setBusy(false);
        });
    } catch {
      canvas.width = 0;
      canvas.height = 0;
      if (extractionAbort.current === abortController)
        extractionAbort.current = null;
      if (current === revision.current) {
        setError(m["shared.imagePaletteExtractor.loadFailedError"]());
        setBusy(false);
      }
    }
    return () => {
      abortController.abort();
      if (extractionAbort.current === abortController)
        extractionAbort.current = null;
      revision.current += 1;
    };
  }, [options.colorCount, options.ignoreTransparent, options.quality, source]);

  async function select(file: File) {
    stopWorker();
    releaseImage();
    releaseDownloads();
    setSource(null);
    setSwatches([]);
    setTotalPixels(0);
    setError("");
    if (
      !isImageFile(file) ||
      !Number.isSafeInteger(file.size) ||
      file.size <= 0 ||
      file.size > MAX_FILE_BYTES
    ) {
      setError(m["shared.imagePaletteExtractor.invalidFileTypeError"]());
      return;
    }
    const current = revision.current;
    setBusy(true);
    let decoded: ImageBitmap | null = null;
    try {
      decoded = await createImageBitmap(file);
      if (current !== revision.current) {
        decoded.close();
        decoded = null;
        return;
      }
      validateDimensions(decoded);
      const { width, height } = decoded;
      const url = URL.createObjectURL(file);
      bitmap.current = decoded;
      decoded = null;
      previewUrl.current = url;
      setSource({
        name: file.name,
        size: file.size,
        width,
        height,
        url,
      });
    } catch {
      decoded?.close();
      if (current === revision.current)
        setError(m["shared.imagePaletteExtractor.loadFailedError"]());
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }

  function download(content: string, name: string, mime: string) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    downloads.current.set(
      url,
      setTimeout(() => {
        URL.revokeObjectURL(url);
        downloads.current.delete(url);
      }, 1000),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <UploadCard
          locale={locale}
          source={source}
          onSelect={(file) => void select(file)}
          onClear={clear}
        />
        <OptionsCard options={options} disabled={busy} onChange={setOptions} />
      </div>
      <ResultsCard
        source={source}
        swatches={sortedSwatches}
        totalPixels={totalPixels}
        busy={busy}
        error={error}
        onDownload={download}
      />
      <Article />
    </div>
  );
}

export default function ImagePaletteExtractor() {
  return (
    <ToolPage>
      <ImagePaletteExtractorContent />
    </ToolPage>
  );
}
