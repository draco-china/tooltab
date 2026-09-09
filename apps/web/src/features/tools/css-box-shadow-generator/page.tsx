import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Badge,
  Button,
  Card,
  FieldError,
  Input,
  Label,
  Slider,
  Switch,
  TextField,
} from "@heroui/react";
import { ArrowDown, ArrowUp, Moon, Plus, Trash2 } from "lucide-react";
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
  buildBoxShadow,
  DEFAULT_SHADOW_CONFIG,
  formatShadowLayer,
  getAlphaPercentage,
  getOpaqueHexColor,
  normalizeShadowConfig,
  parseHexColor,
  type ShadowConfig,
  updateHexAlpha,
  updateHexColorRgb,
} from "@workspace/tools/css/box-shadow";

type ShadowLayer = ShadowConfig & { id: string };

const STORAGE_KEYS = {
  layers: "tools:css-box-shadow-generator:layers",
  activeLayerId: "tools:css-box-shadow-generator:active-layer-id",
  darkBackground: "tools:css-box-shadow-generator:dark-background",
} as const;
const SWATCHES = [
  "#00000033",
  "#00000066",
  "#00000099",
  "#0F172A33",
  "#FFFFFF33",
  "#FFFFFF66",
  "#38BDF866",
  "#6366F166",
  "#F9731666",
  "#F43F5E66",
] as const;
const COLOR_PICKER_SWATCHES = [
  ...new Set(SWATCHES.map((color) => color.slice(0, 7))),
];
const RANGES = {
  offsetX: [-120, 120],
  offsetY: [-120, 120],
  blur: [0, 200],
  spread: [-60, 60],
} as const;

