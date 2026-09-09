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
} from "@heroui/react";
import { zip as makeZip } from "fflate";
import {
  Download,
  ImageIcon,
  LoaderCircle,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { downloadUrl } from "@/lib/download";
import { getLocale } from "@/paraglide/runtime.js";
import { inspectGif } from "@workspace/tools/image/gif";
import {
  AnimationError,
  type AnimationErrorCode,
  type AnimationOptions,
  type AnimationResult,
  animationDefaults,
  GIF_INPUT_LIMIT,
  GIF_OUTPUT_LIMIT,
  validateOptions,
} from "@workspace/tools/image/gif-contract";
import { runAnimationWorker } from "../gif-animation/worker-client";

type Result = AnimationResult & { name: string; url: string };

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function outputName(fileName: string, used: Map<string, number>) {
  const normalized = fileName.replace(/[/\\]+/g, "_").trim();
  const dot = normalized.lastIndexOf(".");
  const base = (dot > 0 ? normalized.slice(0, dot) : normalized) || "image";
  const name = `${base}.png`;
  const count = used.get(name) ?? 0;
  used.set(name, count + 1);
  return count ? `${base}-${count + 1}.png` : name;
}

function normalizeOptions(
  current: AnimationOptions,
  patch: Partial<AnimationOptions>,
) {
  const next = { ...current, ...patch };
  const scale = Number.isFinite(next.scale)
    ? Math.min(400, Math.max(10, Math.round(next.scale)))
    : current.scale;
  const speed = Number.isFinite(next.speed)
    ? Math.min(4, Math.max(0.25, next.speed))
    : current.speed;
  const loopCount = Number.isFinite(next.loopCount)
    ? Math.min(999, Math.max(1, Math.round(next.loopCount)))
    : current.loopCount;
  return { ...next, scale, speed, loopCount };
}

function errorMessage(code: AnimationErrorCode) {
  if (code === "invalid_input")
    return m["tools.gifToApngConverter.invalidGifError"]();
  if (code === "unsupported")
    return m["tools.gifToApngConverter.canvasUnavailableError"]();
  return m["tools.gifToApngConverter.conversionFailedError"]();
}

function formatNumber(value: number, locale: string, digits: number) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatBytes(bytes: number, locale: string) {
  if (bytes < 1024) return `${formatNumber(bytes, locale, 0)} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, locale, 1)} KB`;
  return `${formatNumber(bytes / (1024 * 1024), locale, 1)} MB`;
}

function formatDelta(
  originalBytes: number,
  outputBytes: number,
  locale: string,
) {
  const delta = outputBytes - originalBytes;
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const percent = originalBytes ? delta / originalBytes : 0;
  return `${sign}${formatBytes(Math.abs(delta), locale)} (${new Intl.NumberFormat(
    locale,
    {
      maximumFractionDigits: Math.abs(percent) >= 0.1 ? 0 : 1,
      signDisplay: "exceptZero",
      style: "percent",
    },
  ).format(percent)})`;
}

function OptionField({
  label,
  description,
  value,
  suffix,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="font-mono text-sm text-muted">
          {value}
          {suffix}
        </span>
      </div>
      <p className="text-sm text-muted">{description}</p>
      <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_5rem]">
        <Slider
          aria-label={label}
          minValue={min}
          maxValue={max}
          step={step}
          value={value}
          onChange={(next) => onChange(Number(next))}
        >
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <Input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        />
      </div>
    </div>
  );
}

