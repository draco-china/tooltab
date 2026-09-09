import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  Slider,
  Switch,
} from "@heroui/react";
import {
  Download,
  ImageUp,
  LoaderCircle,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { buttonVariants } from "@heroui/styles";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { decodeImage, renderImage } from "@/lib/browser-image";
import { formatFileSize } from "@/lib/file-size";
import {
  type ImageFormat,
  outputFilename,
  resizeDimensions,
} from "@workspace/tools/image/options";
import { getLocale } from "@/paraglide/runtime.js";

export type ResizeAlgorithm = "high-quality" | "balanced" | "pixelated";
type ResizeFormat = ImageFormat | "auto";
type Source = {
  file: File;
  url: string;
  width: number;
  height: number;
};
type ResizeResult = {
  blob: Blob;
  url: string;
  name: string;
  width: number;
  height: number;
  mimeType: string;
};
type Options = {
  width: number;
  height: number;
  keepAspectRatio: boolean;
  allowUpscale: boolean;
  algorithm: ResizeAlgorithm;
  outputFormat: ResizeFormat;
  quality: number;
};

const DEFAULT_OPTIONS: Options = {
  width: 1920,
  height: 1080,
  keepAspectRatio: true,
  allowUpscale: false,
  algorithm: "high-quality",
  outputFormat: "auto",
  quality: 92,
};
const OPTION_STORAGE_KEY = "tools:image-resizer:options";
const IMAGE_ACCEPT = ["image/png", "image/jpeg", "image/webp"];

export function constrainResize(
  requested: { width: number; height: number },
  source: { width: number; height: number },
  allowUpscale: boolean,
) {
  return allowUpscale
    ? requested
    : {
        width: Math.min(requested.width, source.width),
        height: Math.min(requested.height, source.height),
      };
}

function sourceFormat(type: string): ImageFormat {
  return type === "image/jpeg"
    ? "jpeg"
    : type === "image/webp"
      ? "webp"
      : "png";
}

function ImageResizerContent() {
  const locale = getLocale();
  const inputId = useId();
  const bitmap = useRef<ImageBitmap | null>(null);
  const task = useRef<AbortController | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<ResizeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"invalid" | "resize" | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OPTION_STORAGE_KEY);
      if (stored) setOptions(readStoredOptions(stored));
    } catch {
      // Ignore unavailable or malformed storage.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(OPTION_STORAGE_KEY, JSON.stringify(options));
    } catch {
      // Resizing still works when storage is unavailable.
    }
  }, [options, storageReady]);

  useEffect(
    () => () => {
      const active = task.current;
      task.current = null;
      active?.abort();
      bitmap.current?.close();
      bitmap.current = null;
    },
    [],
  );

  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source.url);
    },
    [source],
  );

  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );

  function cancel() {
    const active = task.current;
    task.current = null;
    active?.abort();
    setBusy(false);
  }

  async function select(file: File) {
    cancel();
    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    setError(null);
    let nextImage: ImageBitmap | null = null;
    let nextUrl: string | null = null;
    try {
      nextImage = await decodeImage(file, controller.signal);
      controller.signal.throwIfAborted();
      nextUrl = URL.createObjectURL(file);
      controller.signal.throwIfAborted();
      const { width, height } = nextImage;
      bitmap.current?.close();
      bitmap.current = nextImage;
      setSource({
        file,
        url: nextUrl,
        width,
        height,
      });
      setOptions((current) => ({
        ...current,
        width,
        height,
      }));
      nextImage = null;
      nextUrl = null;
      setResult(null);
    } catch {
      if (!controller.signal.aborted) setError("invalid");
    } finally {
      nextImage?.close();
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      if (task.current === controller) {
        task.current = null;
        setBusy(false);
      }
    }
  }

  function clearSource() {
    cancel();
    bitmap.current?.close();
    bitmap.current = null;
    setSource(null);
    setResult(null);
    setError(null);
    setOptions(DEFAULT_OPTIONS);
  }

  function updateOptions(update: (current: Options) => Options) {
    setResult(null);
    setError(null);
    setOptions(update);
  }

  function updateDimension(axis: "width" | "height", value: number) {
    if (!source) {
      updateOptions((current) => ({ ...current, [axis]: value }));
      return;
    }
    try {
      const dimensions = resizeDimensions(
        source,
        axis,
        value,
        options.keepAspectRatio,
        options,
      );
      updateOptions((current) => ({ ...current, ...dimensions }));
    } catch {
      setResult(null);
      setError("resize");
      setOptions((current) => ({ ...current, [axis]: value }));
    }
  }

  async function generate() {
    if (task.current || !bitmap.current || !source) return;
    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    let resized: ImageBitmap | null = null;
    try {
      const size = constrainResize(
        { width: options.width, height: options.height },
        source,
        options.allowUpscale,
      );
      const outputFormat =
        options.outputFormat === "auto"
          ? sourceFormat(source.file.type)
          : options.outputFormat;
      resized = await createImageBitmap(bitmap.current, {
        resizeWidth: size.width,
        resizeHeight: size.height,
        resizeQuality:
          options.algorithm === "high-quality"
            ? "high"
            : options.algorithm === "balanced"
              ? "medium"
              : "pixelated",
      });
      controller.signal.throwIfAborted();
      const blob = await renderImage(
        resized,
        size,
        outputFormat,
        options.quality,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        name: outputFilename(source.file.name, outputFormat),
        width: size.width,
        height: size.height,
        mimeType: blob.type,
      });
    } catch {
      if (!controller.signal.aborted) setError("resize");
    } finally {
      resized?.close();
      if (task.current === controller) {
        task.current = null;
        setBusy(false);
      }
    }
  }

  function resetOptions() {
    setResult(null);
    setError(null);
    setOptions({
      ...DEFAULT_OPTIONS,
      width: source?.width ?? DEFAULT_OPTIONS.width,
      height: source?.height ?? DEFAULT_OPTIONS.height,
    });
  }

  const fileSize = (bytes: number) => formatFileSize(bytes, locale);

  return (
    <div className="grid gap-8">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <UploadCard
          busy={busy}
          fileSize={fileSize}
          onClear={clearSource}
          onSelect={select}
          source={source}
        />
        <OptionsCard
          busy={busy}
          inputId={inputId}
          onCancel={cancel}
          onGenerate={generate}
          onReset={resetOptions}
          options={options}
          setOptions={updateOptions}
          source={source}
          updateDimension={updateDimension}
        />
      </div>

      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {error === "invalid"
                ? m["tools.imageResizer.invalidImageTitle"]()
                : m["tools.imageResizer.resizeErrorTitle"]()}
            </Alert.Title>
            <Alert.Description>
              {error === "invalid"
                ? m["tools.imageResizer.invalidImageDescription"]()
                : m["tools.imageResizer.resizeErrorDescription"]()}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <ResultCard fileSize={fileSize} result={result} source={source} />
      <ImageResizerArticle />
    </div>
  );
}