function createLayerId() {
  return `shadow-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function createLayer(overrides: Partial<ShadowConfig> = {}): ShadowLayer {
  return {
    id: createLayerId(),
    ...normalizeShadowConfig({ ...DEFAULT_SHADOW_CONFIG, ...overrides }),
  };
}

function normalizeLayer(value: Partial<ShadowLayer>): ShadowLayer {
  return {
    id: typeof value.id === "string" && value.id ? value.id : createLayerId(),
    ...normalizeShadowConfig(value),
  };
}

function readStoredLayers() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.layers);
    if (!stored) return [createLayer()];
    const parsed = JSON.parse(stored) as Partial<ShadowLayer>[];
    if (!Array.isArray(parsed)) return [createLayer()];
    const layers = parsed.map(normalizeLayer);
    return layers.length ? layers : [createLayer()];
  } catch {
    return [createLayer()];
  }
}

function NumberControl({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const update = (next: number) =>
    onChange(Math.min(max, Math.max(min, Math.round(next))));
  return (
    <TextField className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-2">
        <Slider
          aria-label={label}
          minValue={min}
          maxValue={max}
          value={value}
          onChange={(next) => update(Number(next))}
        >
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value}
          className="min-h-11 border border-border"
          onChange={(event) => update(Number(event.currentTarget.value))}
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
    </TextField>
  );
}

function LayerList({
  layers,
  activeId,
  onSelect,
  onMove,
  onRemove,
}: {
  layers: ShadowLayer[];
  activeId: string;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section
      aria-label={m["tools.cssBoxShadowGenerator.layersTitle"]()}
      className="min-w-0 overflow-x-auto"
    >
      <div className="flex w-max gap-2 pb-3">
        {layers.map((layer, index) => (
          <div
            key={layer.id}
            className={`w-52 shrink-0 rounded-xl border p-3 ${
              activeId === layer.id
                ? "border-accent bg-accent-soft"
                : "border-border bg-default/30"
            }`}
          >
            <Button
              type="button"
              variant="ghost"
              fullWidth
              className="grid w-full gap-2 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              onClick={() => onSelect(layer.id)}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full border border-border"
                  style={{ backgroundColor: layer.color }}
                />
                <span className="font-medium">
                  {m["common.cssgenLayer"]({ index: String(index + 1) })}
                </span>
                {layer.inset ? (
                  <Badge>{m["common.cssgenInset"]()}</Badge>
                ) : null}
              </span>
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-8 rounded-lg border border-border bg-card"
                  style={{ boxShadow: formatShadowLayer(layer) }}
                />
                <code className="truncate text-xs text-muted-foreground">
                  {layer.offsetX}px {layer.offsetY}px {layer.blur}px{" "}
                  {layer.spread}px
                </code>
              </span>
            </Button>
            <div className="mt-2 flex justify-end gap-1 border-t border-border pt-2">
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={m["shared.addressTools.up"]()}
                isDisabled={index === 0}
                onPress={() => onMove(layer.id, -1)}
              >
                <ArrowUp aria-hidden className="size-4" />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={m["shared.addressTools.down"]()}
                isDisabled={index === layers.length - 1}
                onPress={() => onMove(layer.id, 1)}
              >
                <ArrowDown aria-hidden className="size-4" />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={m["common.formatremove"]()}
                isDisabled={layers.length === 1}
                onPress={() => onRemove(layer.id)}
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShadowArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.cssBoxShadowGenerator.articleTitle"]()}</h2>
      <p>{m["tools.cssBoxShadowGenerator.articleParagraph1"]()}</p>
      <p>{m["tools.cssBoxShadowGenerator.articleParagraph2"]()}</p>
      <p>{m["tools.cssBoxShadowGenerator.articleParagraph3"]()}</p>
      <ul>
        <li>{m["tools.cssBoxShadowGenerator.articleTip1"]()}</li>
        <li>{m["tools.cssBoxShadowGenerator.articleTip2"]()}</li>
        <li>{m["tools.cssBoxShadowGenerator.articleTip3"]()}</li>
        <li>{m["tools.cssBoxShadowGenerator.articleTip4"]()}</li>
      </ul>
    </ToolArticle>
  );
}

function BoxShadowGeneratorContent() {
  const [layers, setLayers] = useState<ShadowLayer[]>(readStoredLayers);
  const [activeId, setActiveId] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.activeLayerId);
      return layers.some((layer) => layer.id === stored)
        ? (stored as string)
        : (layers[0]?.id ?? "");
    } catch {
      return layers[0]?.id ?? "";
    }
  });
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.darkBackground) === "true";
    } catch {
      return false;
    }
  });
  const activeIndex = Math.max(
    0,
    layers.findIndex((layer) => layer.id === activeId),
  );
  const active = layers[activeIndex] ?? layers[0] ?? createLayer();
  const shadowValue = useMemo(() => buildBoxShadow(layers), [layers]);
  const cssOutput = `box-shadow: ${shadowValue};`;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.layers, JSON.stringify(layers));
      localStorage.setItem(STORAGE_KEYS.activeLayerId, active.id);
      localStorage.setItem(STORAGE_KEYS.darkBackground, String(dark));
    } catch {
      // Storage failure does not affect editing.
    }
  }, [active.id, dark, layers]);

  const patchActive = (patch: Partial<ShadowLayer>) =>
    setLayers((current) =>
      current.map((layer) =>
        layer.id === active.id ? { ...layer, ...patch } : layer,
      ),
    );

  function move(id: string, direction: -1 | 1) {
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length)
        return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [
        next[nextIndex] as ShadowLayer,
        next[index] as ShadowLayer,
      ];
      return next;
    });
  }

  return (
    <div className="grid gap-8">
      <div
        className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]"
        data-tool-panels
      >
        <ToolPanelCard className="min-w-0">
          <Card.Header className="flex flex-wrap items-start justify-between gap-4 border-b border-separator">
            <div className="min-w-0 flex-1">
              <Card.Title className="flex items-center gap-2">
                {m["tools.cssBoxShadowGenerator.layersTitle"]()}{" "}
                <Badge>{layers.length}</Badge>
              </Card.Title>
              <Card.Description>
                {m["tools.cssBoxShadowGenerator.layersDescription"]()}
              </Card.Description>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onPress={() => {
                const layer = createLayer();
                setLayers((current) => [...current, layer]);
                setActiveId(layer.id);
              }}
            >
              <Plus aria-hidden data-slot="icon" />{" "}
              {m["common.cssgenAddLayer"]()}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="min-w-0 gap-4 py-4">
            <LayerList
              layers={layers}
              activeId={active.id}
              onSelect={setActiveId}
              onMove={move}
              onRemove={(id) => {
                if (layers.length === 1) return;
                const nextLayers = layers.filter((layer) => layer.id !== id);
                setLayers(nextLayers);
                if (id === active.id) setActiveId(nextLayers[0]?.id ?? "");
              }}
            />
            <div className="grid min-w-0 gap-4 border-t border-separator pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">
                  {m["tools.cssBoxShadowGenerator.layerSettingsTitle"]()}
                </div>
                <Badge>
                  {m["common.cssgenLayer"]({ index: String(activeIndex + 1) })}
                </Badge>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((key) => (
                  <NumberControl
                    key={key}
                    label={
                      key === "offsetX"
                        ? m["tools.cssBoxShadowGenerator.offsetXlabel"]()
                        : key === "offsetY"
                          ? m["tools.cssBoxShadowGenerator.offsetYlabel"]()
                          : key === "blur"
                            ? m["tools.cssBoxShadowGenerator.blurLabel"]()
                            : m["tools.cssBoxShadowGenerator.spreadLabel"]()
                    }
                    value={active[key]}
                    min={RANGES[key][0]}
                    max={RANGES[key][1]}
                    unit={m["tools.cssBoxShadowGenerator.unitPixels"]()}
                    onChange={(value) => patchActive({ [key]: value })}
                  />
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="grid min-w-0 gap-3">
                  <TextField
                    isInvalid={
                      active.color.trim() !== "" && !parseHexColor(active.color)
                    }
                  >
                    <Label>{m["common.cssgenColor"]()}</Label>
                    <Input
                      name="shadow-color"
                      value={active.color}
                      className="min-h-11 border border-border font-mono"
                      onChange={(event) =>
                        patchActive({ color: event.currentTarget.value })
                      }
                    />
                    {active.color.trim() !== "" &&
                    !parseHexColor(active.color) ? (
                      <FieldError>
                        {m["tools.colorContrastChecker.invalidColorMessage"]()}
                      </FieldError>
                    ) : null}
                  </TextField>
                  <ToolColorPicker
                    label={m["common.cssgenColor"]()}
                    showLabel={false}
                    value={getOpaqueHexColor(active.color)}
                    presets={COLOR_PICKER_SWATCHES}
                    onChange={(value) =>
                      patchActive({
                        color: updateHexColorRgb(active.color, value),
                      })
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    {SWATCHES.map((swatch) => (
                      <Button
                        key={swatch}
                        type="button"
                        variant="ghost"
                        size="sm"
                        isIconOnly
                        aria-label={`${m["common.cssgenColor"]()} ${swatch}`}
                        className="size-8 rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        style={{ backgroundColor: swatch }}
                        onPress={() => patchActive({ color: swatch })}
                      />
                    ))}
                  </div>
                </div>
                <div className="grid content-start gap-4">
                  <NumberControl
                    label={m["tools.colorPicker.alpha"]()}
                    value={getAlphaPercentage(active.color)}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(value) =>
                      patchActive({
                        color: updateHexAlpha(active.color, value),
                      })
                    }
                  />
                  <Switch
                    aria-label={m["common.cssgenInset"]()}
                    isSelected={active.inset}
                    onChange={(value) => patchActive({ inset: value })}
                  >
                    <Switch.Content className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border px-3">
                      <span>{m["common.cssgenInset"]()}</span>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                </div>
              </div>
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>
        <div className="min-w-0 self-start xl:sticky xl:top-6">
          <ToolPanelCard>
            <Card.Header className="flex items-start justify-between gap-4 border-b border-separator">
              <div>
                <Card.Title>{m["common.archivepreview"]()}</Card.Title>
                <Card.Description>
                  {m["tools.cssBoxShadowGenerator.outputHint"]()}
                </Card.Description>
              </div>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={m[
                  "tools.cssBoxShadowGenerator.darkBackgroundLabel"
                ]()}
                aria-pressed={dark}
                onPress={() => setDark((value) => !value)}
              >
                <Moon aria-hidden className="size-4" />
              </Button>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              <div
                className={`grid min-h-56 place-items-center rounded-xl border border-border p-4 ${dark ? "bg-zinc-950" : "bg-default/30"}`}
              >
                <div
                  className={`grid min-h-40 w-full max-w-sm gap-3 rounded-xl border p-5 ${dark ? "border-white/10 bg-zinc-900 text-zinc-100" : "border-border bg-card"}`}
                  style={{ boxShadow: shadowValue }}
                >
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    box-shadow
                  </span>
                  <div className="grid gap-3">
                    <div className="h-3 w-24 rounded-full bg-current/10" />
                    <div className="h-3 w-40 rounded-full bg-current/10" />
                    <div className="h-14 rounded-2xl border border-current/10 bg-current/5" />
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    {m["tools.cssBoxShadowGenerator.outputTitle"]()}
                  </span>
                  <ToolCopyButton
                    value={cssOutput}
                    copyLabel={m["common.actions.copy"]()}
                    copiedLabel={m["common.actions.copied"]()}
                    variant="ghost"
                  />
                </div>
                <pre className="overflow-x-auto rounded-xl border border-border bg-default/30 p-3 text-xs leading-6">
                  <code>{cssOutput}</code>
                </pre>
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>
      </div>
      <ShadowArticle />
    </div>
  );
}

export default function BoxShadowGenerator() {
  return (
    <ToolPage instructions={m["tools.cssBoxShadowGenerator.usage"]()}>
      <BoxShadowGeneratorContent />
    </ToolPage>
  );
}
