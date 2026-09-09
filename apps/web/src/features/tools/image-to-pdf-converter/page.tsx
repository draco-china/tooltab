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
  Skeleton,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileText,
  LoaderCircle,
  RefreshCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
import { formatFileSize } from "@/lib/file-size";
import { getLocale } from "@/paraglide/runtime.js";
import {
  checkImageSize,
  checkImageSource,
  type FinishingResult,
  type ImagePdfOptions,
  type ImageSource,
  imagePageSizes,
  imagePdfDefaults,
  MAX_IMAGE_COUNT,
} from "@workspace/tools/pdf/finishing";
import { runFinishingWorker } from "../pdf-finishing/worker-client";

type Entry = {
  id: string;
  source: ImageSource;
  previewUrl: string;
  size: number;
  width: number;
  height: number;
};

const IMAGE_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
];
const IMAGE_EXTENSION = /\.(avif|bmp|gif|jpe?g|png|webp)$/i;

export function imagePdfOutputName(names: readonly string[]) {
  const base =
    names.length === 1
      ? names[0]?.replace(/\.[^.]+$/, "") || "images"
      : names.length > 1
        ? `images-${names.length}-pages`
        : "images";
  const sanitized = base
    .trim()
    .replace(/\.pdf$/i, "")
    .split("")
    .map((character) =>
      '<>:"/\\|?*'.includes(character) || character.charCodeAt(0) <= 31
        ? "-"
        : character,
    )
    .join("")
    .replace(/-+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
  return pdfFilename(sanitized || "images");
}

function readFile(file: File, signal: AbortSignal) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    const close = () => {
      signal.removeEventListener("abort", abort);
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
    };
    const abort = () => reader.abort();
    reader.onload = () => {
      close();
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("read_failed"));
    };
    reader.onerror = () => {
      close();
      reject(reader.error ?? new Error("read_failed"));
    };
    reader.onabort = () => {
      close();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      close();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    reader.readAsArrayBuffer(file);
  });
}

