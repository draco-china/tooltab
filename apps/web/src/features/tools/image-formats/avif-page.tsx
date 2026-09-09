import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Skeleton,
  Slider,
  Switch,
} from "@heroui/react";
import { Download, ImageIcon, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { formatFileSize } from "@/lib/file-size";
import { getLocale } from "@/paraglide/runtime.js";
import { convertBrowser, decodeBrowser, zipBrowser } from "./browser";
import {
  type AvifOptions,
  avifDefaults,
  type FormatCode,
  ImageFormatError,
  MAX_FORMAT_FILES,
  MAX_FORMAT_INPUT,
  MAX_FORMAT_OUTPUT,
  outputName,
  validateSettings,
} from "@workspace/tools/image";

type AvifResult = {
  name: string;
  url: string;
  bytes: Uint8Array<ArrayBuffer>;
  inputBytes: number;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
};

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function isSupportedImage(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/i.test(
      file.name,
    )
  );
}

function ImageToAvifConverterContent() {
  const locale = getLocale();
  const fieldId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<AvifOptions>({ ...avifDefaults });
  const [results, setResults] = useState<AvifResult[]>([]);
  const [zipUrl, setZipUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());

  function releaseUrls() {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
  }

  function invalidate() {
    revision.current += 1;
    controller.current?.abort();
    controller.current = null;
    releaseUrls();
    setResults([]);
    setZipUrl("");
    setBusy(false);
    setDone(0);
  }

  function resetOutput() {
    invalidate();
    setError("");
  }

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
      controller.current = null;
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    },
    [],
  );

  function addFiles(incoming: File[]) {
    if (!incoming.length) return;
    resetOutput();
    const existing = new Set(files.map(fileKey));
    const next = [...files];
    let duplicate = false;
    let invalid = false;
    for (const file of incoming) {
      if (!isSupportedImage(file)) {
        invalid = true;
        continue;
      }
      const key = fileKey(file);
      if (existing.has(key)) {
        duplicate = true;
        continue;
      }
      existing.add(key);
      next.push(file);
    }
    if (
      next.length > MAX_FORMAT_FILES ||
      next.reduce((total, file) => total + file.size, 0) > MAX_FORMAT_INPUT
    ) {
      setError(m["tools.imageToAvifConverter.invalidFileTypeError"]());
      return;
    }
    setFiles(next);
    if (invalid)
      setError(m["tools.imageToAvifConverter.invalidFileTypeError"]());
    else if (duplicate)
      setError(m["tools.imageToAvifConverter.duplicateFileError"]());
  }

  function updateOption<Key extends keyof AvifOptions>(
    key: Key,
    value: AvifOptions[Key],
  ) {
    resetOutput();
    setOptions((current) => ({ ...current, [key]: value }));
  }

  function errorMessage(code: FormatCode) {
    if (code === "invalid_image")
      return m["tools.imageToAvifConverter.invalidImageError"]();
    if (code === "unsupported")
      return m["tools.imageToAvifConverter.workerUnsupportedError"]();
    return m["tools.imageToAvifConverter.conversionFailedError"]();
  }

  async function convert() {
    if (!files.length || busy) {
      if (!files.length)
        setError(m["tools.imageToAvifConverter.noFilesError"]());
      return;
    }
    resetOutput();
    const current = revision.current;
    const abort = new AbortController();
    controller.current = abort;
    const deadline = window.setTimeout(
      () => abort.abort(new ImageFormatError("timeout")),
      120_000,
    );
    const output: AvifResult[] = [];
    const usedNames = new Set<string>();
    let failed = 0;
    let outputBytes = 0;
    setBusy(true);
    try {
      validateSettings({ kind: "avif", options });
      for (const file of files) {
        try {
          const raster = await decodeBrowser(file, abort.signal);
          const originalWidth = raster.width;
          const originalHeight = raster.height;
          const result = await convertBrowser(
            raster,
            { kind: "avif", options },
            abort.signal,
          );
          abort.signal.throwIfAborted();
          if (revision.current !== current) return;
          outputBytes += result.bytes.length;
          if (outputBytes > MAX_FORMAT_OUTPUT) {
            throw new ImageFormatError("output_limit");
          }
          const url = URL.createObjectURL(
            new Blob([result.bytes], { type: "image/avif" }),
          );
          urls.current.add(url);
          output.push({
            ...result,
            name: outputName(file.name, "avif", usedNames),
            url,
            inputBytes: file.size,
            originalWidth,
            originalHeight,
          });
          setResults([...output]);
        } catch (cause) {
          if (abort.signal.aborted) throw cause;
          failed += 1;
          if (cause instanceof ImageFormatError) {
            setError(errorMessage(cause.code));
          }
        }
        if (revision.current === current) setDone(output.length + failed);
      }
      if (failed > 0 && output.length > 0) {
        setError(m["tools.imageToAvifConverter.partialConversionError"]());
      } else if (failed > 0) {
        setError(m["tools.imageToAvifConverter.conversionFailedError"]());
      }
      if (output.length > 1) {
        try {
          const archive = await zipBrowser(
            output.map((result) => ({
              name: result.name,
              bytes: result.bytes,
            })),
            abort.signal,
          );
          if (archive.length > MAX_FORMAT_OUTPUT) {
            throw new ImageFormatError("output_limit");
          }
          if (revision.current !== current) return;
          const url = URL.createObjectURL(
            new Blob([archive], { type: "application/zip" }),
          );
          urls.current.add(url);
          setZipUrl(url);
        } catch (cause) {
          if (abort.signal.aborted) throw cause;
          setError(m["tools.imageToAvifConverter.zipFailedError"]());
        }
      }
    } catch (cause) {
      if (
        revision.current === current &&
        (!abort.signal.aborted ||
          abort.signal.reason instanceof ImageFormatError)
      ) {
        setError(
          cause instanceof ImageFormatError
            ? errorMessage(cause.code)
            : m["tools.imageToAvifConverter.conversionFailedError"](),
        );
      }
    } finally {
      window.clearTimeout(deadline);
      if (revision.current === current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  const totalInput = results.reduce(
    (total, result) => total + result.inputBytes,
    0,
  );
  const totalOutput = results.reduce(
    (total, result) => total + result.bytes.length,
    0,
  );
  const sizeChange = (input: number, output: number) =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 1,
      signDisplay: "exceptZero",
    }).format(input ? (input - output) / input : 0);

  return (
    <div className="grid min-w-0 gap-8">
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.imageToAvifConverter.uploadTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.imageToAvifConverter.uploadDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <ToolFilePicker
              label={m["tools.imageToAvifConverter.chooseImagesLabel"]()}
              description={`${m["tools.imageToAvifConverter.uploadHint"]()} ${m["tools.imageToAvifConverter.supportedFormatsLabel"]()}`}
              accept={["image/*", ".svg", ".tif", ".tiff", ".heic", ".heif"]}
              multiple
              isDisabled={busy}
              onSelectFiles={addFiles}
            />
            {files.length ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Chip size="sm" variant="secondary">
                    {m["tools.imageToAvifConverter.selectedImagesLabel"]()}:{" "}
                    {files.length}
                  </Chip>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      resetOutput();
                      setFiles([]);
                    }}
                  >
                    {m["shared.pdfEditing.clear"]()}
                  </Button>
                </div>
                <ul className="grid gap-2">
                  {files.map((file) => (
                    <li
                      key={fileKey(file)}
                      className="bg-field-background flex min-w-0 items-center gap-3 rounded-xl border border-border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted">
                          {formatFileSize(file.size, locale)}
                        </p>
                      </div>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={`${m["common.faviconremoveimage"]()}: ${file.name}`}
                        onPress={() => {
                          resetOutput();
                          setFiles((currentFiles) =>
                            currentFiles.filter(
                              (currentFile) =>
                                fileKey(currentFile) !== fileKey(file),
                            ),
                          );
                        }}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.gifToAnimatedWebpConverter.optionsTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.imageToAvifConverter.optionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            {(
              [
                [
                  "quality",
                  m["common.formatquality"](),
                  m["tools.imageToAvifConverter.qualityDescription"](),
                  0,
                  100,
                ],
                [
                  "scale",
                  m["tools.gifToAnimatedWebpConverter.scaleLabel"](),
                  m["tools.imageToAvifConverter.scaleDescription"](),
                  10,
                  400,
                ],
                [
                  "speed",
                  m["common.unitcategoryspeed"](),
                  m["tools.imageToAvifConverter.speedDescription"](),
                  0,
                  10,
                ],
              ] as const
            ).map(([key, label, description, min, max]) => (
              <div key={key} className="grid gap-3">
                <div className="grid gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor={`${fieldId}-${key}`}
                      className="text-sm font-medium"
                    >
                      {label}
                    </label>
                    <output className="font-mono text-sm text-muted">
                      {options[key]}
                      {key === "speed" ? "" : "%"}
                    </output>
                  </div>
                  <p className="text-xs leading-5 text-muted">{description}</p>
                </div>
                <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_5rem]">
                  <Slider
                    aria-label={label}
                    minValue={min}
                    maxValue={max}
                    value={options[key]}
                    isDisabled={busy || (key === "quality" && options.lossless)}
                    onChange={(value) => updateOption(key, Number(value))}
                  >
                    <Slider.Track>
                      <Slider.Fill />
                      <Slider.Thumb />
                    </Slider.Track>
                  </Slider>
                  <Input
                    id={`${fieldId}-${key}`}
                    aria-label={label}
                    type="number"
                    min={min}
                    max={max}
                    value={String(options[key])}
                    disabled={busy || (key === "quality" && options.lossless)}
                    onChange={(event) =>
                      updateOption(key, Number(event.target.value))
                    }
                  />
                </div>
              </div>
            ))}
            <Switch
              aria-label={m["common.formatlossless"]()}
              className="bg-field-background min-h-20 w-full rounded-xl border border-border px-4 py-3"
              isSelected={options.lossless}
              isDisabled={busy}
              onChange={(selected) =>
                updateOption("lossless", selected === true)
              }
            >
              <Switch.Content className="flex min-h-14 w-full items-center justify-between gap-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {m["common.formatlossless"]()}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted">
                    {m["tools.imageToAvifConverter.losslessDescription"]()}
                  </span>
                </span>
                <Switch.Control className="shrink-0 self-center">
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-end gap-2">
            {busy ? (
              <Button variant="outline" onPress={invalidate}>
                {m["common.actions.cancel"]()}
              </Button>
            ) : null}
            <Button
              isDisabled={!files.length || busy}
              onPress={() => void convert()}
            >
              <Sparkles aria-hidden className="size-4" />
              {busy
                ? m["tools.imageToAvifConverter.convertingLabel"]()
                : m["tools.imageToAvifConverter.convertLabel"]()}
            </Button>
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>

      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {m["tools.gifToAnimatedWebpConverter.errorTitle"]()}
            </Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>
            {m["tools.imageToAvifConverter.resultTitle"]()}
          </Card.Title>
          <Card.Description>
            {m["tools.imageToAvifConverter.resultDescription"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent aria-live="polite" className="gap-5 py-4">
          {busy && !results.length ? (
            <div
              role="status"
              aria-label={m["tools.imageToAvifConverter.convertingLabel"]()}
              className="grid gap-4 sm:grid-cols-2"
            >
              <span className="sr-only">
                {m["tools.imageToAvifConverter.convertingLabel"]()} {done}/
                {files.length}
              </span>
              {[0, 1].map((item) => (
                <div
                  key={item}
                  className="grid gap-3 rounded-xl border border-border p-4"
                >
                  <Skeleton className="aspect-video w-full" />
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : results.length ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Chip size="sm" variant="secondary">
                  {results.length} {m["common.devOutput"]()}
                </Chip>
                <Chip size="sm" variant="tertiary">
                  {m["tools.imageToAvifConverter.totalSavedLabel"]()}:{" "}
                  {sizeChange(totalInput, totalOutput)}
                </Chip>
                <Chip size="sm" variant="tertiary">
                  {formatFileSize(totalOutput, locale)}
                </Chip>
              </div>
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {results.map((result) => (
                  <Card key={result.url} className="gap-0 overflow-hidden p-0">
                    <Card.Content className="grid gap-4 p-4">
                      <div className="grid min-h-44 place-items-center rounded-xl border border-border bg-default/40 p-3">
                        <img
                          src={result.url}
                          alt={result.name}
                          className="max-h-52 max-w-full rounded-lg object-contain"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {result.name}
                        </p>
                        <Chip className="mt-2" size="sm" variant="secondary">
                          AVIF
                        </Chip>
                      </div>
                      <dl className="grid gap-2 text-sm text-muted">
                        <div className="flex justify-between gap-3">
                          <dt>{m["common.original"]()}</dt>
                          <dd className="text-right text-foreground">
                            {result.originalWidth} × {result.originalHeight},{" "}
                            {formatFileSize(result.inputBytes, locale)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>{m["common.devOutput"]()}</dt>
                          <dd className="text-right text-foreground">
                            {result.width} × {result.height},{" "}
                            {formatFileSize(result.bytes.length, locale)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>
                            {m["tools.imageToAvifConverter.savedLabel"]()}
                          </dt>
                          <dd className="text-right text-foreground">
                            {sizeChange(result.inputBytes, result.bytes.length)}
                          </dd>
                        </div>
                      </dl>
                    </Card.Content>
                    <Card.Footer className="justify-end border-t border-border p-3">
                      <a
                        href={result.url}
                        download={result.name}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium transition outline-none hover:bg-default focus-visible:ring-2 focus-visible:ring-focus/25"
                      >
                        <Download aria-hidden className="size-4" />
                        {m["tools.imageToAvifConverter.downloadAvifLabel"]()}
                      </a>
                    </Card.Footer>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border bg-default/30 px-6 py-10 text-center">
              <div className="grid max-w-sm justify-items-center gap-2">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-default text-muted">
                  <ImageIcon aria-hidden className="size-5" />
                </span>
                <h2 className="font-medium">
                  {m["tools.imageToAvifConverter.emptyResultTitle"]()}
                </h2>
                <p className="text-sm text-muted">
                  {m["tools.imageToAvifConverter.emptyResultDescription"]()}
                </p>
              </div>
            </div>
          )}
        </ToolPanelCardContent>
        {zipUrl && results.length > 1 ? (
          <ToolPanelCardFooter className="justify-end">
            <a
              href={zipUrl}
              download="avif-images.zip"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground transition outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus/25"
            >
              <Download aria-hidden className="size-4" />
              {m["common.favicondownloadzip"]()}
            </a>
          </ToolPanelCardFooter>
        ) : null}
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["tools.imageToAvifConverter.whatTitle"]()}</h2>
        <p>{m["tools.imageToAvifConverter.whatBody"]()}</p>
        <h2>{m["tools.imageToAvifConverter.whyTitle"]()}</h2>
        <p>{m["tools.imageToAvifConverter.whyBody"]()}</p>
        <h2>{m["shared.asciiArt.article.howTitle"]()}</h2>
        <ol>
          {[
            m["tools.imageToAvifConverter.howSteps0"](),
            m["tools.imageToAvifConverter.howSteps1"](),
            m["tools.imageToAvifConverter.howSteps2"](),
            m["tools.imageToAvifConverter.howSteps3"](),
          ].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h2>{m["tools.imageToAvifConverter.tipsTitle"]()}</h2>
        <ul>
          {[
            m["tools.imageToAvifConverter.tips0"](),
            m["tools.imageToAvifConverter.tips1"](),
            m["tools.imageToAvifConverter.tips2"](),
            m["tools.imageToAvifConverter.tips3"](),
            m["tools.imageToAvifConverter.tips4"](),
            m["tools.imageToAvifConverter.tips5"](),
          ].map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function ImageToAvifConverter() {
  return (
    <ToolPage>
      <ImageToAvifConverterContent />
    </ToolPage>
  );
}