function ApngConverterContent({
  runWorker = runAnimationWorker,
  readFile = (file: File) => file.arrayBuffer(),
  inspect = inspectGif,
}: {
  runWorker?: typeof runAnimationWorker;
  readFile?: (file: File) => Promise<ArrayBuffer>;
  inspect?: typeof inspectGif;
} = {}) {
  const locale = getLocale();
  const loopId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<AnimationOptions>({
    ...animationDefaults,
  });
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [zipUrl, setZipUrl] = useState("");
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const zipStop = useRef<(() => void) | null>(null);
  const urls = useRef(new Set<string>());

  function releaseOutputs() {
    revision.current += 1;
    controller.current?.abort();
    controller.current = null;
    zipStop.current?.();
    zipStop.current = null;
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
    setResults([]);
    setZipUrl("");
    setBusy(false);
  }

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
      controller.current = null;
      zipStop.current?.();
      zipStop.current = null;
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    },
    [],
  );

  function addFiles(incoming: File[]) {
    if (!incoming.length) return;
    releaseOutputs();
    const keys = new Set(files.map(fileKey));
    const next = [...files];
    let duplicate = false;
    let invalid = false;
    for (const file of incoming) {
      if (file.type !== "image/gif" && !/\.gif$/i.test(file.name)) {
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
    if (
      next.length > 100 ||
      next.reduce((total, file) => total + file.size, 0) > GIF_INPUT_LIMIT
    ) {
      setError(m["tools.gifToApngConverter.conversionFailedError"]());
      return;
    }
    if (next.length !== files.length) setFiles(next);
    setError(
      invalid
        ? m["tools.gifToApngConverter.invalidFileTypeError"]()
        : duplicate
          ? m["tools.gifToApngConverter.duplicateFileError"]()
          : "",
    );
  }

  function updateOptions(patch: Partial<AnimationOptions>) {
    releaseOutputs();
    setError("");
    setOptions((current) => normalizeOptions(current, patch));
  }

  function createUrl(bytes: Uint8Array<ArrayBuffer>, type: string) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    urls.current.add(url);
    return url;
  }

  async function convert() {
    if (!files.length || busy) {
      setError(m["tools.gifToAnimatedWebpConverter.noFilesError"]());
      return;
    }
    releaseOutputs();
    const turn = revision.current;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    const converted: Result[] = [];
    const failures: string[] = [];
    const names = new Map<string, number>();
    let totalOutput = 0;
    try {
      validateOptions("apng", options);
      for (const file of files) {
        active.signal.throwIfAborted();
        try {
          const bytes = new Uint8Array(await readFile(file));
          active.signal.throwIfAborted();
          inspect(bytes);
          const result = await runWorker(
            { kind: "apng", bytes, options },
            active.signal,
          );
          active.signal.throwIfAborted();
          totalOutput += result.outputBytes;
          if (totalOutput > GIF_OUTPUT_LIMIT)
            throw new AnimationError("output_limit");
          converted.push({
            ...result,
            name: outputName(file.name, names),
            url: createUrl(result.bytes, "image/png"),
          });
          if (turn === revision.current) setResults([...converted]);
        } catch (cause) {
          if (active.signal.aborted) throw cause;
          failures.push(
            errorMessage(
              cause instanceof AnimationError
                ? cause.code
                : "conversion_failed",
            ),
          );
        }
      }
      if (turn !== revision.current) return;
      if (failures.length) {
        setError(
          converted.length
            ? `${m["tools.gifToAnimatedWebpConverter.partialConversionError"]()} ${failures[0]}`
            : (failures[0] ??
                m["tools.gifToApngConverter.conversionFailedError"]()),
        );
      } else if (!converted.length) {
        setError(m["tools.gifToApngConverter.conversionFailedError"]());
      }
      if (converted.length > 1) {
        try {
          const archive = await new Promise<Uint8Array<ArrayBuffer>>(
            (resolve, reject) => {
              const onAbort = () => {
                zipStop.current?.();
                reject(new DOMException("Aborted", "AbortError"));
              };
              active.signal.addEventListener("abort", onAbort, { once: true });
              zipStop.current = makeZip(
                Object.fromEntries(
                  converted.map((result) => [result.name, result.bytes]),
                ),
                { level: 0 },
                (archiveError, data) => {
                  active.signal.removeEventListener("abort", onAbort);
                  zipStop.current = null;
                  if (archiveError) reject(archiveError);
                  else resolve(new Uint8Array(data));
                },
              );
            },
          );
          active.signal.throwIfAborted();
          if (archive.length > GIF_OUTPUT_LIMIT)
            throw new AnimationError("output_limit");
          if (turn === revision.current)
            setZipUrl(createUrl(archive, "application/zip"));
        } catch {
          if (turn === revision.current && !active.signal.aborted)
            setError(m["tools.gifToApngConverter.zipFailedError"]());
        }
      }
    } catch (cause) {
      if (!active.signal.aborted && turn === revision.current) {
        setError(
          cause instanceof AnimationError
            ? errorMessage(cause.code)
            : m["tools.gifToApngConverter.conversionFailedError"](),
        );
      }
    } finally {
      if (controller.current === active) controller.current = null;
      if (turn === revision.current) setBusy(false);
    }
  }

  const totalOutput = results.reduce(
    (total, result) => total + result.outputBytes,
    0,
  );

  return (
    <div className="grid gap-8">
      <div className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start">
        <aside className="order-2 lg:sticky lg:top-6 lg:order-1 lg:row-span-3 lg:self-start">
          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["tools.gifToAnimatedWebpConverter.optionsTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.gifToApngConverter.optionsDescription"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="gap-6 py-4">
              <OptionField
                label={m["tools.gifToAnimatedWebpConverter.scaleLabel"]()}
                description={m["tools.gifToApngConverter.scaleDescription"]()}
                value={options.scale}
                suffix="%"
                min={10}
                max={400}
                step={1}
                onChange={(value) => updateOptions({ scale: value })}
              />
              <OptionField
                label={m["tools.gifToApngConverter.speed"]()}
                description={m["tools.gifToApngConverter.speedDescription"]()}
                value={options.speed}
                suffix="x"
                min={0.25}
                max={4}
                step={0.25}
                onChange={(value) => updateOptions({ speed: value })}
              />
              <Select
                variant="secondary"
                selectedKey={options.loopMode}
                onSelectionChange={(key) =>
                  updateOptions({
                    loopMode: String(key) as AnimationOptions["loopMode"],
                  })
                }
              >
                <Label>
                  {m["tools.gifToAnimatedWebpConverter.loopLabel"]()}
                </Label>
                <p className="text-sm text-muted">
                  {m["tools.gifToApngConverter.loopDescription"]()}
                </p>
                <Select.Trigger id={loopId} className="w-full">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item
                      id="inherit"
                      textValue={m[
                        "tools.gifToAnimatedWebpConverter.loopInheritLabel"
                      ]()}
                    >
                      {m["tools.gifToAnimatedWebpConverter.loopInheritLabel"]()}
                    </ListBox.Item>
                    <ListBox.Item
                      id="infinite"
                      textValue={m[
                        "tools.gifToApngConverter.loopInfiniteLabel"
                      ]()}
                    >
                      {m["tools.gifToApngConverter.loopInfiniteLabel"]()}
                    </ListBox.Item>
                    <ListBox.Item
                      id="custom"
                      textValue={m["common.listslugCustom"]()}
                    >
                      {m["common.listslugCustom"]()}
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
              {options.loopMode === "custom" ? (
                <div className="grid gap-3">
                  <Label>
                    {m["tools.gifToAnimatedWebpConverter.loopCountLabel"]()}
                  </Label>
                  <Input
                    aria-label={m[
                      "tools.gifToAnimatedWebpConverter.loopCountLabel"
                    ]()}
                    type="number"
                    min={1}
                    max={999}
                    value={options.loopCount}
                    onChange={(event) =>
                      updateOptions({
                        loopCount: event.currentTarget.valueAsNumber,
                      })
                    }
                  />
                </div>
              ) : null}
            </ToolPanelCardContent>
            <ToolPanelCardFooter className="flex-col items-stretch gap-3">
              <Chip className="justify-center" variant="secondary">
                {m["tools.gifToAnimatedWebpConverter.selectedGifsLabel"]()}:{" "}
                {files.length}
              </Chip>
              <Button
                variant="primary"
                isDisabled={!files.length || busy}
                onPress={() => void convert()}
              >
                {busy ? (
                  <LoaderCircle aria-hidden className="size-4 animate-spin" />
                ) : (
                  <Sparkles aria-hidden className="size-4" />
                )}
                {busy
                  ? m["tools.gifToAnimatedWebpConverter.convertingLabel"]()
                  : m["tools.gifToApngConverter.convertLabel"]()}
              </Button>
              {busy ? (
                <Button
                  variant="ghost"
                  onPress={() => {
                    releaseOutputs();
                    setError("");
                  }}
                >
                  {m["common.actions.cancel"]()}
                </Button>
              ) : null}
            </ToolPanelCardFooter>
          </ToolPanelCard>
        </aside>

        <div className="order-1 min-w-0 lg:order-2">
          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["tools.gifToApngConverter.uploadTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.gifToApngConverter.uploadDescription"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              <ToolFilePicker
                label={
                  files.length
                    ? m["tools.gifToApngConverter.changeFilesLabel"]()
                    : m["tools.gifToApngConverter.chooseFilesLabel"]()
                }
                description={`${m["tools.gifToApngConverter.uploadHint"]()} ${m["tools.gifToApngConverter.supportedFormatsLabel"]()}`}
                accept={["image/gif", ".gif"]}
                multiple
                isDisabled={busy}
                onSelectFiles={addFiles}
              />
              {files.length ? (
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <Chip size="sm" variant="secondary">
                      {m[
                        "tools.gifToAnimatedWebpConverter.selectedGifsLabel"
                      ]()}
                      : {files.length}
                    </Chip>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        releaseOutputs();
                        setFiles([]);
                        setError("");
                      }}
                    >
                      {m["shared.pdfEditing.clear"]()}
                    </Button>
                  </div>
                  <ul className="grid gap-2">
                    {files.map((file) => (
                      <li
                        key={fileKey(file)}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border/70 bg-default/20 px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm">
                          {file.name} · {formatBytes(file.size, locale)}
                        </span>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label={`${m["tools.gifToAnimatedWebpConverter.removeGifLabel"]()}: ${file.name}`}
                          onPress={() => {
                            releaseOutputs();
                            setFiles((current) =>
                              current.filter(
                                (item) => fileKey(item) !== fileKey(file),
                              ),
                            );
                            setError("");
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
        </div>

        {error ? (
          <Alert
            status="danger"
            role="alert"
            className="order-3 min-w-0 lg:col-start-2"
          >
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {m["tools.gifToApngConverter.errorTitle"]()}
              </Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        <ToolPanelCard className="order-4 min-w-0 lg:col-start-2">
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>
                {m["tools.gifToApngConverter.resultTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.gifToApngConverter.resultDescription"]()}
              </Card.Description>
            </div>
            {zipUrl && results.length > 1 ? (
              <Button
                size="sm"
                variant="primary"
                onPress={() => downloadUrl(zipUrl, "apng-images.zip")}
              >
                <Download aria-hidden className="size-4" />
                {m["common.favicondownloadzip"]()}
              </Button>
            ) : null}
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4" aria-live="polite">
            {results.length ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Chip size="sm" variant="secondary">
                    {m["common.devOutput"]()}: {results.length}
                  </Chip>
                  <Chip size="sm" variant="tertiary">
                    {m["tools.gifToApngConverter.totalOutputLabel"]()}:{" "}
                    {formatBytes(totalOutput, locale)}
                  </Chip>
                </div>
                <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {results.map((result) => (
                    <article
                      key={result.url}
                      className="overflow-hidden rounded-xl border border-border/70 bg-default/20"
                    >
                      <div className="grid gap-4 p-4 pb-3">
                        <div className="bg-field-background flex min-h-44 items-center justify-center rounded-xl border border-border/60 p-3">
                          <img
                            src={result.url}
                            alt={result.name}
                            width={result.width}
                            height={result.height}
                            loading="lazy"
                            className="max-h-52 max-w-full rounded-lg bg-white/70 object-contain shadow-sm"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {result.name}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Chip size="sm" variant="secondary">
                              APNG
                            </Chip>
                            <Chip size="sm" variant="tertiary">
                              {result.width} x {result.height}
                            </Chip>
                            <Chip size="sm" variant="tertiary">
                              {m["tools.gifToApngConverter.frameCountLabel"]()}:{" "}
                              {result.frames}
                            </Chip>
                          </div>
                        </div>
                        <dl className="grid gap-2 text-sm">
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted">
                              {m[
                                "tools.gifToAnimatedWebpConverter.originalLabel"
                              ]()}
                            </dt>
                            <dd className="text-right">
                              {result.originalWidth} x {result.originalHeight},{" "}
                              {formatBytes(result.originalBytes, locale)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted">
                              {m["common.devOutput"]()}
                            </dt>
                            <dd className="text-right">
                              {result.width} x {result.height},{" "}
                              {formatBytes(result.outputBytes, locale)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted">
                              {m[
                                "tools.gifToAnimatedWebpConverter.sizeChangeLabel"
                              ]()}
                            </dt>
                            <dd className="text-right">
                              {formatDelta(
                                result.originalBytes,
                                result.outputBytes,
                                locale,
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div className="flex justify-end border-t border-separator p-3">
                        <Button
                          variant="outline"
                          onPress={() => downloadUrl(result.url, result.name)}
                        >
                          <Download aria-hidden className="size-4" />
                          {m["tools.gifToApngConverter.downloadApngLabel"]()}
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                {busy ? (
                  <LoaderCircle
                    aria-hidden
                    className="size-6 animate-spin text-muted"
                  />
                ) : (
                  <ImageIcon aria-hidden className="size-6 text-muted" />
                )}
                <p className="font-medium">
                  {busy
                    ? m["tools.gifToAnimatedWebpConverter.convertingLabel"]()
                    : m["tools.gifToApngConverter.emptyResultTitle"]()}
                </p>
                <p className="max-w-md text-sm text-muted">
                  {m["tools.gifToApngConverter.emptyResultDescription"]()}
                </p>
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.gifToApngConverter.articleWhatTitle"]()}</h2>
        <p>{m["tools.gifToApngConverter.articleWhatBody"]()}</p>
        <h2>{m["tools.camera.article.casesTitle"]()}</h2>
        <ul>
          {[
            m["tools.gifToApngConverter.articleUses0"](),
            m["tools.gifToApngConverter.articleUses1"](),
            m["tools.gifToApngConverter.articleUses2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.gifToApngConverter.articleWatchTitle"]()}</h2>
        <ul>
          {[
            m["tools.gifToApngConverter.articleWatch0"](),
            m["tools.gifToApngConverter.articleWatch1"](),
            m["tools.gifToApngConverter.articleWatch2"](),
          ].map((item, index) => (
            <li key={item}>
              {index === 0 ? (
                <>
                  {item.slice(0, item.indexOf("`.png`"))}
                  <code>.png</code>
                  {item.slice(item.indexOf("`.png`") + 6)}
                </>
              ) : (
                item
              )}
            </li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function ApngConverter() {
  return (
    <ToolPage>
      <ApngConverterContent />
    </ToolPage>
  );
}