function UploadCard({
  busy,
  fileSize,
  onClear,
  onSelect,
  source,
}: {
  busy: boolean;
  fileSize: (bytes: number) => string;
  onClear: () => void;
  onSelect: (file: File) => void;
  source: Source | null;
}) {
  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["tools.imageResizer.uploadTitle"]()}
        description={m["tools.imageResizer.uploadDescription"]()}
      />
      <ToolPanelCardContent className="gap-4 py-4">
        {source ? (
          <>
            <div className="grid min-h-72 place-items-center overflow-hidden rounded-xl border border-border bg-default/30 p-3">
              <img
                src={source.url}
                alt={m["tools.imageResizer.giforiginal"]()}
                className="max-h-72 max-w-full object-contain"
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Chip size="sm" variant="tertiary" className="font-mono">
                {source.width} × {source.height}
              </Chip>
              <Chip size="sm" variant="secondary">
                {fileSize(source.file.size)}
              </Chip>
            </div>
          </>
        ) : null}
        <ToolFilePicker
          label={
            source
              ? m["common.change"]()
              : m["tools.faviconAssetsGenerator.chooseImageLabel"]()
          }
          accept={IMAGE_ACCEPT}
          fileName={source?.file.name}
          description={
            source
              ? m["tools.imageResizer.localFileLimit"]()
              : m["tools.imageResizer.uploadHint"]()
          }
          clearLabel={m["tools.imageResizer.localClearLabel"]()}
          isDisabled={busy}
          onSelect={(file) => void onSelect(file)}
          onClear={source ? onClear : undefined}
        />
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function OptionsCard({
  busy,
  inputId,
  onCancel,
  onGenerate,
  onReset,
  options,
  setOptions,
  source,
  updateDimension,
}: {
  busy: boolean;
  inputId: string;
  onCancel: () => void;
  onGenerate: () => Promise<void>;
  onReset: () => void;
  options: Options;
  setOptions: (update: (current: Options) => Options) => void;
  source: Source | null;
  updateDimension: (axis: "width" | "height", value: number) => void;
}) {
  const algorithms = [
    ["high-quality", m["tools.imageResizer.algorithmHighQuality"]()],
    ["balanced", m["tools.imageResizer.algorithmBalanced"]()],
    ["pixelated", m["tools.imageResizer.algorithmPixelated"]()],
  ] as const;
  const formats = [
    ["auto", m["shared.pdfEditing.finishAuto"]()],
    ["png", m["tools.codeScreenshotGenerator.downloadPngLabel"]()],
    ["jpeg", m["tools.codeScreenshotGenerator.downloadJpegLabel"]()],
    ["webp", m["tools.codeScreenshotGenerator.downloadWebpLabel"]()],
  ] as const;

  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["tools.imageResizer.optionsTitle"]()}
        description={m["tools.imageResizer.optionsDescription"]()}
      />
      <ToolPanelCardContent className="gap-5 py-4">
        <fieldset disabled={busy} className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            {(["width", "height"] as const).map((axis) => (
              <div key={axis} className="grid gap-2">
                <Label htmlFor={`${inputId}-${axis}`}>
                  {axis === "width"
                    ? m["common.width"]()
                    : m["tools.svgToImage.height"]()}
                </Label>
                <Input
                  id={`${inputId}-${axis}`}
                  aria-label={
                    axis === "width"
                      ? m["common.width"]()
                      : m["tools.svgToImage.height"]()
                  }
                  type="number"
                  min={1}
                  max={8192}
                  value={String(options[axis])}
                  className="min-h-11"
                  onChange={(event) =>
                    updateDimension(
                      axis,
                      Math.max(1, Number(event.currentTarget.value) || 1),
                    )
                  }
                />
              </div>
            ))}
          </div>

          <OptionSelect
            label={m["tools.imageResizer.algorithmLabel"]()}
            options={algorithms}
            value={options.algorithm}
            onChange={(value) =>
              setOptions((current) => ({
                ...current,
                algorithm: value as ResizeAlgorithm,
              }))
            }
          />
          <OptionSelect
            label={m["tools.svgToImage.format"]()}
            options={formats}
            value={options.outputFormat}
            onChange={(value) =>
              setOptions((current) => ({
                ...current,
                outputFormat: value as ResizeFormat,
              }))
            }
          />

          <div className="grid gap-2">
            <div className="flex min-h-6 items-center justify-between gap-3">
              <Label>{m["common.formatquality"]()}</Label>
              <span className="font-mono text-sm text-muted">
                {options.quality}
              </span>
            </div>
            <Slider
              aria-label={m["common.formatquality"]()}
              minValue={1}
              maxValue={100}
              value={options.quality}
              className="min-h-11"
              onChange={(value) =>
                setOptions((current) => ({
                  ...current,
                  quality: Number(value),
                }))
              }
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            <p className="text-xs leading-5 text-muted">
              {m["tools.imageResizer.qualityDescription"]()}
            </p>
          </div>

          <div className="flex min-h-16 items-center justify-between gap-4 rounded-xl border border-border bg-default/20 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {m["tools.imageResizer.keepAspectRatioLabel"]()}
              </p>
              <p className="text-xs leading-5 text-muted">
                {m["tools.imageResizer.keepAspectRatioDescription"]()}
              </p>
            </div>
            <Switch
              aria-label={m["tools.imageResizer.keepAspectRatioLabel"]()}
              isSelected={options.keepAspectRatio}
              onChange={(selected) =>
                setOptions((current) => ({
                  ...current,
                  keepAspectRatio: selected === true,
                }))
              }
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>

          <Switch
            aria-label={m["tools.imageResizer.allowUpscaleLabel"]()}
            isSelected={options.allowUpscale}
            onChange={(selected) =>
              setOptions((current) => ({
                ...current,
                allowUpscale: selected === true,
              }))
            }
          >
            <Switch.Content className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border border-border bg-default/20 px-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {m["tools.imageResizer.allowUpscaleLabel"]()}
                </span>
                <span className="block text-xs leading-5 text-muted">
                  {m["tools.imageResizer.allowUpscaleDescription"]()}
                </span>
              </span>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </fieldset>
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          isDisabled={busy}
          onPress={onReset}
        >
          <RefreshCcw aria-hidden className="size-4" />
          {m["tools.svgOptimizer.reset"]()}
        </Button>
        <div className="flex items-center gap-2">
          {busy ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={onCancel}
            >
              {m["common.actions.cancel"]()}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            isDisabled={!source || busy}
            onPress={() => void onGenerate()}
          >
            {busy ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
            ) : null}
            {m["tools.imageResizer.resizeLabel"]()}
          </Button>
        </div>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function OptionSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  value: string;
}) {
  return (
    <Select
      aria-label={label}
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key) onChange(String(key));
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger className="min-h-11 w-full">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map(([optionValue, optionLabel]) => (
            <ListBox.Item
              key={optionValue}
              id={optionValue}
              textValue={optionLabel}
            >
              {optionLabel}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function ResultCard({
  fileSize,
  result,
  source,
}: {
  fileSize: (bytes: number) => string;
  result: ResizeResult | null;
  source: Source | null;
}) {
  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["tools.imageResizer.resultTitle"]()}
        description={m["tools.imageResizer.resultDescription"]()}
        actions={
          result ? (
            <a
              href={result.url}
              download={result.name}
              className={buttonVariants({ size: "sm", variant: "primary" })}
            >
              <Download aria-hidden className="size-4" />
              {m["common.listslugDownload"]()}
            </a>
          ) : null
        }
      />
      <ToolPanelCardContent className="gap-5 py-4">
        {result && source ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Preview
                label={m["tools.imageResizer.giforiginal"]()}
                dimensions={`${source.width} × ${source.height}`}
                src={source.url}
              />
              <Preview
                label={m["tools.imageResizer.outputLabel"]()}
                dimensions={`${result.width} × ${result.height}`}
                src={result.url}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" variant="secondary">
                {result.mimeType}
              </Chip>
              <Chip size="sm" variant="secondary">
                {fileSize(result.blob.size)}
              </Chip>
            </div>
          </>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/20 p-6 text-center">
            <div className="rounded-full bg-default p-3">
              <ImageUp aria-hidden className="size-5" />
            </div>
            <div className="grid gap-1">
              <p className="font-medium">
                {m["tools.imageResizer.emptyResultTitle"]()}
              </p>
              <p className="max-w-lg text-sm leading-6 text-muted">
                {m["tools.imageResizer.emptyResultDescription"]()}
              </p>
            </div>
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function Preview({
  dimensions,
  label,
  src,
}: {
  dimensions: string;
  label: string;
  src: string;
}) {
  return (
    <figure className="grid gap-3">
      <figcaption className="flex items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Chip size="sm" variant="tertiary" className="font-mono">
          {dimensions}
        </Chip>
      </figcaption>
      <div className="grid min-h-64 place-items-center overflow-hidden rounded-xl border border-border bg-default/30 p-3">
        <img
          src={src}
          alt={label}
          className="max-h-72 max-w-full object-contain"
        />
      </div>
    </figure>
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

function ImageResizerArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.imageResizer.articleWhatTitle"]()}</h2>
      <p>{m["tools.imageResizer.articleWhatBody"]()}</p>
      <h2>{m["tools.imageMetadataCleaner.article.useTitle"]()}</h2>
      <ul>
        <li>{m["tools.imageResizer.articleUses0"]()}</li>
        <li>{m["tools.imageResizer.articleUses1"]()}</li>
        <li>{m["tools.imageResizer.articleUses2"]()}</li>
      </ul>
      <h2>{m["tools.imageResizer.articlePipelineTitle"]()}</h2>
      <ul>
        <li>{m["tools.imageResizer.articlePipeline0"]()}</li>
        <li>{m["tools.imageResizer.articlePipeline1"]()}</li>
        <li>{m["tools.imageResizer.articlePipeline2"]()}</li>
      </ul>
    </ToolArticle>
  );
}

function readStoredOptions(stored: string): Options {
  const value = JSON.parse(stored) as Partial<Options>;
  const dimension = (candidate: unknown, fallback: number) =>
    typeof candidate === "number" &&
    Number.isInteger(candidate) &&
    candidate >= 1 &&
    candidate <= 8192
      ? candidate
      : fallback;
  return {
    width: dimension(value.width, DEFAULT_OPTIONS.width),
    height: dimension(value.height, DEFAULT_OPTIONS.height),
    keepAspectRatio:
      typeof value.keepAspectRatio === "boolean"
        ? value.keepAspectRatio
        : DEFAULT_OPTIONS.keepAspectRatio,
    allowUpscale:
      typeof value.allowUpscale === "boolean"
        ? value.allowUpscale
        : DEFAULT_OPTIONS.allowUpscale,
    algorithm: ["high-quality", "balanced", "pixelated"].includes(
      value.algorithm ?? "",
    )
      ? (value.algorithm as ResizeAlgorithm)
      : DEFAULT_OPTIONS.algorithm,
    outputFormat: ["auto", "png", "jpeg", "webp"].includes(
      value.outputFormat ?? "",
    )
      ? (value.outputFormat as ResizeFormat)
      : DEFAULT_OPTIONS.outputFormat,
    quality:
      typeof value.quality === "number" &&
      Number.isInteger(value.quality) &&
      value.quality >= 1 &&
      value.quality <= 100
        ? value.quality
        : DEFAULT_OPTIONS.quality,
  };
}

export default function ImageResizer() {
  return (
    <ToolPage>
      <ImageResizerContent />
    </ToolPage>
  );
}
