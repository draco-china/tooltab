import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Description,
  FieldError,
  Input,
  Label,
  Switch,
  TextField,
} from "@heroui/react";
import { useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolColorPicker } from "@/components/base/tool-color-picker";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  COLOR_FORMATS,
  type ColorFormat,
  CSS_KEYWORDS,
  colorValues,
  hexColor,
  parseColor,
  type Rgba,
} from "@workspace/tools/color/convert";

const DEFAULT_COLOR: Rgba = { r: 52, g: 152, b: 219, a: 1 };
const STORAGE_KEYS = {
  rgba: "tools:color-converter:rgba",
  showAlpha: "tools:color-converter:show-alpha",
} as const;
const SWATCHES = [
  "#1D4ED8",
  "#0F766E",
  "#CA8A04",
  "#DC2626",
  "#7C3AED",
  "#DB2777",
  "#111827",
  "#FFFFFF",
] as const;
const OPAQUE_FORMATS = new Set<ColorFormat>([
  "hwb",
  "lab",
  "lch",
  "cmyk",
  "keyword",
]);

function readStoredColor() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.rgba);
    if (!stored) return DEFAULT_COLOR;
    const parsed = JSON.parse(stored) as Partial<Rgba>;
    if (
      [parsed.r, parsed.g, parsed.b, parsed.a].every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    ) {
      return parseColor(hexColor(parsed as Rgba, true));
    }
  } catch {
    // Invalid or unavailable storage falls back to the default color.
  }
  return DEFAULT_COLOR;
}

