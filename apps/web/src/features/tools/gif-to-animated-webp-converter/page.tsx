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
import { formatFileSize } from "@/lib/file-size";
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

function errorMessage(code: AnimationErrorCode) {
  if (code === "invalid_input")
    return m["tools.gifToAnimatedWebpConverter.invalidGifError"]();
  if (code === "unsupported")
    return m["tools.gifToAnimatedWebpConverter.canvasUnavailableError"]();
  if (
    code === "input_limit" ||
    code === "pixel_limit" ||
    code === "frame_limit"
  ) {
    return m["tools.gifToAnimatedWebpConverter.invalidGifError"]();
  }
  return m["tools.gifToAnimatedWebpConverter.conversionFailedError"]();
}

function sizeChange(original: number, output: number) {
  if (!original) return "0%";
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "always",
  }).format((output - original) / original);
}

function OptionsField({
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
          value={Number.isFinite(value) ? value : ""}
          onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        />
      </div>
    </div>
  );
}

function AnimatedWebpConverterContent({
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
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  const zipStop = useRef<(() => void) | null>(null);
  const revision = useRef(0);

  function releaseResults() {
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
      zipStop.current?.();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    },
    [],
  );

  function addFiles(incoming: File[]) {
    releaseResults();
    const currentKeys = new Set(files.map(fileKey));
    let duplicate = false;
    let invalid = false;
    const next = [...files];
    for (const file of incoming) {
      if (file.type !== "image/gif" && !/\.gif$/i.test(file.name)) {
        invalid = true;
        continue;
      }
      if (currentKeys.has(fileKey(file))) {
        duplicate = true;
        continue;
      }
      currentKeys.add(fileKey(file));
      next.push(file);
    }
    if (
      next.length > 100 ||
      next.reduce((total, file) => total + file.size, 0) > GIF_INPUT_LIMIT
    ) {
      setError(m["tools.gifToAnimatedWebpConverter.invalidGifError"]());
      return;
    }
    setFiles(next);
    setError(
      invalid
        ? m["tools.gifToAnimatedWebpConverter.invalidFileTypeError"]()
        : duplicate
          ? m["tools.gifToAnimatedWebpConverter.duplicateFileError"]()
          : "",
    );
  }

  function updateOptions(patch: Partial<AnimationOptions>) {
    releaseResults();
    setError("");
    setOptions((current) => ({ ...current, ...patch }));
  }

  function createUrl(bytes: Uint8Array<ArrayBuffer>, type: string) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    urls.current.add(url);
    return url;
  }

  async function convert() {
    releaseResults();
    const turn = revision.current;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    const converted: Result[] = [];
    const failures: string[] = [];
    let totalOutput = 0;
    try {
      validateOptions("webp", options);
      if (!files.length) throw new AnimationError("invalid_input");
      for (const file of files) {
        active.signal.throwIfAborted();
        try {
          const bytes = new Uint8Array(await readFile(file));
          active.signal.throwIfAborted();
          inspect(bytes);
          const result = await runWorker(
            { kind: "webp", bytes, options },
            active.signal,
          );
          active.signal.throwIfAborted();
          totalOutput += result.outputBytes;
          if (totalOutput > GIF_OUTPUT_LIMIT)
            throw new AnimationError("output_limit");
          const base = file.name.replace(/\.[^.]*$/, "") || "animation";
          let name = `${base}.webp`;
          let sequence = 2;
          while (converted.some((item) => item.name === name)) {
            name = `${base}-${sequence}.webp`;
            sequence += 1;
          }
          converted.push({
            ...result,
            name,
            url: createUrl(result.bytes, "image/webp"),
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
                m["tools.gifToAnimatedWebpConverter.conversionFailedError"]()),
        );
      }
      if (converted.length > 1) {
        const archive = await new Promise<Uint8Array<ArrayBuffer>>(
          (resolve, reject) => {
            const onAbort = () => {
              zipStop.current?.();
              reject(new DOMException("Aborted", "AbortError"));
            };
            active.signal.addEventListener("abort", onAbort, { once: true });
            zipStop.current = makeZip(
              Object.fromEntries(
                converted.map((item) => [item.name, item.bytes]),
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
      }
    } catch (cause) {
      if (!active.signal.aborted && turn === revision.current) {
        setError(
          cause instanceof AnimationError
            ? errorMessage(cause.code)
            : m["tools.gifToAnimatedWebpConverter.zipFailedError"](),
        );
      }
    } finally {
      if (controller.current === active) controller.current = null;
      if (turn === revision.current) setBusy(false);
    }
  }

  const totalOriginal = results.reduce(
    (total, item) => total + item.originalBytes,
    0,
  );
  const totalConverted = results.reduce(
    (total, item) => total + item.outputBytes,
    0,
  );

  return (
    <div className="grid gap-8">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.gifToAnimatedWebpConverter.uploadTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.gifToAnimatedWebpConverter.uploadDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <ToolFilePicker
              label={
                files.length
                  ? m["tools.gifToAnimatedWebpConverter.changeFilesLabel"]()
                  : m["tools.gifToAnimatedWebpConverter.chooseGifsLabel"]()
              }
              description={`${m["tools.gifToAnimatedWebpConverter.uploadHint"]()} ${m["tools.gifToAnimatedWebpConverter.supportedFormatsLabel"]()}`}
              accept={["image/gif", ".gif"]}
              multiple
              isDisabled={busy}
              onSelectFiles={addFiles}
            />
            {files.length ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <Chip size="sm" variant="secondary">
                    {m["tools.gifToAnimatedWebpConverter.selectedGifsLabel"]()}:{" "}
                    {files.length}
                  </Chip>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      releaseResults();
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
                        {file.name} · {formatFileSize(file.size, locale)}
                      </span>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={`${m["tools.gifToAnimatedWebpConverter.removeGifLabel"]()}: ${file.name}`}
                        onPress={() => {
                          releaseResults();
                          setFiles((current) =>
                            current.filter(
                              (item) => fileKey(item) !== fileKey(file),
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
              {m["tools.gifToAnimatedWebpConverter.optionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            <OptionsField
              label={m["tools.gifToAnimatedWebpConverter.scaleLabel"]()}
              description={m[
                "tools.gifToAnimatedWebpConverter.scaleDescription"
              ]()}
              value={options.scale}
              suffix="%"
              min={10}
              max={400}
              step={1}
              onChange={(value) => updateOptions({ scale: value })}
            />
            <OptionsField
              label={m["common.unitcategoryspeed"]()}
              description={m[
                "tools.gifToAnimatedWebpConverter.speedDescription"
              ]()}
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
              <Label>{m["tools.gifToAnimatedWebpConverter.loopLabel"]()}</Label>
              <p className="text-sm text-muted">
                {m["tools.gifToAnimatedWebpConverter.loopDescription"]()}
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
                      "tools.gifToAnimatedWebpConverter.loopInfiniteLabel"
                    ]()}
                  >
                    {m["tools.gifToAnimatedWebpConverter.loopInfiniteLabel"]()}
                  </ListBox.Item>
                  <ListBox.Item
                    id="custom"
                    textValue={m[
                      "tools.gifToAnimatedWebpConverter.loopCustomLabel"
                    ]()}
                  >
                    {m["tools.gifToAnimatedWebpConverter.loopCustomLabel"]()}
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
            {options.loopMode === "custom" ? (
              <div className="grid gap-2">
                <Label>
                  {m["tools.gifToAnimatedWebpConverter.loopCountLabel"]()}
                </Label>
                <p className="text-sm text-muted">
                  {m["tools.gifToAnimatedWebpConverter.loopCountDescription"]()}
                </p>
                <Input
                  aria-label={m[
                    "tools.gifToAnimatedWebpConverter.loopCountLabel"
                  ]()}
                  type="number"
                  min={1}
                  max={1000}
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
          <ToolPanelCardFooter className="justify-end">
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
                : m["tools.gifToAnimatedWebpConverter.convertLabel"]()}
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
        <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid gap-1">
            <Card.Title>
              {m["tools.gifToAnimatedWebpConverter.resultTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.gifToAnimatedWebpConverter.resultDescription"]()}
            </Card.Description>
          </div>
          {zipUrl && results.length > 1 ? (
            <Button
              size="sm"
              variant="primary"
              onPress={() => downloadUrl(zipUrl, "animated-webp-images.zip")}
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
                  {results.length} {m["common.devOutput"]()}
                </Chip>
                <Chip size="sm" variant="tertiary">
                  {m["tools.gifToAnimatedWebpConverter.totalSizeChangeLabel"]()}
                  : {sizeChange(totalOriginal, totalConverted)}
                </Chip>
                <Chip size="sm" variant="tertiary">
                  {formatFileSize(totalConverted, locale)}
                </Chip>
              </div>
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {results.map((result) => (
                  <article
                    key={result.url}
                    className="overflow-hidden rounded-xl border border-border/70 bg-default/20"
                  >
                    <div className="grid gap-4 p-4">
                      <div className="bg-field-background flex min-h-44 items-center justify-center rounded-xl border border-border/60 p-3">
                        <img
                          src={result.url}
                          alt={result.name}
                          width={result.width}
                          height={result.height}
                          loading="lazy"
                          className="max-h-52 max-w-full rounded-lg object-contain"
                        />
                      </div>
                      <div>
                        <p className="truncate text-sm font-medium">
                          {result.name}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Chip size="sm" variant="secondary">
                            Animated WebP
                          </Chip>
                          <Chip size="sm" variant="tertiary">
                            {result.width} × {result.height}
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
                          <dd>
                            {result.originalWidth} × {result.originalHeight},{" "}
                            {formatFileSize(result.originalBytes, locale)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted">
                            {m["common.devOutput"]()}
                          </dt>
                          <dd>
                            {result.width} × {result.height},{" "}
                            {formatFileSize(result.outputBytes, locale)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted">
                            {m[
                              "tools.gifToAnimatedWebpConverter.sizeChangeLabel"
                            ]()}
                          </dt>
                          <dd>
                            {sizeChange(
                              result.originalBytes,
                              result.outputBytes,
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="flex justify-end border-t border-separator p-4">
                      <Button
                        variant="outline"
                        onPress={() => downloadUrl(result.url, result.name)}
                      >
                        <Download aria-hidden className="size-4" />
                        {m["tools.cssGradientGenerator.downloadWebp"]()}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <ImageIcon aria-hidden className="size-6 text-muted" />
              <p className="font-medium">
                {busy
                  ? m["tools.gifToAnimatedWebpConverter.convertingLabel"]()
                  : m["tools.gifToAnimatedWebpConverter.emptyResultTitle"]()}
              </p>
              <p className="max-w-md text-sm text-muted">
                {m["tools.gifToAnimatedWebpConverter.emptyResultDescription"]()}
              </p>
            </div>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <p>{m["tools.gifToAnimatedWebpConverter.articleLead"]()}</p>
        <h2>{m["tools.archiveViewer.article.whenTitle"]()}</h2>
        <p>{m["tools.gifToAnimatedWebpConverter.articleWhenBody"]()}</p>
        <h2>{m["common.formatoptions"]()}</h2>
        <p>{m["tools.gifToAnimatedWebpConverter.articleOptionsBody"]()}</p>
        <h2>{m["tools.gifToAnimatedWebpConverter.article.privacyTitle"]()}</h2>
        <p>{m["tools.gifToAnimatedWebpConverter.articlePrivacyBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function AnimatedWebpConverter() {
  return (
    <ToolPage>
      <AnimatedWebpConverterContent />
    </ToolPage>
  );
}
