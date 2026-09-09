import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Button, Card, Chip, ColorSwatchPicker, Input } from "@heroui/react";
import { ArrowLeftRight, Check, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/base/empty";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolColorPicker } from "@/components/base/tool-color-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  checkContrast,
  hexColor,
  parseColor,
} from "@workspace/tools/color/convert";

const STORAGE_KEYS = {
  foreground: "tools:color-contrast-checker:foreground",
  background: "tools:color-contrast-checker:background",
} as const;
const DEFAULT_FOREGROUND = "#111111";
const DEFAULT_BACKGROUND = "#ffffff";
const SWATCHES = [
  "#0F172A",
  "#111827",
  "#64748B",
  "#FFFFFF",
  "#EF4444",
  "#F97316",
  "#FACC15",
  "#22C55E",
  "#3B82F6",
  "#A855F7",
] as const;

function validColor(value: string) {
  try {
    return parseColor(value);
  } catch {
    return null;
  }
}

function pickerColor(value: string) {
  const parsed = validColor(value);
  return parsed ? hexColor(parsed, parsed.a < 1) : "#000000";
}

function ColorControl({
  label,
  value,
  pickerValue,
  invalidMessage,
  onChange,
}: {
  label: string;
  value: string;
  pickerValue: string;
  invalidMessage: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const parsed = validColor(value);
  const fallback = validColor(pickerValue);

  return (
    <div className="grid gap-3">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          id={id}
          aria-label={label}
          value={value}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          aria-invalid={!parsed || undefined}
          className="font-mono"
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <ToolColorPicker
          label={`${label} picker`}
          value={pickerValue}
          presets={SWATCHES}
          showLabel={false}
          onChange={(nextValue) => {
            const next = validColor(nextValue);
            onChange(
              next
                ? hexColor(
                    { ...next, a: parsed?.a ?? fallback?.a ?? 1 },
                    (parsed?.a ?? fallback?.a ?? 1) < 1,
                  )
                : nextValue,
            );
          }}
        />
      </div>
      {!parsed && value.trim() ? (
        <p role="alert" className="text-sm text-danger">
          {invalidMessage}
        </p>
      ) : null}
      <ColorSwatchPicker
        aria-label={label}
        size="xs"
        value={pickerValue}
        onChange={(color) => {
          if (color) onChange(color.toFormat("hex").toString("hex"));
        }}
      >
        {SWATCHES.map((swatch) => (
          <ColorSwatchPicker.Item key={swatch} color={swatch}>
            <ColorSwatchPicker.Swatch />
            <ColorSwatchPicker.Indicator />
          </ColorSwatchPicker.Item>
        ))}
      </ColorSwatchPicker>
    </div>
  );
}

function Results({
  result,
}: {
  result: ReturnType<typeof checkContrast> | null;
}) {
  const checks = result
    ? [
        [m["tools.colorContrastChecker.aaNormalLabel"](), result.aaNormal],
        [m["tools.colorContrastChecker.aaLargeLabel"](), result.aaLarge],
        [m["tools.colorContrastChecker.aaaNormalLabel"](), result.aaaNormal],
        [m["tools.colorContrastChecker.aaaLargeLabel"](), result.aaaLarge],
      ]
    : [];

  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.colorContrastChecker.alphaNote"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-6 py-4">
        {!result ? (
          <Empty
            role="alert"
            className="min-h-40 border border-border bg-default/40"
          >
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlert className="size-6 text-warning" aria-hidden />
              </EmptyMedia>
              <EmptyDescription>
                {m["tools.colorContrastChecker.invalidInputMessage"]()}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="grid gap-1">
              <span className="text-sm text-muted">
                {m["tools.colorContrastChecker.contrastRatioLabel"]()}
              </span>
              <strong className="font-mono text-4xl tracking-tight">
                {result.ratio.toFixed(2)}:1
              </strong>
            </div>
            <div className="flex flex-wrap gap-2">
              {checks.map(([label, pass]) => (
                <Chip
                  key={String(label)}
                  color={pass ? "success" : "danger"}
                  variant="soft"
                >
                  {pass ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <TriangleAlert className="size-3.5" aria-hidden />
                  )}
                  {label}:{" "}
                  {pass
                    ? m["shared.colorTools.pass"]()
                    : m["shared.colorTools.fail"]()}
                </Chip>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: m["tools.colorContrastChecker.foregroundLabel"](),
                  color: result.foreground,
                },
                {
                  label: m["shared.barcodeTools.generatorBackground"](),
                  color: result.background,
                },
              ].map(({ label, color }) => {
                const swatch = hexColor(color);
                return (
                  <div
                    key={String(label)}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-default/40 p-4"
                  >
                    <span
                      className="size-10 rounded-xl border border-border"
                      style={{ backgroundColor: swatch }}
                      aria-hidden
                    />
                    <span className="grid gap-1">
                      <span className="text-sm font-medium">{label}</span>
                      <code className="text-xs text-muted">{swatch}</code>
                    </span>
                  </div>
                );
              })}
            </div>
            <div>
              <p
                className="rounded-xl border border-black/10 p-4 text-sm"
                style={{
                  color: `rgb(${result.foreground.r} ${result.foreground.g} ${result.foreground.b})`,
                  backgroundColor: `rgb(${result.background.r} ${result.background.g} ${result.background.b})`,
                }}
              >
                {m["tools.colorContrastChecker.sampleText"]()}
              </p>
            </div>
          </>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ColorContrastCheckerContent() {
  const [foreground, setForeground] = useState(DEFAULT_FOREGROUND);
  const [background, setBackground] = useState(DEFAULT_BACKGROUND);
  const [lastValidForeground, setLastValidForeground] =
    useState(DEFAULT_FOREGROUND);
  const [lastValidBackground, setLastValidBackground] =
    useState(DEFAULT_BACKGROUND);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    try {
      setForeground(
        localStorage.getItem(STORAGE_KEYS.foreground) ?? DEFAULT_FOREGROUND,
      );
      setBackground(
        localStorage.getItem(STORAGE_KEYS.background) ?? DEFAULT_BACKGROUND,
      );
    } catch {
      // Storage is optional.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(STORAGE_KEYS.foreground, foreground);
      localStorage.setItem(STORAGE_KEYS.background, background);
    } catch {
      // The checker remains usable without storage.
    }
  }, [background, foreground, storageReady]);

  useEffect(() => {
    if (validColor(foreground)) setLastValidForeground(foreground);
  }, [foreground]);

  useEffect(() => {
    if (validColor(background)) setLastValidBackground(background);
  }, [background]);

  const result = useMemo(() => {
    try {
      return checkContrast(foreground, background);
    } catch {
      return null;
    }
  }, [background, foreground]);
  const previewForeground = validColor(foreground)
    ? foreground
    : lastValidForeground;
  const previewBackground = validColor(background)
    ? background
    : lastValidBackground;

  return (
    <div className="grid gap-8">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.colorContrastChecker.optionsTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.colorContrastChecker.optionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            <ColorControl
              label={m["tools.colorContrastChecker.foregroundLabel"]()}
              value={foreground}
              pickerValue={pickerColor(previewForeground)}
              invalidMessage={m[
                "tools.colorContrastChecker.invalidColorMessage"
              ]()}
              onChange={setForeground}
            />
            <ColorControl
              label={m["shared.barcodeTools.generatorBackground"]()}
              value={background}
              pickerValue={pickerColor(previewBackground)}
              invalidMessage={m[
                "tools.colorContrastChecker.invalidColorMessage"
              ]()}
              onChange={setBackground}
            />
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPress={() => {
                setForeground(background);
                setBackground(foreground);
              }}
            >
              <ArrowLeftRight className="size-4" aria-hidden />
              {m["shared.dateTools.swap"]()}
            </Button>
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <div className="grid gap-6">
          <Results result={result} />
          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>{m["common.faviconpreview"]()}</Card.Title>
              <Card.Description>
                {m["tools.colorContrastChecker.normalTextLabel"]()} /{" "}
                {m["tools.colorContrastChecker.largeTextLabel"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="py-4">
              <div
                className="grid gap-5 rounded-2xl border border-black/10 p-5"
                style={{
                  color: previewForeground,
                  backgroundColor: previewBackground,
                }}
              >
                <div className="grid gap-2">
                  <span className="text-xs font-medium opacity-75">
                    {m["tools.colorContrastChecker.normalTextLabel"]()}
                  </span>
                  <p className="text-base leading-7">
                    {m["tools.colorContrastChecker.sampleText"]()}
                  </p>
                </div>
                <div className="grid gap-2">
                  <span className="text-xs font-medium opacity-75">
                    {m["tools.colorContrastChecker.largeTextLabel"]()}
                  </span>
                  <p className="text-2xl leading-tight font-semibold">
                    {m["tools.colorContrastChecker.sampleText"]()}
                  </p>
                </div>
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>
      </div>

      <ToolArticle>
        <h2>{m["tools.colorContrastChecker.articleWhatTitle"]()}</h2>
        <p>{m["tools.colorContrastChecker.articleWhatBodyOne"]()}</p>
        <p>{m["tools.colorContrastChecker.articleWhatBodyTwo"]()}</p>
        <h2>{m["tools.colorContrastChecker.articleThresholdsTitle"]()}</h2>
        <ul>
          <li>{m["tools.colorContrastChecker.articleThresholdAa"]()}</li>
          <li>{m["tools.colorContrastChecker.articleThresholdAaa"]()}</li>
          <li>{m["tools.colorContrastChecker.articleThresholdLarge"]()}</li>
          <li>{m["tools.colorContrastChecker.articleThresholdUi"]()}</li>
        </ul>
        <p>{m["tools.colorContrastChecker.articleClosing"]()}</p>
      </ToolArticle>
    </div>
  );
}

export function ColorContrastChecker() {
  return (
    <ToolPage instructions={m["tools.colorContrastChecker.usage"]()}>
      <ColorContrastCheckerContent />
    </ToolPage>
  );
}
