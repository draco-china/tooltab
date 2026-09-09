import { validateSvg, svgViewport } from "@workspace/tools/image/svg";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Input,
  Link,
  Slider,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { Download, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/base/code-editor";
import { ToolColorPicker } from "@/components/base/tool-color-picker";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { COLOR_PRESETS } from "@/lib/color-presets";
import { outputFilename } from "@workspace/tools/image/options";
import { m } from "@/paraglide/messages.js";
import {
  rasterizeSvg,
  type SvgImageOptions,
  browserXml,
} from "../image-formats/svg";

const errorMessages = {
  invalidDimensions: m["common.invaliddimensions"],
  invalidQuality: m["common.error"],
  unsupported: m["common.unsupported"],
  decodeError: m["common.decodeerror"],
  canvasUnsupported: m["common.canvasunsupported"],
  svgInvalid: m["common.svginvalid"],
  invalidFile: m["common.invalidfile"],
  error: m["common.error"],
} as const;

const defaults: SvgImageOptions = {
  width: 800,
  height: 600,
  scale: 1,
  format: "png",
  quality: 0.92,
  transparent: true,
  background: "#ffffff",
};
function SvgToImageContent() {
  const [source, setSource] = useState("");
  const [options, setOptions] = useState(defaults);
  const [locked, setLocked] = useState(true);
  const [preview, setPreview] = useState("");
  const [parsed, setParsed] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
  } | null>(null);
  const [result, setResult] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState<keyof typeof errorMessages | null>(null);
  const [busy, setBusy] = useState(false);
  const task = useRef<AbortController | null>(null);
  const readId = useRef(0);
  const ratio = useRef(4 / 3);
  useEffect(
    () => () => {
      task.current?.abort();
      readId.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  useEffect(() => {
    if (!source.trim()) {
      setParsed(null);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        const svg = validateSvg(source, browserXml);
        setParsed(svg.source);
        setOptions((old) => ({ ...old, width: svg.width, height: svg.height }));
        ratio.current = svg.width / svg.height;
        setError(null);
      } catch {
        setParsed(null);
        setError("svgInvalid");
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [source]);
  useEffect(() => {
    if (!parsed) {
      setPreview("");
      return;
    }
    try {
      const url = URL.createObjectURL(
        new Blob(
          [
            svgViewport(
              parsed,
              options.width,
              options.height,
              options.scale,
              browserXml,
            ),
          ],
          { type: "image/svg+xml" },
        ),
      );
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    } catch {
      setPreview("");
    }
  }, [parsed, options.width, options.height, options.scale]);
  function update<K extends keyof SvgImageOptions>(
    key: K,
    value: SvgImageOptions[K],
  ) {
    setOptions((old) => ({ ...old, [key]: value }));
    setResult(null);
  }
  function dimension(key: "width" | "height", value: number) {
    setOptions((old) => ({
      ...old,
      [key]: value,
      ...(locked
        ? key === "width"
          ? { height: Math.max(1, Math.round(value / ratio.current)) }
          : { width: Math.max(1, Math.round(value * ratio.current)) }
        : {}),
    }));
    setResult(null);
  }
  async function load(file?: File) {
    if (!file || busy) return;
    const id = ++readId.current;
    if (
      !file.size ||
      file.size > 2000000 ||
      (file.type && file.type !== "image/svg+xml") ||
      !/\.svg$/i.test(file.name)
    ) {
      setError("invalidFile");
      return;
    }
    try {
      const value = await file.text();
      if (readId.current !== id) return;
      validateSvg(value, browserXml);
      if (value !== source) setParsed(null);
      setSource(value);
      setFileInfo({ name: file.name, size: file.size });
      setResult(null);
      setError(null);
    } catch {
      if (readId.current === id) setError("svgInvalid");
    }
  }
  async function generate() {
    if (task.current) return;
    readId.current++;
    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const blob = await rasterizeSvg(source, options, controller.signal);
      if (!controller.signal.aborted)
        setResult({
          url: URL.createObjectURL(blob),
          name: outputFilename(
            fileInfo?.name || "svg-image.svg",
            options.format,
          ),
        });
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error &&
            [
              "invalidDimensions",
              "invalidQuality",
              "unsupported",
              "decodeError",
              "canvasUnsupported",
              "svgInvalid",
            ].includes(error.message)
            ? (error.message as keyof typeof errorMessages)
            : "error",
        );
    } finally {
      if (task.current === controller) {
        task.current = null;
        setBusy(false);
      }
    }
  }
  function cancel() {
    task.current?.abort();
    task.current = null;
    setBusy(false);
  }
  function reset() {
    cancel();
    readId.current++;
    setSource("");
    setPreview("");
    setParsed(null);
    setOptions(defaults);
    setLocked(true);
    setFileInfo(null);
    setResult(null);
    setError(null);
  }
  return (
    <div className="grid min-w-0 gap-6" data-tool-panels>
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <div className="min-w-0">
            <Card.Title>{m["tools.svgToImage.uploadtitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.svgToImage.uploaddescription"]()}
            </Card.Description>
          </div>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          <ToolFilePicker
            label={m["tools.svgToImage.drop"]()}
            description={m["tools.svgToImage.limitations"]()}
            accept={[".svg", "image/svg+xml"]}
            isDisabled={busy}
            fileName={fileInfo?.name}
            onSelect={(file) => void load(file)}
            onClear={fileInfo ? reset : undefined}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
            <span>{m["tools.svgToImage.source"]()}</span>
            <CodeEditor
              aria-label={m["tools.svgToImage.source"]()}
              language="xml"
              modelPath="tooltab://svg-to-image/source.svg"
              readOnly={busy}
              value={source}
              height={240}
              onChange={(value) => {
                if (value.length > 2000000) return;
                readId.current++;
                setPreview("");
                setParsed(null);
                setSource(value);
                setFileInfo(null);
                setResult(null);
              }}
            />
          </div>
          {fileInfo ? (
            <p className="text-sm wrap-break-word text-muted-foreground">
              {fileInfo.name} · SVG ·{" "}
              {new Intl.NumberFormat().format(fileInfo.size)} B
            </p>
          ) : null}
          {preview ? (
            <div
              className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border bg-muted p-3"
              style={{
                backgroundColor:
                  options.transparent && options.format !== "jpeg"
                    ? undefined
                    : options.background,
              }}
            >
              <img
                className="block max-h-96 w-full object-contain"
                src={preview}
                alt={m["tools.svgToImage.preview"]()}
                style={{ aspectRatio: `${options.width} / ${options.height}` }}
              />
            </div>
          ) : null}
          {parsed ? (
            <p className="text-sm wrap-break-word text-muted-foreground">
              {options.width * options.scale} × {options.height * options.scale}{" "}
              px
            </p>
          ) : null}
        </ToolPanelCardContent>
      </ToolPanelCard>

      {parsed ? (
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <div className="min-w-0">
              <Card.Title>{m["tools.svgToImage.optionstitle"]()}</Card.Title>
              <Card.Description>
                {m["tools.svgToImage.optionsdescription"]()}
              </Card.Description>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <fieldset className="grid gap-5" disabled={busy}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  className="flex min-w-0 flex-1 flex-col gap-2 text-sm"
                  htmlFor="svg-to-image-width"
                >
                  {m["common.width"]()}
                  <Input
                    id="svg-to-image-width"
                    type="number"
                    min="1"
                    max="8192"
                    value={options.width}
                    onChange={(e) => dimension("width", Number(e.target.value))}
                  />
                </label>
                <label
                  className="flex min-w-0 flex-1 flex-col gap-2 text-sm"
                  htmlFor="svg-to-image-height"
                >
                  {m["tools.svgToImage.height"]()}
                  <Input
                    id="svg-to-image-height"
                    type="number"
                    min="1"
                    max="8192"
                    value={options.height}
                    onChange={(e) =>
                      dimension("height", Number(e.target.value))
                    }
                  />
                </label>
              </div>
              <Switch
                isSelected={locked}
                onChange={(checked) => {
                  setLocked(checked === true);
                  ratio.current = options.width / options.height || 1;
                }}
              >
                <Switch.Content className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <span>{m["tools.svgToImage.lockratio"]()}</span>
                </Switch.Content>
              </Switch>
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                <span>{m["tools.svgToImage.scale"]()}</span>
                <ToggleButtonGroup
                  selectionMode="single"
                  className="w-full [&_button]:min-h-11"
                  aria-label={m["tools.svgToImage.scale"]()}
                  selectedKeys={new Set([String(options.scale)])}
                  isDisabled={busy}
                  onSelectionChange={(selection) => {
                    const value = String([...selection][0] ?? "");
                    if (value) update("scale", Number(value));
                  }}
                >
                  {[1, 2, 3].map((scale) => (
                    <ToggleButton key={scale} id={String(scale)}>
                      {scale}×
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                <span>{m["tools.svgToImage.format"]()}</span>
                <ToggleButtonGroup
                  selectionMode="single"
                  className="w-full [&_button]:min-h-11"
                  aria-label={m["tools.svgToImage.format"]()}
                  selectedKeys={new Set([options.format])}
                  isDisabled={busy}
                  onSelectionChange={(selection) => {
                    const value = String([...selection][0] ?? "");
                    if (value)
                      update("format", value as SvgImageOptions["format"]);
                  }}
                >
                  {["png", "jpeg", "webp"].map((format) => (
                    <ToggleButton key={format} id={format}>
                      {format.toUpperCase()}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </div>
              {options.format !== "png" ? (
                <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                  {m["tools.svgToImage.quality"]()} ·{" "}
                  {Math.round(options.quality * 100)}%
                  <Slider
                    isDisabled={busy}
                    aria-label={m["tools.svgToImage.quality"]()}
                    className="min-h-11"
                    minValue={10}
                    maxValue={100}
                    value={Math.round(options.quality * 100)}
                    onChange={(value) => update("quality", Number(value) / 100)}
                  >
                    <Slider.Track>
                      <Slider.Fill />
                      <Slider.Thumb />
                    </Slider.Track>
                  </Slider>
                </div>
              ) : null}
              <Switch
                isSelected={options.transparent && options.format !== "jpeg"}
                isDisabled={options.format === "jpeg"}
                onChange={(checked) => update("transparent", checked === true)}
              >
                <Switch.Content className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <span>{m["tools.svgToImage.transparent"]()}</span>
                </Switch.Content>
              </Switch>
              {!options.transparent || options.format === "jpeg" ? (
                <ToolColorPicker
                  label={m["tools.svgToImage.background"]()}
                  value={options.background}
                  presets={COLOR_PRESETS}
                  onChange={(value) => update("background", value)}
                />
              ) : null}
            </fieldset>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-between gap-3">
            <Button variant="ghost" type="button" onClick={reset}>
              <RotateCcw aria-hidden className="size-4" />
              {m["common.actions.reset"]()}
            </Button>
            <ToolPanelActionGroup className="justify-end">
              {busy ? (
                <Button variant="outline" type="button" onClick={cancel}>
                  {m["common.actions.cancel"]()}
                </Button>
              ) : null}
              <Button
                type="button"
                isDisabled={busy || !preview}
                onClick={generate}
              >
                <Sparkles aria-hidden className="size-4" />
                {busy
                  ? m["common.processing"]()
                  : m["tools.svgToImage.generate"]()}
              </Button>
            </ToolPanelActionGroup>
          </ToolPanelCardFooter>
        </ToolPanelCard>
      ) : null}

      <ToolPanelCard>
        <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <Card.Title>{m["tools.svgToImage.resulttitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.svgToImage.resultdescription"]()}
            </Card.Description>
          </div>
          {result ? (
            <Link
              href={result.url}
              download={result.name}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Download aria-hidden className="size-4" />
              {m["common.download"]()}
            </Link>
          ) : null}
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          {error ? (
            <p
              className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {errorMessages[error]({})}
            </p>
          ) : null}
          {busy ? (
            <div
              role="status"
              className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"
            >
              {m["common.processing"]()}
            </div>
          ) : result ? (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                {result.name} · {options.width * options.scale} ×{" "}
                {options.height * options.scale} px
              </p>
              <div
                className="flex min-h-80 items-center justify-center overflow-hidden rounded-xl border bg-muted p-4"
                style={{
                  backgroundColor:
                    options.transparent && options.format !== "jpeg"
                      ? undefined
                      : options.background,
                }}
              >
                <img
                  className="block max-h-96 w-full object-contain"
                  src={result.url}
                  alt={m["tools.svgToImage.resulttitle"]()}
                  style={{
                    aspectRatio: `${options.width} / ${options.height}`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div
              role="status"
              className="flex min-h-48 flex-col items-center justify-center gap-2 text-center"
            >
              <p className="font-medium">
                {m["tools.svgToImage.emptytitle"]()}
              </p>
              <p className="text-sm text-muted-foreground">
                {m["tools.svgToImage.emptydescription"]()}
              </p>
            </div>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>
    </div>
  );
}

export default function SvgToImage() {
  return (
    <ToolPage>
      <SvgToImageContent />
    </ToolPage>
  );
}
