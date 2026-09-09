import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  Skeleton,
  Slider,
  Switch,
  TextField,
} from "@heroui/react";
import { Download, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolColorPicker } from "@/components/base/tool-color-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { barcodeBlob } from "./generator-browser";
import { runBarcodeGeneratorWorker } from "./generator-worker-client";
import {
  type BarcodeOptions,
  barcodeFormats,
  barcodeOptionsSchema,
} from "@workspace/tools/encoding/barcode-contract";

const STORAGE_KEY = "tools:barcode-generator:options";
const downloadFormats = ["png", "svg", "jpeg", "webp"] as const;

function PanelHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
  );
}

function SliderField({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-muted">{value}</span>
      </div>
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
    </div>
  );
}

function errorMessage(code: string, locale: "zh-CN" | "en-US") {
  if (code === "too_large") return m["shared.barcode.toolarge"]({}, { locale });
  if (code === "timeout") return m["shared.barcode.timeout"]({}, { locale });
  if (code === "busy") return m["shared.barcode.busy"]({}, { locale });
  if (code === "unsupported")
    return m["shared.barcode.unsupported"]({}, { locale });
  return m["shared.barcode.invalidinput"]({}, { locale });
}

function BarcodeGeneratorPageContent() {
  const id = useId();
  const locale = getLocale() as "zh-CN" | "en-US";
  const [options, setOptions] = useState<BarcodeOptions>(() =>
    barcodeOptionsSchema.parse({}),
  );
  const [urls, setUrls] = useState<
    Partial<Record<(typeof downloadFormats)[number], string>>
  >({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = barcodeOptionsSchema.safeParse(JSON.parse(stored));
      if (parsed.success) setOptions(parsed.data);
    } catch {
      // Invalid or unavailable storage falls back to the audited defaults.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch {
      // Generation remains available when persistence is blocked.
    }
  }, [options]);

  useEffect(() => {
    const abort = new AbortController();
    const created: string[] = [];
    setUrls({});
    setError("");
    setBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const image = await runBarcodeGeneratorWorker(options, abort.signal);
        const next: Partial<Record<(typeof downloadFormats)[number], string>> =
          {};
        for (const format of downloadFormats) {
          const blob = await barcodeBlob(image, format, abort.signal);
          abort.signal.throwIfAborted();
          const url = URL.createObjectURL(blob);
          created.push(url);
          next[format] = url;
        }
        if (!abort.signal.aborted) setUrls(next);
      } catch (cause) {
        if (!abort.signal.aborted) {
          setError(
            cause instanceof Error && "code" in cause
              ? String(cause.code)
              : "invalid_input",
          );
        }
      } finally {
        if (!abort.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [options]);

  const update = <K extends keyof BarcodeOptions>(
    key: K,
    value: BarcodeOptions[K],
  ) => setOptions((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-8">
      <div className="grid gap-6 xl:grid-cols-2">
        <ToolPanelCard className="xl:order-1">
          <PanelHeader
            title={m["shared.aesTools.encryptoptionscardtitle"]({}, { locale })}
            description={m["shared.barcodeTools.generatorOptionsDescription"](
              {},
              { locale },
            )}
          />
          <ToolPanelCardContent className="grid gap-6 py-4 sm:grid-cols-2 xl:grid-cols-3">
            <TextField className="sm:col-span-2 xl:col-span-3">
              <Label>
                {m["shared.aesTools.decrypttextplaintextlabel"]({}, { locale })}
              </Label>
              <Input
                id={`${id}-text`}
                value={options.text}
                maxLength={100000}
                placeholder={m["shared.barcodeTools.generatorTextPlaceholder"](
                  {},
                  { locale },
                )}
                onChange={(event) => update("text", event.currentTarget.value)}
              />
            </TextField>
            <Select
              variant="secondary"
              selectedKey={options.format}
              onSelectionChange={(value) => {
                if (value != null) {
                  update("format", String(value) as BarcodeOptions["format"]);
                }
              }}
              fullWidth
            >
              <Label>{m["common.archiveformat"]({}, { locale })}</Label>
              <Select.Trigger id={`${id}-format`} className="min-h-11">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover className="max-h-80">
                <ListBox className="max-h-72 overflow-y-auto">
                  {barcodeFormats.map((format) => (
                    <ListBox.Item key={format} id={format} textValue={format}>
                      {format}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Switch
              isSelected={options.displayValue}
              onChange={(selected) => update("displayValue", selected === true)}
            >
              <Switch.Content className="flex min-h-11 items-center gap-3">
                <Switch.Control id={`${id}-display`}>
                  <Switch.Thumb />
                </Switch.Control>
                <span>
                  {m["shared.barcodeTools.generatorDisplayValue"](
                    {},
                    { locale },
                  )}
                </span>
              </Switch.Content>
            </Switch>
            <Select
              variant="secondary"
              selectedKey={options.textAlign}
              onSelectionChange={(value) => {
                if (value != null) {
                  update(
                    "textAlign",
                    String(value) as BarcodeOptions["textAlign"],
                  );
                }
              }}
              fullWidth
            >
              <Label>
                {m["shared.barcodeTools.generatorTextAlign"]({}, { locale })}
              </Label>
              <Select.Trigger id={`${id}-align`} className="min-h-11">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item
                    id="left"
                    textValue={m["shared.barcodeTools.generatorLeft"](
                      {},
                      { locale },
                    )}
                  >
                    {m["shared.barcodeTools.generatorLeft"]({}, { locale })}
                  </ListBox.Item>
                  <ListBox.Item
                    id="center"
                    textValue={m["shared.barcodeTools.generatorCenter"](
                      {},
                      { locale },
                    )}
                  >
                    {m["shared.barcodeTools.generatorCenter"]({}, { locale })}
                  </ListBox.Item>
                  <ListBox.Item
                    id="right"
                    textValue={m["shared.barcodeTools.generatorRight"](
                      {},
                      { locale },
                    )}
                  >
                    {m["shared.barcodeTools.generatorRight"]({}, { locale })}
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
            <Select
              variant="secondary"
              selectedKey={options.textPosition}
              onSelectionChange={(value) => {
                if (value != null) {
                  update(
                    "textPosition",
                    String(value) as BarcodeOptions["textPosition"],
                  );
                }
              }}
              fullWidth
            >
              <Label>{m["shared.barcode.textposition"]({}, { locale })}</Label>
              <Select.Trigger id={`${id}-position`} className="min-h-11">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item
                    id="top"
                    textValue={m["shared.barcodeTools.generatorTop"](
                      {},
                      { locale },
                    )}
                  >
                    {m["shared.barcodeTools.generatorTop"]({}, { locale })}
                  </ListBox.Item>
                  <ListBox.Item
                    id="bottom"
                    textValue={m["shared.barcodeTools.generatorBottom"](
                      {},
                      { locale },
                    )}
                  >
                    {m["shared.barcodeTools.generatorBottom"]({}, { locale })}
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
            <ToolColorPicker
              label={m["shared.barcodeTools.generatorLineColor"](
                {},
                { locale },
              )}
              value={options.lineColor}
              onChange={(value) => update("lineColor", value)}
            />
            <ToolColorPicker
              label={m["shared.barcodeTools.generatorBackground"](
                {},
                { locale },
              )}
              value={options.background}
              onChange={(value) => update("background", value)}
            />
            <SliderField
              label={m["shared.barcode.width"]({}, { locale })}
              min={1}
              max={8}
              value={options.width}
              onChange={(value) => update("width", value)}
            />
            <SliderField
              label={m["shared.barcode.height"]({}, { locale })}
              min={20}
              max={300}
              step={2}
              value={options.height}
              onChange={(value) => update("height", value)}
            />
            <SliderField
              label={m["shared.barcodeTools.generatorMargin"]({}, { locale })}
              min={0}
              max={30}
              value={options.margin}
              onChange={(value) => update("margin", value)}
            />
            <SliderField
              label={m["shared.barcodeTools.generatorFontSize"]({}, { locale })}
              min={8}
              max={48}
              value={options.fontSize}
              onChange={(value) => update("fontSize", value)}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard className="xl:order-2">
          <PanelHeader
            title={m["common.faviconpreview"]({}, { locale })}
            description={m["shared.barcodeTools.generatorPreviewDescription"](
              {},
              { locale },
            )}
          />
          <ToolPanelCardContent className="gap-4 py-4">
            {error ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["common.faviconpreview"]({}, { locale })}
                  </Alert.Title>
                  <Alert.Description>
                    {errorMessage(error, locale)}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
            <div className="flex min-h-72 flex-1 items-center justify-center rounded-xl border border-border bg-default/30 p-4">
              {busy ? (
                <div
                  aria-busy="true"
                  aria-label={m["common.faviconpreview"]({}, { locale })}
                  role="status"
                  className="grid w-full max-w-xl gap-3"
                >
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-4 w-2/3 justify-self-center" />
                </div>
              ) : urls.png ? (
                <img
                  alt={m["common.faviconpreview"]({}, { locale })}
                  className="max-h-80 max-w-full object-contain"
                  src={urls.png}
                />
              ) : (
                <div className="h-48 w-full rounded-lg border border-dashed border-border bg-default/30" />
              )}
            </div>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted">
              {m["common.actions.download"]({}, { locale })}
            </span>
            <ToolPanelActionGroup>
              {downloadFormats.map((format) =>
                urls[format] ? (
                  <a
                    key={format}
                    href={urls[format]}
                    download={`barcode.${format}`}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium"
                  >
                    <Download aria-hidden className="size-4" />
                    {format === "webp" ? "WebP" : format.toUpperCase()}
                  </a>
                ) : (
                  <span
                    key={format}
                    aria-disabled="true"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium opacity-50"
                  >
                    <Download aria-hidden className="size-4" />
                    {format === "webp" ? "WebP" : format.toUpperCase()}
                  </span>
                ),
              )}
            </ToolPanelActionGroup>
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>
      <ToolArticle>
        <h2>
          {m["shared.barcodeTools.generatorArticleWhatTitle"]({}, { locale })}
        </h2>
        <p>
          {m["shared.barcodeTools.generatorArticleWhatBody"]({}, { locale })}
        </p>
        <h2>
          {m["shared.barcodeTools.generatorArticleWhyTitle"]({}, { locale })}
        </h2>
        <p>
          {m["shared.barcodeTools.generatorArticleWhyBody"]({}, { locale })}
        </p>
        <h2>
          {m["shared.barcodeTools.generatorArticleHowTitle"]({}, { locale })}
        </h2>
        <p>
          {m["shared.barcodeTools.generatorArticleHowBody"]({}, { locale })}
        </p>
      </ToolArticle>
    </div>
  );
}

export default function BarcodeGeneratorPage() {
  return (
    <ToolPage>
      <BarcodeGeneratorPageContent />
    </ToolPage>
  );
}
