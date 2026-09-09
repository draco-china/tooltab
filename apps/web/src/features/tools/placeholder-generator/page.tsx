import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Chip, Input, Label, Slider } from "@heroui/react";
import { Download, TriangleAlert } from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolColorPicker } from "@/components/base/tool-color-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { useObjectUrl } from "@/hooks/use-object-url";
import {
  buildPlaceholderFilename,
  buildPlaceholderPreviewDataUri,
  buildPlaceholderSvg,
  normalizePageOptions,
  PAGE_PLACEHOLDER_DEFAULTS,
  type PagePlaceholderOptions,
  type PlaceholderBackgroundType,
  type PlaceholderScale,
  resolvePlaceholderText,
} from "@workspace/tools/image/placeholder-layout";
import { createPlaceholderRasterBlob, PLACEHOLDER_PRESETS } from "./page-logic";

type RasterDownloads = {
  jpeg: Blob | null;
  png: Blob | null;
  webp: Blob | null;
};

const EMPTY_DOWNLOADS: RasterDownloads = {
  jpeg: null,
  png: null,
  webp: null,
};
const SCALES = [1, 2, 3] as const;

function PlaceholderGeneratorContent() {
  const fieldId = useId();
  const [options, setOptions] = useState<PagePlaceholderOptions>({
    ...PAGE_PLACEHOLDER_DEFAULTS,
  });
  const [scale, setScale] = useState<PlaceholderScale>(1);
  const [quality, setQuality] = useState(90);
  const [downloads, setDownloads] = useState<RasterDownloads>(EMPTY_DOWNLOADS);
  const [isPreparing, setIsPreparing] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef<AbortController | null>(null);
  const generationRevision = useRef(0);
  const deferredOptions = useDeferredValue(options);
  const normalizedOptions = useMemo(
    () => normalizePageOptions(deferredOptions),
    [deferredOptions],
  );
  const { previewUrl, svgBlob } = useMemo(() => {
    try {
      return {
        previewUrl: buildPlaceholderPreviewDataUri(normalizedOptions),
        svgBlob: new Blob([buildPlaceholderSvg(normalizedOptions, scale)], {
          type: "image/svg+xml",
        }),
      };
    } catch {
      return { previewUrl: "", svgBlob: null };
    }
  }, [normalizedOptions, scale]);
  const pngUrl = useObjectUrl(downloads.png);
  const jpegUrl = useObjectUrl(downloads.jpeg);
  const webpUrl = useObjectUrl(downloads.webp);
  const svgUrl = useObjectUrl(svgBlob);

  useEffect(() => {
    generation.current?.abort();
    const controller = new AbortController();
    const revision = ++generationRevision.current;
    generation.current = controller;
    setDownloads(EMPTY_DOWNLOADS);
    setIsPreparing(true);
    setError("");
    if (!svgBlob) {
      setIsPreparing(false);
      generation.current = null;
      controller.abort();
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const nextQuality = quality / 100;
          const [png, jpeg, webp] = await Promise.all([
            createPlaceholderRasterBlob(
              normalizedOptions,
              "png",
              scale,
              nextQuality,
              controller.signal,
            ),
            createPlaceholderRasterBlob(
              normalizedOptions,
              "jpeg",
              scale,
              nextQuality,
              controller.signal,
            ),
            createPlaceholderRasterBlob(
              normalizedOptions,
              "webp",
              scale,
              nextQuality,
              controller.signal,
            ),
          ]);
          if (
            revision !== generationRevision.current ||
            controller.signal.aborted
          )
            return;
          setDownloads({ jpeg, png, webp });
        } catch {
          if (
            revision === generationRevision.current &&
            !controller.signal.aborted
          ) {
            setDownloads(EMPTY_DOWNLOADS);
            setError(m["tools.placeholderGenerator.exportError"]());
          }
          controller.abort();
        } finally {
          if (revision === generationRevision.current) {
            generation.current = null;
            setIsPreparing(false);
          }
        }
      })();
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (generation.current === controller) generation.current = null;
    };
  }, [normalizedOptions, quality, scale, svgBlob]);

  function updateOption<Key extends keyof PagePlaceholderOptions>(
    key: Key,
    value: PagePlaceholderOptions[Key],
  ) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  const activePreset = PLACEHOLDER_PRESETS.find(
    (preset) =>
      preset.width === normalizedOptions.width &&
      preset.height === normalizedOptions.height,
  );
  const downloadsList = [
    { format: "png", href: svgBlob ? pngUrl : null, label: "PNG" },
    { format: "jpeg", href: svgBlob ? jpegUrl : null, label: "JPEG" },
    { format: "webp", href: svgBlob ? webpUrl : null, label: "WebP" },
    { format: "svg", href: svgBlob ? svgUrl : null, label: "SVG" },
  ] as const;

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool="placeholder-generator">
        <PreviewCard options={normalizedOptions} previewUrl={previewUrl} />

        <ToolPanelCard>
          <PanelHeader
            title={m["shared.aesTools.encryptoptionscardtitle"]()}
            description={m["tools.placeholderGenerator.optionsDescription"]()}
          />
          <ToolPanelCardContent
            className="grid gap-6 py-4"
            aria-busy={isPreparing}
          >
            {error || !svgBlob ? <ExportAlert /> : null}

            <section className="grid gap-4">
              <SectionHeader
                title={m["common.dimensions"]()}
                description={m[
                  "tools.placeholderGenerator.dimensionsDescription"
                ]()}
              />
              <OptionPills
                value={activePreset?.id ?? ""}
                options={PLACEHOLDER_PRESETS.map((preset) => ({
                  label: preset.label,
                  value: preset.id,
                }))}
                onChange={(presetId) => {
                  const preset = PLACEHOLDER_PRESETS.find(
                    (candidate) => candidate.id === presetId,
                  );
                  if (!preset) return;
                  setOptions((current) => ({
                    ...current,
                    width: preset.width,
                    height: preset.height,
                  }));
                }}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  id={`${fieldId}-width`}
                  label={m["common.width"]()}
                  min={1}
                  max={4096}
                  value={normalizedOptions.width}
                  onChange={(value) => updateOption("width", value)}
                />
                <NumberField
                  id={`${fieldId}-height`}
                  label={m["tools.svgToImage.height"]()}
                  min={1}
                  max={4096}
                  value={normalizedOptions.height}
                  onChange={(value) => updateOption("height", value)}
                />
              </div>
            </section>

            <Separator />

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="grid content-start gap-4">
                <SectionHeader
                  title={m["shared.colorTools.background"]()}
                  description={m[
                    "tools.placeholderGenerator.backgroundDescription"
                  ]()}
                />
                <OptionPills
                  value={normalizedOptions.backgroundType}
                  options={[
                    {
                      label: m["common.solid"](),
                      value: "solid",
                    },
                    {
                      label: m["tools.placeholderGenerator.linear"](),
                      value: "linear-gradient",
                    },
                    {
                      label: m["tools.placeholderGenerator.radial"](),
                      value: "radial-gradient",
                    },
                  ]}
                  onChange={(value) =>
                    updateOption(
                      "backgroundType",
                      value as PlaceholderBackgroundType,
                    )
                  }
                />
                {normalizedOptions.backgroundType === "solid" ? (
                  <ToolColorPicker
                    label={m["tools.svgToImage.background"]()}
                    value={normalizedOptions.backgroundColor}
                    onChange={(value) => updateOption("backgroundColor", value)}
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ToolColorPicker
                      label={m[
                        "tools.placeholderGenerator.gradientColor1Label"
                      ]()}
                      value={normalizedOptions.gradientColor1}
                      onChange={(value) =>
                        updateOption("gradientColor1", value)
                      }
                    />
                    <ToolColorPicker
                      label={m[
                        "tools.placeholderGenerator.gradientColor2Label"
                      ]()}
                      value={normalizedOptions.gradientColor2}
                      onChange={(value) =>
                        updateOption("gradientColor2", value)
                      }
                    />
                    {normalizedOptions.backgroundType === "linear-gradient" ? (
                      <div className="sm:col-span-2">
                        <SliderField
                          label={m[
                            "tools.placeholderGenerator.gradientAngleLabel"
                          ]()}
                          min={0}
                          max={360}
                          suffix="°"
                          value={normalizedOptions.gradientAngle}
                          onChange={(value) =>
                            updateOption("gradientAngle", value)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </section>

              <section className="grid content-start gap-4">
                <SectionHeader
                  title={m["tools.placeholderGenerator.text"]()}
                  description={m[
                    "tools.placeholderGenerator.textDescription"
                  ]()}
                />
                <div className="grid gap-2">
                  <Label htmlFor={`${fieldId}-text`}>
                    {m["tools.placeholderGenerator.customTextLabel"]()}
                  </Label>
                  <Input
                    id={`${fieldId}-text`}
                    className="min-h-11"
                    maxLength={500}
                    autoComplete="off"
                    placeholder={`${normalizedOptions.width} × ${normalizedOptions.height}`}
                    value={normalizedOptions.text}
                    onChange={(event) =>
                      updateOption("text", event.currentTarget.value)
                    }
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                  <ToolColorPicker
                    label={m["tools.placeholderGenerator.textcolor"]()}
                    value={normalizedOptions.textColor}
                    onChange={(value) => updateOption("textColor", value)}
                  />
                  <NumberField
                    id={`${fieldId}-font-size`}
                    label={m["shared.barcodeTools.generatorFontSize"]()}
                    min={0}
                    max={500}
                    placeholder={m["shared.pdfEditing.finishAuto"]()}
                    value={normalizedOptions.fontSize}
                    onChange={(value) => updateOption("fontSize", value)}
                  />
                </div>
              </section>
            </div>

            <Separator />

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="grid content-start gap-4">
                <h3 className="font-medium">
                  {m["tools.gifToAnimatedWebpConverter.scaleLabel"]()}
                </h3>
                <OptionPills
                  value={scale}
                  options={SCALES.map((value) => ({
                    label: `${value}x`,
                    value,
                  }))}
                  onChange={(value) => setScale(value as PlaceholderScale)}
                />
              </section>
              <SliderField
                label={m["common.formatquality"]()}
                description={m[
                  "tools.placeholderGenerator.qualityDescription"
                ]()}
                min={10}
                max={100}
                step={5}
                suffix="%"
                value={quality}
                onChange={setQuality}
              />
            </div>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-1">
              <p className="text-sm font-medium">
                {m["common.actions.download"]()}
              </p>
              <p className="text-sm text-muted">
                {m["tools.codeScreenshotGenerator.backgroundModePreset"]()}:{" "}
                {activePreset?.label ??
                  `${normalizedOptions.width} × ${normalizedOptions.height}`}
              </p>
              <p className="text-sm text-muted">
                {m["tools.placeholderGenerator.downloadDescription"]()}
              </p>
            </div>
            <ToolPanelActionGroup>
              {downloadsList.map(({ format, href, label }) => (
                <DownloadButton
                  key={format}
                  href={href}
                  label={label}
                  download={buildPlaceholderFilename(
                    normalizedOptions,
                    format,
                    scale,
                  )}
                />
              ))}
            </ToolPanelActionGroup>
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>

      <PlaceholderArticle />
    </div>
  );
}

function PreviewCard({
  options,
  previewUrl,
}: {
  options: PagePlaceholderOptions;
  previewUrl: string;
}) {
  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["common.archivepreview"]()}
        description={m["tools.placeholderGenerator.previewDescription"]()}
      />
      <ToolPanelCardContent className="gap-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip variant="tertiary">
            {m["tools.placeholderGenerator.currentSizeLabel"]()}:{" "}
            {options.width} × {options.height}
          </Chip>
          <Chip variant="secondary">{resolvePlaceholderText(options)}</Chip>
        </div>
        <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-xl border border-border bg-default/30 p-4">
          {previewUrl ? (
            <img
              alt={m["tools.placeholderGenerator.name"]()}
              className="max-h-[70vh] max-w-full rounded-lg border border-border bg-white/70 object-contain shadow-sm"
              src={previewUrl}
            />
          ) : null}
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function OptionPills<Value extends string | number>({
  onChange,
  options,
  value,
}: {
  onChange: (value: Value) => void;
  options: readonly { label: string; value: Value }[];
  value: Value | "";
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {options.map((option) => (
        <Button
          key={option.label}
          size="sm"
          variant={value === option.value ? "secondary" : "outline"}
          aria-pressed={value === option.value}
          onPress={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function NumberField({
  id,
  label,
  max,
  min,
  onChange,
  placeholder,
  value,
}: {
  id: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  placeholder?: string;
  value: number;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className="min-h-11"
        inputMode="numeric"
        max={max}
        min={min}
        placeholder={placeholder}
        type="number"
        value={String(value)}
        onChange={(event) => onChange(Number(event.currentTarget.value) || 0)}
      />
    </div>
  );
}

function SliderField({
  description,
  label,
  max,
  min,
  onChange,
  step = 1,
  suffix = "",
  value,
}: {
  description?: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  suffix?: string;
  value: number;
}) {
  return (
    <div className="grid content-start gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="font-mono text-sm text-muted">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        aria-label={label}
        className="min-h-11"
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
      {description ? (
        <p className="text-xs leading-5 text-muted">{description}</p>
      ) : null}
    </div>
  );
}

function DownloadButton({
  download,
  href,
  label,
}: {
  download: string;
  href: string | null;
  label: string;
}) {
  if (!href)
    return (
      <Button size="sm" variant="outline" isDisabled>
        <Download aria-hidden className="size-4" />
        {label}
      </Button>
    );
  return (
    <a
      download={download}
      href={href}
      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-default focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
    >
      <Download aria-hidden className="size-4" />
      {label}
    </a>
  );
}

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

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-2">
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}

function Separator() {
  return <div aria-hidden className="border-t border-separator" />;
}

function ExportAlert() {
  return (
    <Alert status="danger" role="alert">
      <Alert.Indicator>
        <TriangleAlert aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Description>
          {m["tools.placeholderGenerator.exportError"]()}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function PlaceholderArticle() {
  return (
    <ToolArticle>
      <h2>{m["shared.barcodeTools.generatorArticleWhatTitle"]()}</h2>
      <p>{m["tools.placeholderGenerator.articleWhatBody"]()}</p>
      <h2>{m["shared.barcodeTools.generatorArticleWhyTitle"]()}</h2>
      <p>{m["tools.placeholderGenerator.articleWhyBody"]()}</p>
      <h2>{m["shared.barcodeTools.generatorArticleHowTitle"]()}</h2>
      <p>{m["tools.placeholderGenerator.articleHowBody"]()}</p>
      <h2>{m["tools.placeholderGenerator.articleTipsTitle"]()}</h2>
      <ul>
        <li>{m["tools.placeholderGenerator.articleTips0"]()}</li>
        <li>{m["tools.placeholderGenerator.articleTips1"]()}</li>
        <li>{m["tools.placeholderGenerator.articleTips2"]()}</li>
      </ul>
    </ToolArticle>
  );
}

export default function PlaceholderGenerator() {
  return (
    <ToolPage>
      <PlaceholderGeneratorContent />
    </ToolPage>
  );
}
