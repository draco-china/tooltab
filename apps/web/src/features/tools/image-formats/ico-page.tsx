import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Chip,
  Skeleton,
  Switch,
} from "@heroui/react";
import { Download, ImageIcon, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolColorPicker } from "@/components/base/tool-color-picker";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { formatFileSize } from "@/lib/file-size";
import { convertBrowser, decodeBrowser, previewBrowser } from "./browser";
import {
  type FormatCode,
  type IcoOptions,
  ImageFormatError,
  icoDefaults,
  iconSizes,
  MAX_FORMAT_INPUT,
  outputName,
  validateSettings,
} from "@workspace/tools/image";

type IcoResult = {
  bytes: Uint8Array<ArrayBuffer>;
  name: string;
  sizes: number[];
  url: string;
};

const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/iu;

function isSupportedImage(file: File) {
  return file.type.startsWith("image/") || IMAGE_EXTENSION.test(file.name);
}

function ImageToIcoContent() {
  const locale = getLocale();
  const invalidImageError = m["tools.imageToIco.invalidImageError"]();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [options, setOptions] = useState<IcoOptions>({
    ...icoDefaults,
    sizes: [...icoDefaults.sizes],
  });
  const [result, setResult] = useState<IcoResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const resultUrl = useRef<string | null>(null);

  function releaseResult() {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = null;
    setResult(null);
  }

  function invalidate() {
    revision.current += 1;
    controller.current?.abort();
    controller.current = null;
    releaseResult();
    setBusy(false);
  }

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
      controller.current = null;
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      resultUrl.current = null;
    },
    [],
  );

  useEffect(() => {
    setPreview(null);
    setPreviewLoading(Boolean(file));
    if (!file) return;
    const abort = new AbortController();
    const deadline = window.setTimeout(() => abort.abort(), 120_000);
    let url = "";
    void previewBrowser(file, abort.signal)
      .then((blob) => {
        if (abort.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setPreview({ file, url });
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(invalidImageError);
      })
      .finally(() => {
        window.clearTimeout(deadline);
        if (!abort.signal.aborted) setPreviewLoading(false);
      });
    return () => {
      abort.abort();
      window.clearTimeout(deadline);
      if (url) URL.revokeObjectURL(url);
    };
  }, [invalidImageError, file]);

  function selectFiles(files: File[]) {
    if (!files.length) return;
    if (files.length > 1) {
      setError(m["tools.imageToIco.onlyOneFileError"]());
      return;
    }
    const selected = files[0];
    invalidate();
    if (
      !selected ||
      !isSupportedImage(selected) ||
      selected.size > MAX_FORMAT_INPUT
    ) {
      setFile(null);
      setError(m["tools.imageToIco.invalidFileTypeError"]());
      return;
    }
    setFile(selected);
    setError("");
  }

  function updateOptions(next: IcoOptions) {
    invalidate();
    setError("");
    setOptions(next);
  }

  function errorMessage(code: FormatCode) {
    if (code === "invalid_options")
      return m["tools.imageToIco.selectSizeError"]();
    if (code === "invalid_image") return invalidImageError;
    if (code === "unsupported")
      return m["tools.imageToIco.canvasUnavailableError"]();
    return m["tools.imageToIco.conversionFailedError"]();
  }

  async function convert() {
    if (!file || busy || !options.sizes.length) return;
    invalidate();
    setError("");
    const current = revision.current;
    const abort = new AbortController();
    controller.current = abort;
    const deadline = window.setTimeout(
      () => abort.abort(new ImageFormatError("timeout")),
      120_000,
    );
    setBusy(true);
    try {
      validateSettings({ kind: "ico", options });
      const raster = await decodeBrowser(file, abort.signal);
      const output = await convertBrowser(
        raster,
        { kind: "ico", options },
        abort.signal,
      );
      abort.signal.throwIfAborted();
      if (revision.current !== current) return;
      const bytes = output.bytes;
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "image/x-icon" }),
      );
      resultUrl.current = url;
      setResult({
        bytes,
        name: outputName(file.name, "ico"),
        sizes: output.sizes ?? [...options.sizes].sort((a, b) => b - a),
        url,
      });
    } catch (cause) {
      if (
        revision.current === current &&
        (!abort.signal.aborted ||
          abort.signal.reason instanceof ImageFormatError)
      ) {
        setError(
          cause instanceof ImageFormatError
            ? errorMessage(cause.code)
            : m["tools.imageToIco.conversionFailedError"](),
        );
      }
    } finally {
      window.clearTimeout(deadline);
      if (controller.current === abort) controller.current = null;
      if (revision.current === current) setBusy(false);
    }
  }

  const activePreview = preview?.file === file ? preview.url : "";

  return (
    <div className="grid min-w-0 gap-8">
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
        <div className="grid min-w-0 gap-6">
          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["shared.barcodeTools.readerUploadTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.imageToIco.uploadDescription"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              <ToolFilePicker
                label={
                  file
                    ? m["common.change"]()
                    : m["shared.imagePaletteExtractor.chooseImageLabel"]()
                }
                description={`${m["tools.imageToIco.uploadHint"]()} ${m["tools.imageToIco.supportedFormatsLabel"]()}`}
                accept={["image/*", ".svg", ".tif", ".tiff"]}
                fileName={file?.name}
                clearLabel={m["common.faviconremoveimage"]()}
                isDisabled={busy}
                multiple
                onSelectFiles={selectFiles}
                onClear={() => {
                  invalidate();
                  setFile(null);
                  setError("");
                }}
              />
              {file ? (
                <div className="grid min-h-72 place-items-center overflow-hidden rounded-xl border border-border bg-default/30 p-4">
                  {previewLoading ? (
                    <Skeleton
                      aria-label={m["tools.imageToIco.uploadDescription"]()}
                      className="h-64 w-full rounded-xl"
                    />
                  ) : activePreview ? (
                    <img
                      alt=""
                      src={activePreview}
                      className="max-h-72 max-w-full rounded-lg object-contain"
                    />
                  ) : (
                    <ImageIcon aria-hidden className="size-12 text-muted" />
                  )}
                </div>
              ) : null}
              {file ? (
                <Chip size="sm" variant="secondary">
                  {formatFileSize(file.size, locale)}
                </Chip>
              ) : null}
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["shared.aesTools.encryptoptionscardtitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.imageToIco.optionsDescription"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="gap-6 py-4">
              <fieldset className="grid gap-4">
                <div>
                  <legend className="text-sm font-medium">
                    {m["tools.imageToIco.sizesLabel"]()}
                  </legend>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {m["tools.imageToIco.sizesDescription"]()}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {iconSizes.map((size) => {
                    const selected = options.sizes.includes(size);
                    return (
                      <Checkbox
                        key={size}
                        className={`min-h-11 rounded-xl border px-3 py-2 transition-colors ${
                          selected
                            ? "border-accent bg-accent-soft"
                            : "bg-field-background border-border"
                        }`}
                        isSelected={selected}
                        isDisabled={busy}
                        onChange={() =>
                          updateOptions({
                            ...options,
                            sizes: selected
                              ? options.sizes.filter((value) => value !== size)
                              : [...options.sizes, size],
                          })
                        }
                      >
                        <Checkbox.Content className="flex w-full items-center gap-3">
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          <span className="text-sm font-medium">
                            {size} × {size}
                          </span>
                        </Checkbox.Content>
                      </Checkbox>
                    );
                  })}
                </div>
                {!options.sizes.length ? (
                  <p role="alert" className="text-sm text-danger">
                    {m["tools.imageToIco.selectSizeError"]()}
                  </p>
                ) : null}
              </fieldset>

              <div className="bg-field-background grid gap-4 rounded-xl border border-border p-4">
                <Switch
                  aria-label={m["tools.imageToIco.backgroundLabel"]()}
                  className="w-full"
                  isSelected={options.backgroundEnabled}
                  isDisabled={busy}
                  onChange={(selected) =>
                    updateOptions({
                      ...options,
                      backgroundEnabled: selected === true,
                    })
                  }
                >
                  <Switch.Content className="flex min-h-14 w-full items-center justify-between gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {m["tools.imageToIco.backgroundLabel"]()}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">
                        {m["tools.imageToIco.backgroundDescription"]()}
                      </span>
                    </span>
                    <Switch.Control className="shrink-0">
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
                {options.backgroundEnabled ? (
                  <ToolColorPicker
                    label={m["tools.svgToImage.background"]()}
                    value={options.backgroundColor}
                    onChange={(value) =>
                      updateOptions({ ...options, backgroundColor: value })
                    }
                  />
                ) : null}
              </div>
            </ToolPanelCardContent>
            <ToolPanelCardFooter className="justify-end">
              <Button
                isDisabled={!file || !options.sizes.length || busy}
                onPress={() => void convert()}
              >
                <Sparkles aria-hidden className="size-4" />
                {busy
                  ? m["tools.imageToIco.generatingLabel"]()
                  : m["tools.imageToIco.generateLabel"]()}
              </Button>
            </ToolPanelCardFooter>
          </ToolPanelCard>
        </div>

        <div className="grid min-w-0 gap-4 xl:sticky xl:top-6">
          {error ? (
            <Alert status="danger" role="alert">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{m["common.fmtseverityerror"]()}</Alert.Title>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>{m["shared.macIntegrity.result"]()}</Card.Title>
              <Card.Description>
                {m["tools.imageToIco.resultDescription"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent aria-live="polite" className="gap-5 py-4">
              {busy ? (
                <div
                  role="status"
                  aria-label={m["tools.imageToIco.generatingLabel"]()}
                  className="grid gap-4"
                >
                  <Skeleton className="h-10 w-2/3 rounded-xl" />
                  <Skeleton className="h-44 w-full rounded-xl" />
                  <Skeleton className="h-5 w-full rounded-lg" />
                  <Skeleton className="h-5 w-4/5 rounded-lg" />
                </div>
              ) : result ? (
                <>
                  <div className="grid min-h-44 place-items-center rounded-xl border border-border bg-default/30 p-5">
                    <ImageIcon aria-hidden className="size-16 text-muted" />
                    <p className="max-w-full truncate font-mono text-sm font-medium">
                      {result.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.sizes.map((size) => (
                      <Chip key={size} size="sm" variant="secondary">
                        {size} × {size}
                      </Chip>
                    ))}
                  </div>
                  <dl className="grid gap-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">
                        {m["tools.imageToIco.sizesIncludedLabel"]()}
                      </dt>
                      <dd className="text-right">
                        {result.sizes
                          .map((size) => `${size}×${size}`)
                          .join(", ")}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">
                        {m["tools.audioRecorder.size"]()}
                      </dt>
                      <dd>{formatFileSize(result.bytes.length, locale)}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border bg-default/30 px-6 py-10 text-center">
                  <div className="grid max-w-sm justify-items-center gap-2">
                    <span className="inline-flex size-10 items-center justify-center rounded-full bg-default text-muted">
                      <ImageIcon aria-hidden className="size-5" />
                    </span>
                    <h2 className="font-medium">
                      {m["tools.imageToIco.emptyResultTitle"]()}
                    </h2>
                    <p className="text-sm text-muted">
                      {m["tools.imageToIco.emptyResultDescription"]()}
                    </p>
                  </div>
                </div>
              )}
            </ToolPanelCardContent>
            {result && !busy ? (
              <ToolPanelCardFooter className="justify-end">
                <a
                  href={result.url}
                  download={result.name}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground transition outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus/25"
                >
                  <Download aria-hidden className="size-4" />
                  {m["tools.imageToIco.downloadLabel"]()}
                </a>
              </ToolPanelCardFooter>
            ) : null}
          </ToolPanelCard>
        </div>
      </div>

      <ToolArticle>
        <h2>{m["tools.imageToIco.whatTitle"]()}</h2>
        <p>{m["tools.imageToIco.whatBody"]()}</p>
        <h2>{m["tools.imageToIco.whyTitle"]()}</h2>
        <p>{m["tools.imageToIco.whyBody"]()}</p>
        <h2>{m["tools.imageToIco.howTitle"]()}</h2>
        <ol>
          {[
            m["tools.imageToIco.howSteps0"](),
            m["tools.imageToIco.howSteps1"](),
            m["tools.imageToIco.howSteps2"](),
            m["tools.imageToIco.howSteps3"](),
          ].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h2>{m["tools.imageToIco.tipsTitle"]()}</h2>
        <ul>
          {[
            m["tools.imageToIco.tips0"](),
            m["tools.imageToIco.tips1"](),
            m["tools.imageToIco.tips2"](),
          ].map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function ImageToIco() {
  return (
    <ToolPage>
      <ImageToIcoContent />
    </ToolPage>
  );
}
