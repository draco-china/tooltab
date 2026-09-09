import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  Skeleton,
  Slider,
  Switch,
} from "@heroui/react";
import {
  Download,
  ImageIcon,
  LoaderCircle,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { buttonVariants } from "@heroui/styles";
import {
  OptimizerError,
  type OptimizerResult,
  optimizedName,
  PNG_INPUT_LIMIT,
  type PngOptions,
  pngDefaults,
} from "@workspace/tools/image/optimizer";
import { runOptimizerWorker } from "@/features/tools/image-optimizers/worker-client";
import { m } from "@/paraglide/messages.js";

type PngResult = {
  data: OptimizerResult;
  fileName: string;
  level: number;
};

const PNG_EXTENSION = /\.png$/iu;

function PngOptimizerPageContent() {
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<PngOptions>({ ...pngDefaults });
  const [result, setResult] = useState<PngResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const revisionRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<FileReader | null>(null);
  const inputBytesRef = useRef<Uint8Array | null>(null);
  const resultBytesRef = useRef<Uint8Array | null>(null);
  const previewUrlRef = useRef("");
  const downloadUrlRef = useRef("");

  useEffect(
    () => () => {
      revisionRef.current += 1;
      controllerRef.current?.abort();
      const reader = readerRef.current;
      if (reader?.readyState === FileReader.LOADING) reader.abort();
      readerRef.current = null;
      inputBytesRef.current?.fill(0);
      inputBytesRef.current = null;
      resultBytesRef.current?.fill(0);
      resultBytesRef.current = null;
      revokeUrl(previewUrlRef);
      revokeUrl(downloadUrlRef);
    },
    [],
  );

  function cancelActive() {
    revisionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    const reader = readerRef.current;
    if (reader?.readyState === FileReader.LOADING) reader.abort();
    readerRef.current = null;
    inputBytesRef.current?.fill(0);
    inputBytesRef.current = null;
    setIsOptimizing(false);
  }

  function clearResult() {
    resultBytesRef.current?.fill(0);
    resultBytesRef.current = null;
    revokeUrl(downloadUrlRef);
    setDownloadUrl("");
    setResult(null);
  }

  function clearPreview() {
    revokeUrl(previewUrlRef);
    setPreviewUrl("");
  }

  function selectFile(selected: File) {
    cancelActive();
    clearResult();
    clearPreview();
    setError("");
    setFile(null);
    if (!isPngFile(selected) || !selected.size) {
      setError(m["tools.pngOptimizer.invalidFileTypeError"]());
      return;
    }
    if (selected.size > PNG_INPUT_LIMIT) {
      setError(m["tools.pngOptimizer.optimizationFailedError"]());
      return;
    }
    setFile(selected);
    try {
      const url = URL.createObjectURL(selected);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch {
      setError(m["tools.pngOptimizer.optimizationFailedError"]());
    }
  }

  function clearFile() {
    cancelActive();
    clearResult();
    clearPreview();
    setFile(null);
    setError("");
  }

  function changeOptions(next: PngOptions) {
    cancelActive();
    clearResult();
    setError("");
    setOptions({
      interlace: next.interlace,
      level: clampLevel(next.level),
      optimiseAlpha: next.optimiseAlpha,
    });
  }

  async function optimize() {
    if (!file || isOptimizing) {
      if (!file) setError(m["tools.pngOptimizer.noFileError"]());
      return;
    }
    cancelActive();
    clearResult();
    setError("");
    const currentRevision = revisionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsOptimizing(true);
    let bytes: Uint8Array<ArrayBuffer> | null = null;
    try {
      bytes = new Uint8Array<ArrayBuffer>(
        await readFile(file, controller.signal, readerRef),
      );
      inputBytesRef.current = bytes;
      if (currentRevision !== revisionRef.current) return;
      const next = await runOptimizerWorker(
        { kind: "png", bytes, options },
        controller.signal,
      );
      if (
        currentRevision !== revisionRef.current ||
        controller.signal.aborted
      ) {
        next.bytes.fill(0);
        return;
      }
      const url = URL.createObjectURL(
        new Blob([next.bytes], { type: "image/png" }),
      );
      downloadUrlRef.current = url;
      resultBytesRef.current = next.bytes;
      setDownloadUrl(url);
      setResult({
        data: next,
        fileName: optimizedName(file.name, "png"),
        level: options.level,
      });
    } catch (cause) {
      if (
        currentRevision === revisionRef.current &&
        !controller.signal.aborted
      ) {
        setError(errorMessage(cause));
      }
    } finally {
      bytes?.fill(0);
      if (inputBytesRef.current === bytes) inputBytesRef.current = null;
      if (currentRevision === revisionRef.current) {
        controllerRef.current = null;
        setIsOptimizing(false);
      }
    }
  }

  return (
    <div className="flex flex-col gap-6" data-tool="png-optimizer">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.pngOptimizer.uploadTitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.pngOptimizer.uploadDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <div className="grid gap-1">
              <p className="font-medium">
                {m["tools.pngOptimizer.dropzoneTitle"]()}
              </p>
              <p className="text-sm text-muted">
                {m["tools.pngOptimizer.dropzoneDescription"]()}
              </p>
            </div>
            <ToolFilePicker
              accept={["image/png", ".png"]}
              clearLabel={m["shared.aesTools.clearfile"]()}
              description={m["tools.pngOptimizer.pngOnlyLabel"]()}
              fileName={file?.name}
              label={m["tools.pngOptimizer.chooseFileLabel"]()}
              onClear={file ? clearFile : undefined}
              onSelect={selectFile}
            />
            {file ? (
              <div className="grid gap-4 rounded-xl border border-border bg-default/20 p-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface">
                  {previewUrl ? (
                    <img
                      alt={file.name}
                      className="max-h-44 w-full object-contain"
                      height={256}
                      src={previewUrl}
                      width={384}
                    />
                  ) : (
                    <ImageIcon aria-hidden className="size-5 text-muted" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col justify-center gap-3">
                  <span className="inline-flex w-fit rounded-full bg-default px-2.5 py-1 text-xs font-medium text-muted">
                    {m["tools.pngOptimizer.aesdecryptselectedfilelabel"]()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="text-sm text-muted">
                      {m["tools.audioRecorder.size"]()}:{" "}
                      {formatBytes(file.size)}
                    </p>
                  </div>
                  <p className="text-sm text-muted">
                    {m["tools.pngOptimizer.replaceFileLabel"]()}
                  </p>
                </div>
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <OptionsCard
          disabled={isOptimizing}
          hasFile={Boolean(file)}
          isOptimizing={isOptimizing}
          options={options}
          onChange={changeOptions}
          onOptimize={() => void optimize()}
        />
      </div>

      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>{m["tools.pngOptimizer.errorTitle"]()}</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <ResultsCard
        downloadUrl={downloadUrl}
        isOptimizing={isOptimizing}
        result={result}
      />

      <ToolArticle>
        <h2>{m["tools.pngOptimizer.articleWhatTitle"]()}</h2>
        <p>{m["tools.pngOptimizer.articleWhatBody"]()}</p>
        <h2>{m["shared.barcodeTools.readerArticleWhenTitle"]()}</h2>
        <p>{m["tools.pngOptimizer.articleWhenBody"]()}</p>
        <h2>{m["tools.pngOptimizer.articleOptionsTitle"]()}</h2>
        <p>{m["tools.pngOptimizer.articleOptionsBody"]()}</p>
        <h2>{m["tools.pngOptimizer.articlePrivacyTitle"]()}</h2>
        <p>{m["tools.pngOptimizer.articlePrivacyBody"]()}</p>
        <h2>{m["shared.aesTools.decryptarticlenotestitle"]()}</h2>
        <p>{m["tools.pngOptimizer.articleNotesBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function OptionsCard({
  disabled,
  hasFile,
  isOptimizing,
  onChange,
  onOptimize,
  options,
}: {
  disabled: boolean;
  hasFile: boolean;
  isOptimizing: boolean;
  onChange: (next: PngOptions) => void;
  onOptimize: () => void;
  options: PngOptions;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <Card.Title>{m["tools.svgOptimizer.options"]()}</Card.Title>
        <Card.Description>
          {m["tools.pngOptimizer.optionsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-6 py-4">
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="png-optimizer-level-input">
              {m["tools.svgOptimizer.level"]()}
            </Label>
            <span className="font-mono text-sm text-muted">
              {options.level}
            </span>
          </div>
          <p className="text-xs leading-5 text-muted">
            {m["tools.pngOptimizer.levelDescription"]()}
          </p>
          <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_5rem] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_5rem]">
            <Slider
              aria-label={m["tools.svgOptimizer.level"]()}
              isDisabled={disabled}
              maxValue={6}
              minValue={0}
              step={1}
              value={options.level}
              onChange={(value) =>
                onChange({ ...options, level: Number(value) })
              }
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            <Input
              id="png-optimizer-level-input"
              aria-label={m["tools.svgOptimizer.level"]()}
              disabled={disabled}
              max={6}
              min={0}
              type="number"
              value={String(options.level)}
              onChange={(event) =>
                onChange({ ...options, level: Number(event.target.value) })
              }
            />
          </div>
          <div className="flex justify-between gap-3 text-xs text-muted">
            <span>{m["tools.pngOptimizer.fasterLabel"]()}</span>
            <span>{m["tools.pngOptimizer.smallerLabel"]()}</span>
          </div>
        </div>

        <Switch
          isDisabled={disabled}
          isSelected={options.interlace}
          onChange={(value) =>
            onChange({ ...options, interlace: value === true })
          }
        >
          <Switch.Content className="flex min-h-11 items-center gap-3">
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <span className="grid gap-1">
              <span>{m["tools.pngOptimizer.interlaceLabel"]()}</span>
              <span className="text-xs leading-5 text-muted">
                {m["tools.pngOptimizer.interlaceDescription"]()}
              </span>
            </span>
          </Switch.Content>
        </Switch>

        <Switch
          isDisabled={disabled}
          isSelected={options.optimiseAlpha}
          onChange={(value) =>
            onChange({ ...options, optimiseAlpha: value === true })
          }
        >
          <Switch.Content className="flex min-h-11 items-center gap-3">
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <span className="grid gap-1">
              <span>{m["tools.pngOptimizer.optimizeAlphaLabel"]()}</span>
              <span className="text-xs leading-5 text-muted">
                {m["tools.pngOptimizer.optimizeAlphaDescription"]()}
              </span>
            </span>
          </Switch.Content>
        </Switch>
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="justify-end">
        <Button isDisabled={!hasFile || isOptimizing} onPress={onOptimize}>
          {isOptimizing ? (
            <LoaderCircle
              aria-hidden
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Sparkles aria-hidden className="size-4" />
          )}
          {isOptimizing
            ? m["tools.pngOptimizer.optimizingButtonLabel"]()
            : m["tools.pngOptimizer.optimizeButtonLabel"]()}
        </Button>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function ResultsCard({
  downloadUrl,
  isOptimizing,
  result,
}: {
  downloadUrl: string;
  isOptimizing: boolean;
  result: PngResult | null;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <div className="grid min-w-0 gap-1">
          <Card.Title>{m["tools.pngOptimizer.resultTitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.pngOptimizer.resultDescription"]()}
          </Card.Description>
        </div>
        {downloadUrl && result && !isOptimizing ? (
          <a
            className={buttonVariants({ size: "sm", variant: "primary" })}
            download={result.fileName}
            href={downloadUrl}
          >
            <Download aria-hidden className="size-4" />
            {m["tools.pngOptimizer.downloadOptimizedLabel"]()}
          </a>
        ) : null}
      </Card.Header>
      <ToolPanelCardContent aria-live="polite" className="gap-5 py-4">
        {isOptimizing ? (
          <ResultsSkeleton />
        ) : result ? (
          <>
            <div className="flex flex-wrap gap-2">
              <span
                className={
                  result.data.savedBytes > 0
                    ? "inline-flex rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
                    : "inline-flex rounded-full bg-default px-2.5 py-1 text-xs font-medium text-muted"
                }
              >
                {result.data.savedBytes > 0
                  ? `${m["tools.imageToAvifConverter.savedLabel"]()}: ${formatDelta(
                      result.data.savedBytes,
                      result.data.savedPercent,
                    )}`
                  : m["tools.pngOptimizer.noReductionLabel"]()}
              </span>
              <span className="inline-flex rounded-full bg-default px-2.5 py-1 text-xs font-medium text-muted">
                {m["tools.pngOptimizer.reductionLabel"]()}:{" "}
                {formatPercent(result.data.savedPercent)}
              </span>
            </div>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Metric
                label={m["shared.aesTools.decryptfilesizelabel"]()}
                value={formatBytes(result.data.originalBytes)}
              />
              <Metric
                label={m["tools.pngOptimizer.optimizedSizeLabel"]()}
                value={formatBytes(result.data.optimizedBytes)}
              />
              <Metric
                label={m["tools.svgOptimizer.level"]()}
                value={String(result.level)}
              />
            </dl>
          </>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-default text-muted">
              <ImageIcon aria-hidden className="size-5" />
            </span>
            <h2 className="font-medium">
              {m["tools.pngOptimizer.emptyResultTitle"]()}
            </h2>
            <p className="max-w-md text-sm text-muted">
              {m["tools.pngOptimizer.emptyResultDescription"]()}
            </p>
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid min-h-64 content-center gap-5" role="status">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-28 rounded-full" />
        <span className="text-sm text-muted">
          {m["tools.pngOptimizer.optimizingButtonLabel"]()}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="grid gap-2 rounded-xl border p-3">
            <Skeleton className="h-4 w-2/3 rounded-md" />
            <Skeleton className="h-5 w-1/2 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-default/20 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-sm">{value}</dd>
    </div>
  );
}

function readFile(
  file: File,
  signal: AbortSignal,
  target: MutableRefObject<FileReader | null>,
) {
  signal.throwIfAborted();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    target.current = reader;
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      if (target.current === reader) target.current = null;
    };
    const abort = () => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    reader.onload = () => {
      const value = reader.result;
      cleanup();
      if (value instanceof ArrayBuffer) resolve(value);
      else reject(new OptimizerError("invalid_input"));
    };
    reader.onerror = () => {
      cleanup();
      reject(new OptimizerError("invalid_input"));
    };
    reader.onabort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      reader.readAsArrayBuffer(file);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function errorMessage(error: unknown) {
  if (error instanceof OptimizerError) {
    if (error.code === "invalid_input") {
      return m["tools.pngOptimizer.invalidFileTypeError"]();
    }
    if (error.code === "unsupported") {
      return m["tools.pngOptimizer.workerUnavailableError"]();
    }
  }
  return m["tools.pngOptimizer.optimizationFailedError"]();
}

function revokeUrl(target: MutableRefObject<string>) {
  if (target.current) URL.revokeObjectURL(target.current);
  target.current = "";
}

function isPngFile(file: Pick<File, "name" | "type">) {
  return file.type === "image/png" || PNG_EXTENSION.test(file.name);
}

function clampLevel(value: number) {
  return Number.isFinite(value)
    ? Math.min(6, Math.max(0, Math.round(value)))
    : 2;
}

function formatBytes(bytes: number) {
  const absolute = Math.abs(bytes);
  const sign = bytes < 0 ? "-" : "";
  if (absolute < 1024) return `${sign}${absolute} B`;
  if (absolute < 1024 * 1024) {
    return `${sign}${(absolute / 1024).toFixed(1)} KB`;
  }
  return `${sign}${(absolute / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPercent(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (!Number.isFinite(value) || absolute === 0) return "0%";
  if (absolute >= 10) return `${sign}${Math.round(absolute)}%`;
  return `${sign}${absolute.toFixed(1)}%`;
}

function formatDelta(bytes: number, percent: number) {
  return `${formatBytes(bytes)} (${formatPercent(percent)})`;
}

export default function PngOptimizerPage() {
  return (
    <ToolPage>
      <PngOptimizerPageContent />
    </ToolPage>
  );
}