function readStoredAlpha() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.showAlpha);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function EditableFormat({
  format,
  label,
  description,
  value,
  onCommit,
}: {
  format: ColorFormat;
  label: string;
  description: string;
  value: string;
  onCommit: (value: string) => boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  function commit() {
    if (draft === value) {
      setInvalid(false);
      return;
    }
    setInvalid(!onCommit(draft));
  }

  return (
    <TextField
      fullWidth
      isInvalid={invalid}
      className="gap-2 rounded-xl border border-border bg-default/30 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <Label htmlFor={id}>{label}</Label>
          <Description>{description}</Description>
        </div>
        <ToolCopyButton
          value={value}
          copyLabel={m["common.actions.copyResult"]()}
          copiedLabel={m["common.actions.copied"]()}
        />
      </div>
      <Input
        id={id}
        name={`${format}-color`}
        list={format === "keyword" ? "color-converter-keywords" : undefined}
        autoComplete="off"
        spellCheck={false}
        data-testid={`${format}-input`}
        value={draft}
        aria-invalid={invalid || undefined}
        className="min-h-11 border border-border font-mono"
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      {invalid ? (
        <FieldError>
          {m["tools.colorContrastChecker.invalidColorMessage"]()}
        </FieldError>
      ) : null}
    </TextField>
  );
}

function OptionsCard({
  color,
  showAlpha,
  values,
  onColorChange,
  onShowAlphaChange,
}: {
  color: Rgba;
  showAlpha: boolean;
  values: Record<ColorFormat, string>;
  onColorChange: (color: Rgba) => void;
  onShowAlphaChange: (value: boolean) => void;
}) {
  const pickerValue = hexColor(color);
  const selectOpaque = (value: string) => {
    const parsed = parseColor(value, "hex");
    onColorChange({ ...parsed, a: color.a });
  };

  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.colorContrastChecker.optionsTitle"]()}
        </Card.Title>
        <Card.Description>
          {m["tools.colorConverter.optionsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-6 py-4">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-default/30 p-4">
          <div
            aria-hidden="true"
            className="size-16 shrink-0 rounded-xl border border-border shadow-sm"
            style={{ background: values.hex }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              {m["tools.colorConverter.currentColorLabel"]()}
            </div>
            <code className="font-mono text-xs text-muted-foreground uppercase">
              {values.hex}
            </code>
          </div>
        </div>

        <ToolColorPicker
          label={m["tools.colorConverter.currentColorLabel"]()}
          value={pickerValue}
          onChange={selectOpaque}
          presets={SWATCHES}
          showLabel={false}
        />

        <div className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border p-4">
          <div className="grid gap-1">
            <Label>{m["tools.colorPicker.showAlpha"]()}</Label>
            <Description>
              {m["tools.colorConverter.alphaDescription"]()}
            </Description>
          </div>
          <Switch
            aria-label={m["tools.colorPicker.showAlpha"]()}
            isSelected={showAlpha}
            onChange={onShowAlphaChange}
          >
            <Switch.Content>
              <span className="sr-only">
                {m["tools.colorPicker.showAlpha"]()}
              </span>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>

        <div className="flex flex-wrap gap-2">
          {SWATCHES.map((swatch) => (
            <Button
              key={swatch}
              type="button"
              variant="ghost"
              size="sm"
              isIconOnly
              aria-label={swatch}
              className={`size-8 rounded-lg border transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                pickerValue === swatch
                  ? "border-accent ring-2 ring-accent/20"
                  : "border-border"
              }`}
              style={{ backgroundColor: swatch }}
              onPress={() => selectOpaque(swatch)}
            />
          ))}
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultsCard({
  color,
  values,
  onColorChange,
}: {
  color: Rgba;
  values: Record<ColorFormat, string>;
  onColorChange: (color: Rgba) => void;
}) {
  const info = {
    hex: m["shared.colorTools.colorConverterHexInfo"],
    rgb: m["shared.colorTools.colorConverterRgbInfo"],
    hsl: m["shared.colorTools.colorConverterHslInfo"],
    hsv: m["shared.colorTools.colorConverterHsvInfo"],
    hwb: m["shared.colorTools.colorConverterHwbInfo"],
    lab: m["shared.colorTools.colorConverterLabInfo"],
    lch: m["shared.colorTools.colorConverterLchInfo"],
    cmyk: m["shared.colorTools.colorConverterCmykInfo"],
    keyword: m["shared.colorTools.colorConverterKeywordInfo"],
  } satisfies Record<ColorFormat, () => string>;

  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.colorConverter.resultsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-4 py-4 lg:grid-cols-2">
        {COLOR_FORMATS.map((format) => (
          <EditableFormat
            key={format}
            format={format}
            label={
              format === "keyword"
                ? m["shared.colorTools.colorConverterKeywordLabel"]()
                : format.toUpperCase()
            }
            description={info[format]()}
            value={values[format]}
            onCommit={(value) => {
              try {
                const parsed = parseColor(value, format);
                onColorChange(
                  OPAQUE_FORMATS.has(format)
                    ? { ...parsed, a: color.a }
                    : parsed,
                );
                return true;
              } catch {
                return false;
              }
            }}
          />
        ))}
        <datalist id="color-converter-keywords">
          {CSS_KEYWORDS.map((keyword) => (
            <option key={keyword} value={keyword}>
              {keyword}
            </option>
          ))}
        </datalist>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function PreviewCard({ values }: { values: Record<ColorFormat, string> }) {
  const summaries = [
    { label: "HEX", value: values.hex },
    { label: "RGB", value: values.rgb },
    {
      label: m["shared.colorTools.colorConverterKeywordLabel"](),
      value: values.keyword,
    },
  ];
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["common.faviconpreview"]()}</Card.Title>
        <Card.Description>
          {m["tools.colorConverter.previewDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-6 py-4">
        <div className="rounded-2xl border border-border bg-default p-4">
          <div
            className="h-36 rounded-xl border border-border shadow-sm"
            style={{ background: values.hex }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {summaries.map((summary) => (
            <div
              key={summary.label}
              className="grid gap-1 rounded-xl border border-border bg-default/30 p-3"
            >
              <div className="text-xs font-medium text-muted-foreground uppercase">
                {summary.label}
              </div>
              <code className="font-mono text-xs break-all">
                {summary.value}
              </code>
            </div>
          ))}
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ConverterArticle() {
  const formats = [
    ["HEX", m["shared.colorTools.colorConverterHexInfo"]()],
    ["RGB", m["shared.colorTools.colorConverterRgbInfo"]()],
    ["HSL", m["shared.colorTools.colorConverterHslInfo"]()],
    ["HSV", m["shared.colorTools.colorConverterHsvInfo"]()],
    ["HWB", m["shared.colorTools.colorConverterHwbInfo"]()],
    ["LAB", m["shared.colorTools.colorConverterLabInfo"]()],
    ["LCH", m["shared.colorTools.colorConverterLchInfo"]()],
    ["CMYK", m["shared.colorTools.colorConverterCmykInfo"]()],
    [
      m["shared.colorTools.colorConverterKeywordLabel"](),
      m["shared.colorTools.colorConverterKeywordInfo"](),
    ],
  ] as const;
  return (
    <ToolArticle>
      <h2>{m["shared.barcodeTools.generatorArticleWhatTitle"]()}</h2>
      <p>{m["tools.colorConverter.articleWhatBody"]()}</p>
      <h2>{m["shared.colorTools.colorConverterArticleFormatsTitle"]()}</h2>
      <ul>
        {formats.map(([label, description]) => (
          <li key={label}>
            <code>{label}</code>: {description}
          </li>
        ))}
      </ul>
    </ToolArticle>
  );
}

function ColorConverterContent() {
  const [color, setColor] = useState<Rgba>(DEFAULT_COLOR);
  const [showAlpha, setShowAlpha] = useState(true);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const values = useMemo(
    () => colorValues(color, showAlpha),
    [color, showAlpha],
  );

  useEffect(() => {
    setColor(readStoredColor());
    setShowAlpha(readStoredAlpha());
    setStorageLoaded(true);
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEYS.rgba, JSON.stringify(color));
      localStorage.setItem(STORAGE_KEYS.showAlpha, String(showAlpha));
    } catch {
      // Storage failure does not affect conversion.
    }
  }, [color, showAlpha, storageLoaded]);

  return (
    <div className="grid gap-8">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <OptionsCard
          color={color}
          showAlpha={showAlpha}
          values={values}
          onColorChange={setColor}
          onShowAlphaChange={setShowAlpha}
        />
        <div className="grid gap-6">
          <ResultsCard color={color} values={values} onColorChange={setColor} />
          <PreviewCard values={values} />
        </div>
      </div>
      <ConverterArticle />
    </div>
  );
}

export default function ColorConverter() {
  return (
    <ToolPage instructions={m["tools.colorConverter.usage"]()}>
      <ColorConverterContent />
    </ToolPage>
  );
}