async function readDimensions(file: File, signal: AbortSignal) {
  signal.throwIfAborted();
  if (typeof createImageBitmap === "function") {
    let bitmap: ImageBitmap | null = null;
    try {
      try {
        bitmap = await createImageBitmap(file, {
          imageOrientation: "from-image",
        });
      } catch {
        bitmap = await createImageBitmap(file);
      }
      signal.throwIfAborted();
      checkImageSize(bitmap.width, bitmap.height);
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap?.close();
    }
  }
  if (typeof Image !== "function") throw new Error("unsupported");
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new Image();
        const close = () => {
          signal.removeEventListener("abort", abort);
          image.onload = null;
          image.onerror = null;
        };
        const abort = () => {
          close();
          image.src = "";
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        };
        image.onload = () => {
          close();
          try {
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            checkImageSize(width, height);
            resolve({ width, height });
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = () => {
          close();
          reject(new Error("invalid_image"));
        };
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) {
          abort();
          return;
        }
        image.decoding = "async";
        image.src = url;
      },
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ImageToPdfConverterContent() {
  const id = useId();
  const entriesRef = useRef<Entry[]>([]);
  const task = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const outputUrl = useRef("");
  const addFilesRef = useRef<(files: readonly File[]) => Promise<void>>(
    async () => {},
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [options, setOptions] = useState<ImagePdfOptions>({
    ...imagePdfDefaults,
  });
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [result, setResult] = useState<FinishingResult | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState("");

  const commitEntries = (next: Entry[]) => {
    entriesRef.current = next;
    setEntries(next);
  };
  const clearResult = () => {
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
    outputUrl.current = "";
    setDownloadUrl("");
    setResult(null);
    setProgress(null);
  };
  const cancelTask = () => {
    revision.current++;
    task.current?.abort();
    task.current = null;
    setAdding(false);
    setGenerating(false);
    clearResult();
  };

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  addFilesRef.current = addFiles;

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) void addFilesRef.current(files);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, []);

  useEffect(
    () => () => {
      revision.current++;
      task.current?.abort();
      task.current = null;
      for (const entry of entriesRef.current)
        URL.revokeObjectURL(entry.previewUrl);
      if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
    },
    [],
  );

  async function addFiles(files: readonly File[]) {
    if (!files.length || adding || generating) return;
    cancelTask();
    const controller = new AbortController();
    task.current = controller;
    const run = revision.current;
    const previous = entriesRef.current;
    const signatures = new Set(previous.map((entry) => entry.id));
    const next: Entry[] = [];
    const createdUrls: string[] = [];
    let total = previous.reduce((sum, entry) => sum + entry.size, 0);
    let hadDuplicate = false;
    let hadInvalidType = false;
    let hadInvalidImage = false;
    setAdding(true);
    setError("");
    try {
      if (previous.length + files.length > MAX_IMAGE_COUNT)
        throw new PdfEditingError("too_large");
      for (const file of files) {
        controller.signal.throwIfAborted();
        if (
          !(file.type.startsWith("image/") || IMAGE_EXTENSION.test(file.name))
        ) {
          hadInvalidType = true;
          continue;
        }
        const signature = `${file.name}:${file.size}:${file.lastModified}`;
        if (signatures.has(signature)) {
          hadDuplicate = true;
          continue;
        }
        signatures.add(signature);
        if (total + file.size > MAX_PDF_INPUT)
          throw new PdfEditingError("too_large");
        try {
          const bytes = new Uint8Array(await readFile(file, controller.signal));
          checkImageSource({ bytes, name: file.name, rotation: 0 });
          const dimensions = await readDimensions(file, controller.signal);
          controller.signal.throwIfAborted();
          const previewUrl = URL.createObjectURL(file);
          createdUrls.push(previewUrl);
          next.push({
            id: signature,
            source: { bytes, name: file.name, rotation: 0 },
            previewUrl,
            size: file.size,
            ...dimensions,
          });
          total += file.size;
        } catch (caught) {
          if (controller.signal.aborted) throw caught;
          hadInvalidImage = true;
        }
      }
      if (revision.current !== run || controller.signal.aborted) return;
      if (next.length) {
        commitEntries([...previous, ...next]);
        createdUrls.length = 0;
      }
      setError(
        hadInvalidImage
          ? m["tools.imageToPdfConverter.invalidImageError"]()
          : hadInvalidType
            ? m["tools.imageToPdfConverter.invalidImageTypeError"]()
            : hadDuplicate
              ? m["tools.imageToPdfConverter.duplicateFileError"]()
              : "",
      );
    } catch (caught) {
      if (!controller.signal.aborted && revision.current === run)
        setError(
          caught instanceof PdfEditingError && caught.code === "too_large"
            ? m["tools.imageToPdfConverter.generateFailedError"]()
            : m["tools.imageToPdfConverter.invalidImageError"](),
        );
    } finally {
      for (const url of createdUrls) URL.revokeObjectURL(url);
      if (revision.current === run) {
        task.current = null;
        setAdding(false);
      }
    }
  }

  function updateEntries(update: (current: Entry[]) => Entry[]) {
    cancelTask();
    commitEntries(update(entriesRef.current));
    setError("");
  }

  function clearAll() {
    cancelTask();
    for (const entry of entriesRef.current)
      URL.revokeObjectURL(entry.previewUrl);
    commitEntries([]);
    setError("");
  }

  function removeEntry(entry: Entry) {
    URL.revokeObjectURL(entry.previewUrl);
    updateEntries((current) => current.filter((item) => item.id !== entry.id));
  }

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= entriesRef.current.length) return;
    updateEntries((current) => {
      const next = [...current];
      const moved = next.splice(from, 1)[0];
      if (moved) next.splice(to, 0, moved);
      return next;
    });
  }

  function changeOption<K extends keyof ImagePdfOptions>(
    key: K,
    value: ImagePdfOptions[K],
  ) {
    cancelTask();
    setOptions((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function generate() {
    if (!entriesRef.current.length) {
      setError(m["tools.imageToPdfConverter.noImagesError"]());
      return;
    }
    cancelTask();
    const controller = new AbortController();
    task.current = controller;
    const run = revision.current;
    setGenerating(true);
    setError("");
    setProgress({ done: 0, total: entriesRef.current.length });
    try {
      const output = await runFinishingWorker(
        {
          kind: "images",
          sources: entriesRef.current.map((entry) => entry.source),
          options,
        },
        controller.signal,
        60_000,
        (done, total) => {
          if (revision.current === run) setProgress({ done, total });
        },
      );
      if (controller.signal.aborted || revision.current !== run) return;
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(output.bytes)], { type: "application/pdf" }),
      );
      outputUrl.current = url;
      setDownloadUrl(url);
      setResult(output);
    } catch (caught) {
      if (!controller.signal.aborted && revision.current === run) {
        setError(
          caught instanceof PdfEditingError && caught.code === "unsupported"
            ? m["tools.imageToPdfConverter.canvasUnavailableError"]()
            : m["tools.imageToPdfConverter.generateFailedError"](),
        );
      }
    } finally {
      if (revision.current === run) {
        task.current = null;
        setGenerating(false);
        setProgress(null);
      }
    }
  }

  return (
    <section
      className="flex min-w-0 flex-col gap-6"
      data-tool="image-to-pdf-converter"
      aria-label={m["shared.pdfEditing.finishimagesname"]()}
    >
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <UploadCard
            adding={adding}
            disabled={adding || generating}
            onFiles={addFiles}
          />
          <QueueCard
            entries={entries}
            adding={adding}
            disabled={generating}
            onClear={clearAll}
            onMove={move}
            onRemove={removeEntry}
            onRotate={(entry) =>
              updateEntries((current) =>
                current.map((item) =>
                  item.id === entry.id
                    ? {
                        ...item,
                        source: {
                          ...item.source,
                          rotation: ((item.source.rotation + 90) %
                            360) as ImageSource["rotation"],
                        },
                      }
                    : item,
                ),
              )
            }
          />
        </div>
        <SettingsCard
          disabled={adding || generating}
          generating={generating}
          id={id}
          options={options}
          onChange={changeOption}
          onGenerate={generate}
          canGenerate={entries.length > 0 && !adding && !generating}
        />
      </div>

      {error ? (
        <Alert status="danger">
          <TriangleAlert aria-hidden />
          <Alert.Content>
            <Alert.Title>
              {m["tools.imageToPdfConverter.errorTitle"]()}
            </Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <ResultCard
        generating={generating}
        progress={progress}
        result={result}
        downloadUrl={downloadUrl}
        filename={imagePdfOutputName(entries.map((entry) => entry.source.name))}
      />
      <ImageToPdfArticle />
    </section>
  );
}

function UploadCard({
  adding,
  disabled,
  onFiles,
}: {
  adding: boolean;
  disabled: boolean;
  onFiles: (files: readonly File[]) => Promise<void>;
}) {
  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["tools.imageToAvifConverter.uploadTitle"]()}
        description={m["tools.imageToPdfConverter.uploadDescription"]()}
      />
      <ToolPanelCardContent className="gap-3 py-4">
        <p className="font-medium" aria-live="polite">
          {adding
            ? m["tools.imageToPdfConverter.readingImagesLabel"]()
            : m["tools.imageToPdfConverter.addImagesLabel"]()}
        </p>
        <ToolFilePicker
          label={m["common.formatchoose"]()}
          accept={IMAGE_ACCEPT}
          description={`${m["tools.imageToPdfConverter.pasteHint"]()} ${m[
            "tools.imageToPdfConverter.supportedFormatsLabel"
          ]()}`}
          isDisabled={disabled}
          multiple
          onSelectFiles={(files) => void onFiles(files)}
        />
      </ToolPanelCardContent>
      <ToolPanelCardFooter>
        <p className="text-sm text-muted">
          {m["tools.imageToPdfConverter.localOnlyNote"]()}
        </p>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function QueueCard({
  adding,
  disabled,
  entries,
  onClear,
  onMove,
  onRemove,
  onRotate,
}: {
  adding: boolean;
  disabled: boolean;
  entries: Entry[];
  onClear: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: (entry: Entry) => void;
  onRotate: (entry: Entry) => void;
}) {
  const locale = getLocale();
  const total = entries.reduce((sum, entry) => sum + entry.size, 0);
  return (
    <ToolPanelCard>
      <Card.Header className="flex-row items-start justify-between gap-4 border-b border-separator">
        <div className="min-w-0">
          <Card.Title>{m["tools.imageToPdfConverter.queueTitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.imageToPdfConverter.queueDescription"]()}
          </Card.Description>
        </div>
        <Button
          size="sm"
          variant="outline"
          isDisabled={disabled || !entries.length}
          onPress={onClear}
        >
          <Trash2 aria-hidden className="size-4" />
          {m["shared.pdfEditing.clear"]()}
        </Button>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        {entries.length ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Chip size="sm" variant="secondary">
                {m["shared.markdownTools.images"]()}: {entries.length}
              </Chip>
              <Chip size="sm" variant="tertiary">
                {m["tools.imageToPdfConverter.fileSizeLabel"]()}:{" "}
                {formatFileSize(total, locale)}
              </Chip>
            </div>
            <ol className="flex max-h-144 flex-col gap-3 overflow-y-auto overscroll-contain pe-1">
              {entries.map((entry, index) => (
                <li
                  key={entry.id}
                  className="grid min-w-0 gap-3 rounded-xl border border-border bg-default/20 p-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]"
                >
                  <div className="grid aspect-square place-items-center overflow-hidden rounded-lg border border-border bg-default/30">
                    <img
                      src={entry.previewUrl}
                      alt={m["tools.imageToPdfConverter.previewAlt"]({
                        name: entry.source.name,
                      })}
                      className="max-h-full max-w-full object-contain"
                      style={{
                        transform: `rotate(${entry.source.rotation}deg)`,
                      }}
                    />
                  </div>
                  <div className="min-w-0 self-center">
                    <p className="truncate text-sm font-medium">
                      {entry.source.name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {entry.width} × {entry.height} px
                    </p>
                    <p className="text-sm text-muted">
                      {formatFileSize(entry.size, locale)}
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-1 self-center sm:grid-cols-1">
                    <QueueButton
                      label={`${m["shared.pdfEditing.up"]()}: ${entry.source.name}`}
                      disabled={disabled || index === 0}
                      onPress={() => onMove(index, index - 1)}
                    >
                      <ArrowUp aria-hidden />
                    </QueueButton>
                    <QueueButton
                      label={`${m["shared.pdfEditing.down"]()}: ${entry.source.name}`}
                      disabled={disabled || index === entries.length - 1}
                      onPress={() => onMove(index, index + 1)}
                    >
                      <ArrowDown aria-hidden />
                    </QueueButton>
                    <QueueButton
                      label={`${m["tools.imageToPdfConverter.rotateLabel"]()}: ${entry.source.name}`}
                      disabled={disabled}
                      onPress={() => onRotate(entry)}
                    >
                      <RefreshCcw aria-hidden />
                    </QueueButton>
                    <QueueButton
                      label={`${m["common.faviconremoveimage"]()}: ${entry.source.name}`}
                      disabled={disabled}
                      onPress={() => onRemove(entry)}
                    >
                      <Trash2 aria-hidden />
                    </QueueButton>
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : adding ? (
          <QueueSkeleton
            label={m["tools.imageToPdfConverter.readingImagesLabel"]()}
          />
        ) : (
          <EmptyState
            icon={<FileText aria-hidden className="size-5" />}
            title={m["tools.imageToPdfConverter.emptyQueueTitle"]()}
            description={m["tools.imageToPdfConverter.emptyQueueDescription"]()}
          />
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function QueueButton({
  children,
  disabled,
  label,
  onPress,
}: {
  children: React.ReactNode;
  disabled: boolean;
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
      {children}
    </Button>
  );
}

function SettingsCard({
  canGenerate,
  disabled,
  generating,
  id,
  onChange,
  onGenerate,
  options,
}: {
  canGenerate: boolean;
  disabled: boolean;
  generating: boolean;
  id: string;
  onChange: <K extends keyof ImagePdfOptions>(
    key: K,
    value: ImagePdfOptions[K],
  ) => void;
  onGenerate: () => Promise<void>;
  options: ImagePdfOptions;
}) {
  return (
    <ToolPanelCard className="xl:sticky xl:top-24">
      <PanelHeader
        title={m["tools.imageToPdfConverter.settingsTitle"]()}
        description={m["tools.imageToPdfConverter.settingsDescription"]()}
      />
      <ToolPanelCardContent className="gap-5 py-4">
        <fieldset disabled={disabled} className="grid gap-5">
          <div className="grid gap-2">
            <Select
              variant="secondary"
              selectedKey={options.pageSize}
              onSelectionChange={(value) =>
                onChange("pageSize", value as ImagePdfOptions["pageSize"])
              }
            >
              <Label>{m["tools.imageToPdfConverter.pageSizeLabel"]()}</Label>
              <Select.Trigger id={`${id}-page-size`} className="min-h-11">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {imagePageSizes.map((value) => (
                    <ListBox.Item
                      id={value}
                      key={value}
                      textValue={value.toUpperCase()}
                    >
                      {value.toUpperCase()}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <p className="text-xs leading-5 text-muted">
              {m["tools.imageToPdfConverter.pageSizeDescription"]()}
            </p>
          </div>
          <OptionToggle
            label={m["tools.deviceInformation.orientation"]()}
            disabled={disabled}
            options={[
              ["auto", m["shared.pdfEditing.finishAuto"]()],
              ["portrait", m["shared.pdfEditing.finishPortrait"]()],
              ["landscape", m["shared.pdfEditing.finishLandscape"]()],
            ]}
            value={options.orientation}
            onChange={(value) =>
              onChange("orientation", value as ImagePdfOptions["orientation"])
            }
          />
          <OptionToggle
            label={m["tools.imageToPdfConverter.fitModeLabel"]()}
            description={m["tools.imageToPdfConverter.fitModeDescription"]()}
            disabled={disabled}
            options={[
              ["contain", m["tools.imageToPdfConverter.containFit"]()],
              ["cover", m["tools.imageToPdfConverter.coverFit"]()],
            ]}
            value={options.fit}
            onChange={(value) =>
              onChange("fit", value as ImagePdfOptions["fit"])
            }
          />
          <OptionToggle
            label={m["tools.imageToPdfConverter.qualityLabel"]()}
            description={m["tools.imageToPdfConverter.qualityDescription"]()}
            disabled={disabled}
            options={[
              ["best", m["tools.imageToPdfConverter.bestQuality"]()],
              ["balanced", m["shared.imagePaletteExtractor.qualityBalanced"]()],
              ["small", m["tools.imageToPdfConverter.smallQuality"]()],
            ]}
            value={options.quality}
            onChange={(value) =>
              onChange("quality", value as ImagePdfOptions["quality"])
            }
          />
          <div className="grid gap-3">
            <div className="flex min-h-6 items-center justify-between gap-3">
              <Label htmlFor={`${id}-margin`}>
                {m["shared.barcodeTools.generatorMargin"]()}
              </Label>
              <span className="font-mono text-sm text-muted">
                {options.marginMm} mm
              </span>
            </div>
            <p className="text-xs leading-5 text-muted">
              {m["tools.imageToPdfConverter.marginDescription"]()}
            </p>
            <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_5rem] xl:grid-cols-[minmax(0,1fr)_5rem]">
              <Slider
                aria-label={m["shared.barcodeTools.generatorMargin"]()}
                minValue={0}
                maxValue={40}
                step={1}
                value={options.marginMm}
                className="min-h-11"
                onChange={(value) => onChange("marginMm", Number(value))}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
              <Input
                id={`${id}-margin`}
                aria-label={m["shared.barcodeTools.generatorMargin"]()}
                type="number"
                min={0}
                max={40}
                step={1}
                value={String(options.marginMm)}
                className="min-h-11"
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  onChange(
                    "marginMm",
                    Number.isFinite(value)
                      ? Math.max(0, Math.min(40, Math.round(value)))
                      : imagePdfDefaults.marginMm,
                  );
                }}
              />
            </div>
          </div>
        </fieldset>
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="flex justify-end">
        <Button
          className="min-h-11"
          isDisabled={!canGenerate}
          onPress={() => void onGenerate()}
        >
          {generating ? (
            <LoaderCircle
              aria-hidden
              className="size-4 motion-safe:animate-spin"
            />
          ) : (
            <FileText aria-hidden className="size-4" />
          )}
          {generating
            ? m["tools.imageToPdfConverter.generatingLabel"]()
            : m["shared.pdfEditing.generate"]()}
        </Button>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function OptionToggle({
  description,
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  description?: string;
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  value: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {description ? (
        <p className="text-xs leading-5 text-muted">{description}</p>
      ) : null}
      <ToggleButtonGroup
        selectionMode="single"
        aria-label={label}
        selectedKeys={new Set([value])}
        isDisabled={disabled}
        className={`grid w-full ${options.length === 3 ? "grid-cols-3" : "grid-cols-2"} [&_button]:min-h-11 [&_button]:min-w-0 [&_button]:whitespace-normal`}
        onSelectionChange={(selection) => {
          const next = String([...selection][0] ?? "");
          if (next) onChange(next);
        }}
      >
        {options.map(([key, text]) => (
          <ToggleButton key={key} id={key}>
            {text}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}

function ResultCard({
  downloadUrl,
  filename,
  generating,
  progress,
  result,
}: {
  downloadUrl: string;
  filename: string;
  generating: boolean;
  progress: { done: number; total: number } | null;
  result: FinishingResult | null;
}) {
  const progressLabel = progress
    ? m["tools.imageToPdfConverter.progressLabel"]({
        completed: progress.done,
        total: progress.total,
      })
    : m["tools.imageToPdfConverter.generatingLabel"]();
  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["shared.macIntegrity.result"]()}
        description={m["tools.imageToPdfConverter.resultDescription"]()}
      />
      <ToolPanelCardContent className="gap-4 py-4" aria-live="polite">
        {generating ? (
          <ResultSkeleton label={progressLabel} progress={progress} />
        ) : result ? (
          <div className="grid gap-4 rounded-xl border border-border bg-default/20 p-4">
            <div>
              <h3 className="font-medium">
                {m["tools.imageToPdfConverter.resultReadyTitle"]()}
              </h3>
              <p className="mt-1 text-sm break-all text-muted">{filename}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip size="sm" variant="secondary">
                {m["shared.pdfEditing.pages"]()}: {result.pages}
              </Chip>
              <Chip size="sm" variant="tertiary">
                {m["tools.highwayhashHashTextOrFile.outputSizeLabel"]()}:{" "}
                {formatFileSize(result.bytes.length, getLocale())}
              </Chip>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<FileText aria-hidden className="size-5" />}
            title={m["tools.imageToPdfConverter.emptyResultTitle"]()}
            description={m[
              "tools.imageToPdfConverter.emptyResultDescription"
            ]()}
          />
        )}
      </ToolPanelCardContent>
      {result && downloadUrl ? (
        <ToolPanelCardFooter className="flex justify-end">
          <a
            href={downloadUrl}
            download={filename}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <Download aria-hidden className="size-4" />
            {m["shared.pdfEditing.download"]()}
          </a>
        </ToolPanelCardFooter>
      ) : null}
    </ToolPanelCard>
  );
}

function QueueSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid gap-3"
    >
      <div className="flex gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-32 rounded-full" />
      </div>
      {[0, 1].map((key) => (
        <div
          key={key}
          className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_2.5rem]"
        >
          <Skeleton className="aspect-square rounded-lg" />
          <div className="grid content-center gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function ResultSkeleton({
  label,
  progress,
}: {
  label: string;
  progress: { done: number; total: number } | null;
}) {
  const value = progress?.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid min-h-56 content-center gap-4"
    >
      <Skeleton className="mx-auto h-10 w-10 rounded-full" />
      <Skeleton className="mx-auto h-5 w-40" />
      <p className="text-center text-sm text-muted">{label}</p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 overflow-hidden rounded-full bg-default"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function EmptyState({
  description,
  icon,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="rounded-full bg-default p-3">{icon}</div>
      <div className="grid gap-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-lg text-sm leading-6 text-muted">{description}</p>
      </div>
    </div>
  );
}

function PanelHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
  );
}

function ImageToPdfArticle() {
  return (
    <ToolArticle>
      <p>{m["tools.imageToPdfConverter.articleIntro"]()}</p>
      <h2>{m["tools.archiveViewer.article.whenTitle"]()}</h2>
      <p>{m["tools.imageToPdfConverter.articleWhenBody"]()}</p>
      <h2>{m["tools.imageToPdfConverter.articleLayoutTitle"]()}</h2>
      <p>{m["tools.imageToPdfConverter.articleLayoutBody"]()}</p>
      <h2>{m["tools.gifToAnimatedWebpConverter.article.privacyTitle"]()}</h2>
      <p>{m["tools.imageToPdfConverter.articlePrivacyBody"]()}</p>
    </ToolArticle>
  );
}

export function ImageToPdfConverter() {
  return (
    <ToolPage>
      <ImageToPdfConverterContent />
    </ToolPage>
  );
}
