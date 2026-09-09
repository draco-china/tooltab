/* biome-ignore-all lint/suspicious/noArrayIndexKey: Gradient rows are controlled by their array position. */
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  Slider,
  TextArea,
  TextField,
} from "@heroui/react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  FileJson2,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolColorPicker } from "@/components/base/tool-color-picker";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  BLENDS,
  buildGradient,
  cssColor,
  DEFAULT_GRADIENT,
  type GradientLayer,
  gradientSchema,
  gradientSvg,
  SIZES,
  TYPES,
} from "@workspace/tools/css/generators";
import { renderGradient } from "../css-generators/render";

type PresetId = "aurora" | "sunset" | "ocean" | "neon" | "dawn" | "citrus";
type EditorState = {
  layers: GradientLayer[];
  active: number;
  activeStop: number;
  format: "hex" | "rgba";
  width: number;
  height: number;
  preset: PresetId | null;
};

const STORAGE_KEY = "tools:css-gradient-generator:editor-state";
const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 900;
const EDITOR_DEFAULT_LAYER: GradientLayer = {
  ...DEFAULT_GRADIENT,
  stops: [
    { color: "#0EA5E9FF", position: 0 },
    { color: "#8B5CFFFF", position: 52 },
    { color: "#F43F5EFF", position: 100 },
  ],
};
const layer = (overrides: Partial<GradientLayer>): GradientLayer => ({
  ...structuredClone(EDITOR_DEFAULT_LAYER),
  ...overrides,
});
const PRESETS: readonly { id: PresetId; layers: GradientLayer[] }[] = [
  {
    id: "aurora",
    layers: [
      layer({
        colorSpace: "oklch",
        stops: [
          { color: "#0B1020FF", position: 0 },
          { color: "#2563EBFF", position: 42 },
          { color: "#22D3EEFF", position: 100 },
        ],
      }),
      layer({
        type: "radial",
        angle: 0,
        centerX: 22,
        centerY: 18,
        colorSpace: "oklch",
        blendMode: "screen",
        stops: [
          { color: "#A855F7CC", position: 0 },
          { color: "#A855F700", position: 62 },
          { color: "#00000000", position: 100 },
        ],
      }),
    ],
  },
  {
    id: "sunset",
    layers: [
      layer({
        angle: 120,
        stops: [
          { color: "#FDBA74FF", position: 0 },
          { color: "#FB7185FF", position: 48 },
          { color: "#9333EAFF", position: 100 },
        ],
      }),
      layer({
        type: "radial",
        angle: 0,
        centerX: 78,
        centerY: 18,
        radialShape: "ellipse",
        blendMode: "screen",
        stops: [
          { color: "#FDE68AFF", position: 0 },
          { color: "#FDE68A00", position: 65 },
          { color: "#FDE68A00", position: 100 },
        ],
      }),
    ],
  },
  {
    id: "ocean",
    layers: [
      layer({
        type: "radial",
        angle: 0,
        centerX: 50,
        centerY: 30,
        colorSpace: "oklch",
        stops: [
          { color: "#0F172AFF", position: 0 },
          { color: "#1E3A8AFF", position: 58 },
          { color: "#0EA5E9FF", position: 100 },
        ],
      }),
      layer({
        angle: 160,
        blendMode: "soft-light",
        stops: [
          { color: "#38BDF866", position: 0 },
          { color: "#0EA5E900", position: 62 },
          { color: "#0EA5E900", position: 100 },
        ],
      }),
    ],
  },
  {
    id: "neon",
    layers: [
      layer({
        type: "conic",
        angle: 10,
        colorSpace: "oklch",
        stops: [
          { color: "#22D3EEFF", position: 0 },
          { color: "#A855F7FF", position: 38 },
          { color: "#F43F5EFF", position: 70 },
          { color: "#22D3EEFF", position: 100 },
        ],
      }),
      layer({
        type: "radial",
        angle: 0,
        radialSize: "closest-side",
        blendMode: "screen",
        stops: [
          { color: "#00000000", position: 0 },
          { color: "#0F172AFF", position: 100 },
        ],
      }),
    ],
  },
  {
    id: "dawn",
    layers: [
      layer({
        type: "radial",
        angle: 0,
        centerY: 40,
        radialShape: "ellipse",
        stops: [
          { color: "#FEF3C7FF", position: 0 },
          { color: "#FBCFE8FF", position: 48 },
          { color: "#93C5FDFF", position: 100 },
        ],
      }),
    ],
  },
  {
    id: "citrus",
    layers: [
      layer({
        angle: 110,
        stops: [
          { color: "#FDE047FF", position: 0 },
          { color: "#84CC16FF", position: 55 },
          { color: "#22D3EEFF", position: 100 },
        ],
      }),
      layer({
        type: "radial",
        angle: 0,
        centerX: 82,
        centerY: 22,
        radialSize: "closest-side",
        blendMode: "overlay",
        stops: [
          { color: "#F59E0B88", position: 0 },
          { color: "#F59E0B00", position: 68 },
          { color: "#F59E0B00", position: 100 },
        ],
      }),
    ],
  },
];

function defaultState(): EditorState {
  return {
    layers: structuredClone(PRESETS[0]?.layers ?? [EDITOR_DEFAULT_LAYER]),
    active: 0,
    activeStop: 0,
    format: "hex",
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    preset: "aurora",
  };
}

function storedState(): EditorState {
  const fallback = defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const stored = JSON.parse(raw) as Partial<EditorState>;
    const parsed = gradientSchema.safeParse({
      layers: stored.layers,
      format: stored.format,
    });
    if (!parsed.success) return fallback;
    return {
      layers: parsed.data.layers,
      active: Math.min(
        Math.max(0, Math.round(stored.active ?? 0)),
        parsed.data.layers.length - 1,
      ),
      activeStop: Math.max(0, Math.round(stored.activeStop ?? 0)),
      format: parsed.data.format,
      width: Math.min(
        4096,
        Math.max(64, Math.round(stored.width ?? DEFAULT_WIDTH)),
      ),
      height: Math.min(
        4096,
        Math.max(64, Math.round(stored.height ?? DEFAULT_HEIGHT)),
      ),
      preset: null,
    };
  } catch {
    return fallback;
  }
}

function useDownload() {
  const url = useRef<string | null>(null);
  const rendering = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const clear = () => {
    rendering.current?.abort();
    rendering.current = null;
    setBusy(false);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  };
  useEffect(
    () => () => {
      rendering.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  return {
    busy,
    clear,
    async save(
      value: Blob | ((signal: AbortSignal) => Blob | Promise<Blob>),
      name: string,
    ) {
      clear();
      const controller = new AbortController();
      rendering.current = controller;
      setBusy(true);
      try {
        const blob =
          typeof value === "function" ? await value(controller.signal) : value;
        controller.signal.throwIfAborted();
        url.current = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url.current;
        anchor.download = name;
        anchor.click();
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
  };
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(key) => key != null && onChange(String(key))}
    >
      <Label>{label}</Label>
      <Select.Trigger className="min-h-11 border border-border">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item
              key={option.value}
              id={option.value}
              textValue={option.label}
            >
              {option.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function SliderField({
  label,
  value,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex justify-between gap-2 text-sm font-medium">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {Math.round(value)}
          {suffix}
        </span>
      </div>
      <Slider
        aria-label={label}
        minValue={0}
        maxValue={max}
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

function randomizeEditorLayer(current: GradientLayer): GradientLayer {
  const stopCount = 3 + Math.floor(Math.random() * 3);
  const positions = [0, 100];
  for (let index = 0; index < stopCount - 2; index += 1) {
    positions.push(5 + Math.random() * 90);
  }
  positions.sort((left, right) => left - right);
  return {
    ...current,
    angle: Math.round(Math.random() * 360),
    centerX: Math.round(10 + Math.random() * 80),
    centerY: Math.round(10 + Math.random() * 80),
    radialShape: Math.random() > 0.5 ? "circle" : "ellipse",
    radialSize:
      SIZES[Math.floor(Math.random() * SIZES.length)] ?? current.radialSize,
    colorSpace: Math.random() > 0.5 ? "srgb" : "oklch",
    stops: positions.map((position) => ({
      color: `#${Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0")
        .toUpperCase()}FF`,
      position,
    })),
  };
}

function importEditorLayers(input: string) {
  if (input.length > 1_000_000) throw new Error("Gradient JSON is too large");
  const parsed = JSON.parse(input) as unknown;
  const rawLayers = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (parsed as { layers?: unknown }).layers
      : null;
  if (!Array.isArray(rawLayers)) throw new Error("Invalid gradient JSON");
  const layers = rawLayers.map((rawLayer) => {
    if (!rawLayer || typeof rawLayer !== "object") return rawLayer;
    const {
      id: _layerId,
      stops,
      ...rest
    } = rawLayer as Record<string, unknown>;
    return {
      ...rest,
      stops: Array.isArray(stops)
        ? stops.map((rawStop) => {
            if (!rawStop || typeof rawStop !== "object") return rawStop;
            const { id: _stopId, ...stop } = rawStop as Record<string, unknown>;
            return stop;
          })
        : stops,
    };
  });
  return gradientSchema.parse({ layers, format: "hex" }).layers;
}

const blendLabels = {
  normal: m["common.cssgenNormal"],
  multiply: m["common.cssgenMultiply"],
  screen: m["common.cssgenScreen"],
  overlay: m["common.cssgenOverlay"],
  darken: m["common.cssgenDarken"],
  lighten: m["common.cssgenLighten"],
  "color-dodge": m["tools.cssGradientGenerator.blendColorDodge"],
  "color-burn": m["tools.cssGradientGenerator.blendColorBurn"],
  "hard-light": m["tools.cssGradientGenerator.blendHardLight"],
  "soft-light": m["tools.cssGradientGenerator.blendSoftLight"],
  difference: m["common.cssgenDifference"],
  exclusion: m["common.cssgenExclusion"],
  hue: m["common.cssgenHue"],
  saturation: m["common.cssgenSaturation"],
  color: m["common.cssgenColor"],
  luminosity: m["common.cssgenLuminosity"],
} as const;

const colorSpaceLabels = {
  srgb: m["common.cssgenSrgb"],
  oklch: m["common.cssgenOklch"],
} as const;

const typeLabels = {
  linear: m["common.cssgenLinear"],
  radial: m["common.cssgenRadial"],
  conic: m["tools.cssGradientGenerator.typeConic"],
} as const;

const shapeLabels = {
  circle: m["common.cssgenCircle"],
  ellipse: m["common.cssgenEllipse"],
} as const;

const sizeLabels = {
  "closest-side": m["common.cssgenClosestSide"],
  "closest-corner": m["common.cssgenClosestCorner"],
  "farthest-side": m["common.cssgenFarthestSide"],
  "farthest-corner": m["common.cssgenFarthestCorner"],
} as const;

const formatLabels = {
  hex: m["tools.cssGradientGenerator.formatHex"],
  rgba: m["common.cssgenRgba"],
} as const;

const presetLabels = {
  aurora: m["common.cssgenAurora"],
  sunset: m["tools.cssGradientGenerator.presetSunset"],
  ocean: m["tools.cssGradientGenerator.presetOcean"],
  neon: m["tools.cssGradientGenerator.presetNeon"],
  dawn: m["tools.cssGradientGenerator.presetDawn"],
  citrus: m["tools.cssGradientGenerator.presetCitrus"],
} as const;

function PageArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.cssGradientGenerator.article.title"]()}</h2>
      <p>{m["tools.cssGradientGenerator.article.paragraph1"]()}</p>
      <p>{m["tools.cssGradientGenerator.article.paragraph2"]()}</p>
      <p>{m["tools.cssGradientGenerator.article.paragraph3"]()}</p>
      <ul>
        <li>{m["tools.cssGradientGenerator.article.tip1"]()}</li>
        <li>{m["tools.cssGradientGenerator.article.tip2"]()}</li>
        <li>{m["tools.cssGradientGenerator.article.tip3"]()}</li>
      </ul>
    </ToolArticle>
  );
}

function StopRow({
  stop,
  active,
  onSelect,
  onColor,
  onPosition,
  onRemove,
}: {
  stop: GradientLayer["stops"][number];
  active: boolean;
  onSelect: () => void;
  onColor: (value: string) => void;
  onPosition: (value: number) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(stop.color);
  useEffect(() => setDraft(stop.color), [stop.color]);
  const commit = () => {
    try {
      const normalized = cssColor(draft, "hex");
      setDraft(normalized);
      onColor(normalized);
    } catch {
      onColor("#000000FF");
      setDraft("#000000FF");
    }
  };
  return (
    <div
      className={`grid gap-3 rounded-xl border p-4 ${active ? "border-accent bg-accent-soft" : "border-border bg-default/30"}`}
      onFocusCapture={onSelect}
      onPointerDown={onSelect}
    >
      <div className="flex items-center gap-3">
        <span
          className="size-8 rounded-lg border border-border"
          style={{ backgroundColor: stop.color }}
        />
        <span className="flex-1 text-xs font-medium text-muted-foreground">
          {m["tools.cssGradientGenerator.stopColor"]()}
        </span>
        <Button type="button" size="sm" variant="ghost" onPress={onRemove}>
          <Trash2 aria-hidden data-slot="icon" />
          {m["tools.cssGradientGenerator.deleteStop"]()}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <div className="grid gap-2">
          <Input
            aria-label={m["tools.cssGradientGenerator.stopColor"]()}
            placeholder="#0EA5E9FF"
            value={draft}
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
          <ToolColorPicker
            label={m["tools.cssGradientGenerator.stopColor"]()}
            showLabel={false}
            value={cssColor(stop.color, "hex").slice(0, 7)}
            onChange={(value) =>
              onColor(`${value}${cssColor(stop.color, "hex").slice(7, 9)}`)
            }
          />
        </div>
        <TextField>
          <Label>{m["tools.cssGradientGenerator.stopPosition"]()}</Label>
          <div className="flex items-center gap-2">
            <Input
              aria-label={m["tools.cssGradientGenerator.stopPosition"]()}
              type="number"
              min={0}
              max={100}
              value={Math.round(stop.position)}
              className="min-h-11 border border-border"
              onChange={(event) =>
                onPosition(Number(event.currentTarget.value))
              }
            />
            <span>%</span>
          </div>
        </TextField>
      </div>
      <Slider
        aria-label={m["tools.cssGradientGenerator.stopPosition"]()}
        minValue={0}
        maxValue={100}
        value={stop.position}
        onChange={(value) => onPosition(Number(value))}
      >
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>
    </div>
  );
}

function GradientGeneratorContent() {
  const [state, setState] = useState<EditorState>(defaultState);
  const [storageReady, setStorageReady] = useState(false);
  const [json, setJson] = useState("");
  const [layerError, setLayerError] = useState(false);
  const [stopError, setStopError] = useState(false);
  const [jsonError, setJsonError] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [draggingStop, setDraggingStop] = useState<number | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const download = useDownload();
  const active =
    state.layers[state.active] ?? state.layers[0] ?? EDITOR_DEFAULT_LAYER;
  const result = useMemo(
    () => buildGradient({ layers: state.layers, format: state.format }),
    [state.format, state.layers],
  );
  const serializedConfig = useMemo(
    () => JSON.stringify({ version: 1, layers: state.layers }, null, 2),
    [state.layers],
  );

  useEffect(() => {
    setState(storedState());
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* Storage failure does not affect editing. */
    }
  }, [state, storageReady]);
  useEffect(() => {
    if (draggingStop === null) return;
    const move = (event: PointerEvent) => {
      const rect = track.current?.getBoundingClientRect();
      if (rect?.width)
        updateStop(draggingStop, {
          position: ((event.clientX - rect.left) / rect.width) * 100,
        });
    };
    const up = () => setDraggingStop(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  function mutate(updater: (current: EditorState) => EditorState) {
    download.clear();
    setState(updater);
  }
  function patchActive(patch: Partial<GradientLayer>) {
    setLayerError(false);
    mutate((current) => ({
      ...current,
      preset: null,
      layers: current.layers.map((item, index) =>
        index === current.active ? { ...item, ...patch } : item,
      ),
    }));
  }
  function updateStop(
    index: number,
    patch: { color?: string; position?: number },
  ) {
    setStopError(false);
    patchActive({
      stops: active.stops.map((stop, stopIndex) =>
        stopIndex === index
          ? {
              ...stop,
              color: patch.color ?? stop.color,
              position:
                patch.position === undefined
                  ? stop.position
                  : Math.min(100, Math.max(0, patch.position)),
            }
          : stop,
      ),
    });
  }
  function addStop(position?: number) {
    if (active.stops.length >= 32) return;
    const sortedStops = [...active.stops].sort(
      (left, right) => left.position - right.position,
    );
    const widestPair = sortedStops.slice(1).reduce(
      (widest, right, index) => {
        const pair = { left: sortedStops[index] as typeof right, right };
        return pair.right.position - pair.left.position >
          widest.right.position - widest.left.position
          ? pair
          : widest;
      },
      {
        left: sortedStops[0] as GradientLayer["stops"][number],
        right: sortedStops[1] as GradientLayer["stops"][number],
      },
    );
    const nextPosition =
      position === undefined
        ? Math.round((widestPair.left.position + widestPair.right.position) / 2)
        : Math.min(100, Math.max(0, position));
    const nearest = sortedStops.reduce(
      (best, stop) =>
        Math.abs(stop.position - nextPosition) <
        Math.abs(best.position - nextPosition)
          ? stop
          : best,
      sortedStops[0] as GradientLayer["stops"][number],
    );
    const nextStop = {
      color: nearest?.color ?? "#FFFFFF",
      position: nextPosition,
    };
    const stops = [...active.stops, nextStop].sort(
      (left, right) => left.position - right.position,
    );
    mutate((current) => ({
      ...current,
      activeStop: stops.indexOf(nextStop),
      preset: null,
      layers: current.layers.map((item, index) =>
        index === current.active ? { ...item, stops } : item,
      ),
    }));
  }
  function moveLayer(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= state.layers.length) return;
    mutate((current) => {
      const layers = [...current.layers];
      [layers[index], layers[nextIndex]] = [
        layers[nextIndex] as GradientLayer,
        layers[index] as GradientLayer,
      ];
      return { ...current, layers, active: nextIndex, preset: null };
    });
  }
  function saveText(text: string, type: string, name: string) {
    void download.save(new Blob([text], { type }), name);
  }

  const blendDeclaration =
    state.layers.length > 1
      ? `background-blend-mode: ${result.blendMode};`
      : "";
  const backgroundImageDeclaration = `background-image: ${result.backgroundImage};`;
  const backgroundDeclaration = [
    `background: ${result.backgroundImage};`,
    blendDeclaration,
  ]
    .filter(Boolean)
    .join("\n");
  const cssOutput = [backgroundImageDeclaration, blendDeclaration]
    .filter(Boolean)
    .join("\n");
  const preview = (
    <div
      aria-label={m["common.archivepreview"]()}
      role="img"
      className="min-h-72 border-b border-border bg-default/30 shadow-inner sm:min-h-80"
      style={{
        backgroundBlendMode: result.blendMode,
        backgroundImage: result.backgroundImage,
      }}
    />
  );

  return (
    <div className="grid gap-8">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.64fr)]"
        data-tool-panels
      >
        <div className="order-2 grid content-start gap-6 xl:order-0">
          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["tools.sitemapXmlGenerator.seopresets"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.cssGradientGenerator.presetsSubtitle"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="grid gap-3 py-4 sm:grid-cols-2 xl:grid-cols-3">
              {PRESETS.map((preset) => {
                const result = buildGradient({
                  layers: preset.layers,
                  format: "hex",
                });
                return (
                  <Button
                    type="button"
                    key={preset.id}
                    variant="ghost"
                    fullWidth
                    className={`overflow-hidden rounded-xl border text-start ${state.preset === preset.id ? "border-accent bg-accent-soft" : "border-border"}`}
                    onClick={() =>
                      mutate((current) => ({
                        ...current,
                        layers: structuredClone(preset.layers),
                        active: 0,
                        activeStop: 0,
                        preset: preset.id,
                      }))
                    }
                  >
                    <span
                      className="block h-20 border-b border-border"
                      style={{
                        backgroundImage: result.backgroundImage,
                        backgroundBlendMode: result.blendMode,
                      }}
                    />
                    <span className="block px-3 py-2.5 font-medium">
                      {presetLabels[preset.id]()}
                    </span>
                  </Button>
                );
              })}
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="flex flex-wrap items-start justify-between gap-4 border-b border-separator">
              <div>
                <Card.Title>
                  {m["tools.cssBoxShadowGenerator.layersTitle"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.cssGradientGenerator.layersSubtitle"]()}
                </Card.Description>
              </div>
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                isDisabled={state.layers.length >= 8}
                onPress={() => {
                  const next = layer({ blendMode: "screen" });
                  mutate((current) => ({
                    ...current,
                    layers: [
                      ...current.layers.slice(0, current.active + 1),
                      next,
                      ...current.layers.slice(current.active + 1),
                    ],
                    active: current.active + 1,
                    activeStop: 0,
                    preset: null,
                  }));
                }}
              >
                <Plus aria-hidden data-slot="icon" />
                {m["common.cssgenAddLayer"]()}
              </Button>
            </Card.Header>
            <ToolPanelCardContent className="grid gap-4 py-4">
              {layerError ? (
                <Alert status="danger" role="alert">
                  <Alert.Content>
                    <Alert.Description>
                      {m["tools.cssGradientGenerator.minLayerHint"]()}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              {state.layers.map((item, index) => (
                <div
                  key={index}
                  className={`grid gap-3 rounded-xl border p-4 ${index === state.active ? "border-accent bg-accent-soft" : "border-border bg-default/30"}`}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex flex-wrap items-center gap-2 text-start"
                    onClick={() =>
                      mutate((current) => ({
                        ...current,
                        active: index,
                        activeStop: 0,
                      }))
                    }
                  >
                    <span className="font-semibold">
                      {m["common.cssgenLayer"]({ index: String(index + 1) })}
                    </span>
                    <Badge>{typeLabels[item.type]()}</Badge>
                    <Badge>{item.stops.length}</Badge>
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      isDisabled={state.layers.length >= 8}
                      onPress={() =>
                        mutate((current) => ({
                          ...current,
                          layers: [
                            ...current.layers.slice(0, index + 1),
                            structuredClone(item),
                            ...current.layers.slice(index + 1),
                          ],
                          active: index + 1,
                          activeStop: 0,
                          preset: null,
                        }))
                      }
                    >
                      <Copy aria-hidden data-slot="icon" />
                      {m["tools.cssGradientGenerator.duplicateLayer"]()}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      isDisabled={index === 0}
                      onPress={() => moveLayer(index, -1)}
                    >
                      <ArrowUp aria-hidden data-slot="icon" />
                      {m["tools.cssGradientGenerator.moveUp"]()}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      isDisabled={index === state.layers.length - 1}
                      onPress={() => moveLayer(index, 1)}
                    >
                      <ArrowDown aria-hidden data-slot="icon" />
                      {m["tools.cssGradientGenerator.moveDown"]()}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        if (state.layers.length === 1) {
                          setLayerError(true);
                          return;
                        }
                        mutate((current) => ({
                          ...current,
                          layers: current.layers.filter(
                            (_, layerIndex) => layerIndex !== index,
                          ),
                          active: Math.max(
                            0,
                            Math.min(current.active, current.layers.length - 2),
                          ),
                          activeStop: 0,
                          preset: null,
                        }));
                      }}
                    >
                      <Trash2 aria-hidden data-slot="icon" />
                      {m["tools.cssGradientGenerator.deleteLayer"]()}
                    </Button>
                  </div>
                </div>
              ))}
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["tools.cssGradientGenerator.settingsTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.cssGradientGenerator.settingsSubtitle"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="grid gap-5 py-4">
              <div className="grid gap-2">
                <Label>{m["common.cssgenType"]()}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {TYPES.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      className="min-h-11"
                      variant={active.type === type ? "primary" : "outline"}
                      onPress={() => patchActive({ type })}
                    >
                      {typeLabels[type]()}
                    </Button>
                  ))}
                </div>
              </div>
              {active.type !== "radial" ? (
                <SliderField
                  label={m["tools.cssGradientGenerator.angle"]()}
                  value={active.angle}
                  max={360}
                  suffix="°"
                  onChange={(angle) => patchActive({ angle })}
                />
              ) : null}
              {active.type !== "linear" ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <SliderField
                    label={m["tools.cssGradientGenerator.centerX"]()}
                    value={active.centerX}
                    max={100}
                    suffix="%"
                    onChange={(centerX) => patchActive({ centerX })}
                  />
                  <SliderField
                    label={m["tools.cssGradientGenerator.centerY"]()}
                    value={active.centerY}
                    max={100}
                    suffix="%"
                    onChange={(centerY) => patchActive({ centerY })}
                  />
                </div>
              ) : null}
              {active.type === "radial" ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    label={m["common.cssgenShape"]()}
                    value={active.radialShape}
                    options={(["circle", "ellipse"] as const).map((value) => ({
                      value,
                      label: shapeLabels[value](),
                    }))}
                    onChange={(value) =>
                      patchActive({
                        radialShape: value as GradientLayer["radialShape"],
                      })
                    }
                  />
                  <SelectField
                    label={m["tools.cssGradientGenerator.sizeLabel"]()}
                    value={active.radialSize}
                    options={SIZES.map((value) => ({
                      value,
                      label: sizeLabels[value](),
                    }))}
                    onChange={(value) =>
                      patchActive({
                        radialSize: value as GradientLayer["radialSize"],
                      })
                    }
                  />
                </div>
              ) : null}
              <div className="grid gap-5 sm:grid-cols-2">
                <SelectField
                  label={m["tools.cssGradientGenerator.colorSpaceLabel"]()}
                  value={active.colorSpace}
                  options={(["srgb", "oklch"] as const).map((value) => ({
                    value,
                    label: colorSpaceLabels[value](),
                  }))}
                  onChange={(value) =>
                    patchActive({
                      colorSpace: value as GradientLayer["colorSpace"],
                    })
                  }
                />
                <SelectField
                  label={m["common.cssgenBlend"]()}
                  value={active.blendMode}
                  options={BLENDS.map((value) => ({
                    value,
                    label: blendLabels[value](),
                  }))}
                  onChange={(value) =>
                    patchActive({
                      blendMode: value as GradientLayer["blendMode"],
                    })
                  }
                />
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="flex flex-wrap items-start justify-between gap-4 border-b border-separator">
              <div>
                <Card.Title>
                  {m["tools.cssGradientGenerator.stopsTitle"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.cssGradientGenerator.trackHint"]()}
                </Card.Description>
              </div>
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                isDisabled={active.stops.length >= 32}
                onPress={() => addStop()}
              >
                <Plus aria-hidden data-slot="icon" />
                {m["tools.cssGradientGenerator.addStop"]()}
              </Button>
            </Card.Header>
            <ToolPanelCardContent className="grid gap-4 py-4">
              {stopError ? (
                <Alert status="danger" role="alert">
                  <Alert.Content>
                    <Alert.Description>
                      {m["tools.cssGradientGenerator.minStopsHint"]()}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              <div
                ref={track}
                className="relative h-16 rounded-xl border border-border shadow-inner"
                onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                  if (event.target !== event.currentTarget) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  if (rect.width)
                    addStop(((event.clientX - rect.left) / rect.width) * 100);
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-xl"
                  style={{
                    backgroundImage: buildGradient({
                      layers: [active],
                      format: "hex",
                    }).backgroundImage,
                  }}
                />
                {active.stops.map((stop, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant="ghost"
                    isIconOnly
                    aria-label={`${m["tools.cssGradientGenerator.stopPosition"]()} ${Math.round(stop.position)}`}
                    className={`absolute top-1/2 z-10 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm ${index === state.activeStop ? "ring-2 ring-accent" : ""}`}
                    style={{
                      backgroundColor: stop.color,
                      left: `calc(${stop.position}% + ${0.625 - stop.position * 0.0125}rem)`,
                    }}
                    onClick={() =>
                      mutate((current) => ({ ...current, activeStop: index }))
                    }
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      mutate((current) => ({ ...current, activeStop: index }));
                      setDraggingStop(index);
                    }}
                  />
                ))}
              </div>
              <div className="grid gap-3">
                {active.stops.map((stop, index) => (
                  <StopRow
                    key={index}
                    stop={stop}
                    active={index === state.activeStop}
                    onSelect={() =>
                      mutate((current) => ({ ...current, activeStop: index }))
                    }
                    onColor={(color) => updateStop(index, { color })}
                    onPosition={(position) => updateStop(index, { position })}
                    onRemove={() => {
                      if (active.stops.length <= 2) {
                        setStopError(true);
                        return;
                      }
                      const stops = active.stops.filter(
                        (_, stopIndex) => stopIndex !== index,
                      );
                      mutate((current) => ({
                        ...current,
                        activeStop: 0,
                        preset: null,
                        layers: current.layers.map((item, layerIndex) =>
                          layerIndex === current.active
                            ? { ...item, stops }
                            : item,
                        ),
                      }));
                    }}
                  />
                ))}
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["tools.cssGradientGenerator.outputTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.cssGradientGenerator.outputSubtitle"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>{m["tools.cssGradientGenerator.outputFormat"]()}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["hex", "rgba"] as const).map((format) => (
                    <Button
                      key={format}
                      type="button"
                      className="min-h-11"
                      variant={state.format === format ? "primary" : "outline"}
                      onPress={() =>
                        mutate((current) => ({ ...current, format }))
                      }
                    >
                      {formatLabels[format]()}
                    </Button>
                  ))}
                </div>
              </div>
              <TextArea
                aria-label={m["tools.cssGradientGenerator.outputTitle"]()}
                readOnly
                value={cssOutput}
                className="min-h-44 border border-border font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <ToolCopyButton
                  value={cssOutput}
                  copyLabel={m["common.cssgenCopyCss"]()}
                  copiedLabel={m["common.actions.copied"]()}
                />
                <ToolCopyButton
                  value={backgroundImageDeclaration}
                  copyLabel={m["common.cssgenCopyBackgroundImage"]()}
                  copiedLabel={m["common.actions.copied"]()}
                />
                <ToolCopyButton
                  value={backgroundDeclaration}
                  copyLabel={m["common.cssgenCopyBackground"]()}
                  copiedLabel={m["common.actions.copied"]()}
                />
                {blendDeclaration ? (
                  <ToolCopyButton
                    value={blendDeclaration}
                    copyLabel={m["common.cssgenCopyBlendMode"]()}
                    copiedLabel={m["common.actions.copied"]()}
                  />
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onPress={() =>
                    saveText(`${cssOutput}\n`, "text/css", "css-gradient.css")
                  }
                >
                  <Download aria-hidden data-slot="icon" />
                  {m["common.cssgenDownloadCss"]()}
                </Button>
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>

          <details className="rounded-xl border border-border bg-card">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
              <span>
                <strong className="block">
                  {m["tools.cssGradientGenerator.jsonTitle"]()}
                </strong>
                <span className="text-sm text-muted-foreground">
                  {m["tools.cssGradientGenerator.jsonSubtitle"]()}
                </span>
              </span>
              <FileJson2 aria-hidden className="size-4" />
            </summary>
            <div className="grid gap-4 border-t border-separator p-4">
              <TextArea
                aria-label={m["tools.cssGradientGenerator.jsonTitle"]()}
                readOnly
                value={serializedConfig}
                className="min-h-28 border border-border font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <ToolCopyButton
                  value={serializedConfig}
                  copyLabel={m["shared.aesTools.encryptcopyjsonlabel"]()}
                  copiedLabel={m["common.actions.copied"]()}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onPress={() =>
                    saveText(
                      `${serializedConfig}\n`,
                      "application/json",
                      "css-gradient.json",
                    )
                  }
                >
                  <Download aria-hidden data-slot="icon" />
                  {m["common.httptDownload"]()}
                </Button>
              </div>
              <TextArea
                aria-label={m["tools.cssGradientGenerator.jsonPlaceholder"]()}
                value={json}
                placeholder={m["tools.cssGradientGenerator.jsonPlaceholder"]()}
                className="min-h-28 border border-border font-mono"
                onChange={(event) => {
                  setJson(event.currentTarget.value);
                  setJsonError(false);
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-fit"
                onPress={() => {
                  try {
                    const layers = importEditorLayers(json);
                    mutate((current) => ({
                      ...current,
                      layers,
                      active: 0,
                      activeStop: 0,
                      preset: null,
                    }));
                    setJson("");
                    setJsonError(false);
                  } catch {
                    setJsonError(true);
                  }
                }}
              >
                <FileJson2 aria-hidden data-slot="icon" />
                {m["common.cssgenLoadJson"]()}
              </Button>
              {jsonError ? (
                <Alert status="danger" role="alert">
                  <Alert.Content>
                    <Alert.Description>
                      {m["tools.cssGradientGenerator.invalidJson"]()}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
            </div>
          </details>
        </div>

        <aside className="contents xl:sticky xl:top-6 xl:grid xl:content-start xl:gap-6">
          <div className="order-1 xl:order-0">
            <ToolPanelCard>
              <Card.Header className="border-b border-separator">
                <Card.Title>{m["common.archivepreview"]()}</Card.Title>
                <Card.Description>
                  {m["tools.cssGradientGenerator.previewHint"]()}
                </Card.Description>
              </Card.Header>
              <ToolPanelCardContent className="grid gap-3 px-0 py-4">
                {preview}
                <div className="flex flex-wrap gap-2 px-4">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onPress={() => patchActive(randomizeEditorLayer(active))}
                  >
                    <Sparkles aria-hidden data-slot="icon" />
                    {m["tools.cssGradientGenerator.randomizeLayer"]()}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onPress={() =>
                      mutate((current) => ({
                        ...current,
                        layers: current.layers.map(randomizeEditorLayer),
                        preset: null,
                      }))
                    }
                  >
                    <RefreshCcw aria-hidden data-slot="icon" />
                    {m["common.cssgenRandomAll"]()}
                  </Button>
                </div>
              </ToolPanelCardContent>
            </ToolPanelCard>
          </div>
          <div className="order-3 xl:order-0">
            <ToolPanelCard>
              <Card.Header className="border-b border-separator">
                <Card.Title>
                  {m["tools.codeScreenshotGenerator.exportTitle"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.cssGradientGenerator.exportSubtitle"]()}
                </Card.Description>
              </Card.Header>
              <ToolPanelCardContent className="grid gap-5 py-4">
                {exportError ? (
                  <Alert status="danger" role="alert">
                    <Alert.Content>
                      <Alert.Description>
                        {m["tools.cssGradientGenerator.pngUnsupported"]()}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField>
                    <Label>{m["common.width"]()}</Label>
                    <Input
                      type="number"
                      min={64}
                      max={4096}
                      value={state.width}
                      className="min-h-11 border border-border"
                      onChange={(event) =>
                        mutate((current) => ({
                          ...current,
                          width: Math.min(
                            4096,
                            Math.max(64, Number(event.currentTarget.value)),
                          ),
                        }))
                      }
                    />
                  </TextField>
                  <TextField>
                    <Label>{m["tools.svgToImage.height"]()}</Label>
                    <Input
                      type="number"
                      min={64}
                      max={4096}
                      value={state.height}
                      className="min-h-11 border border-border"
                      onChange={(event) =>
                        mutate((current) => ({
                          ...current,
                          height: Math.min(
                            4096,
                            Math.max(64, Number(event.currentTarget.value)),
                          ),
                        }))
                      }
                    />
                  </TextField>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        format: "png",
                        label: m["tools.cssGradientGenerator.downloadPng"](),
                      },
                      {
                        format: "jpeg",
                        label: m["tools.cssGradientGenerator.downloadJpg"](),
                      },
                      {
                        format: "webp",
                        label: m["tools.cssGradientGenerator.downloadWebp"](),
                      },
                    ] as const
                  ).map((action) => (
                    <Button
                      key={action.format}
                      type="button"
                      variant="outline"
                      className="min-h-11 justify-start"
                      isDisabled={download.busy}
                      onPress={() => {
                        setExportError(false);
                        void download
                          .save(
                            (signal) =>
                              renderGradient(
                                { layers: state.layers, format: state.format },
                                state.width,
                                state.height,
                                action.format,
                                signal,
                              ),
                            `css-gradient.${action.format === "jpeg" ? "jpg" : action.format}`,
                          )
                          .catch(() => setExportError(true));
                      }}
                    >
                      <Download aria-hidden data-slot="icon" />
                      {action.label}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 justify-start"
                    onPress={() =>
                      void download.save(
                        new Blob(
                          [
                            gradientSvg(
                              { layers: state.layers, format: state.format },
                              state.width,
                              state.height,
                            ),
                          ],
                          { type: "image/svg+xml" },
                        ),
                        "css-gradient.svg",
                      )
                    }
                  >
                    <Download aria-hidden data-slot="icon" />
                    {m["tools.cssGradientGenerator.downloadSvg"]()}
                  </Button>
                </div>
              </ToolPanelCardContent>
            </ToolPanelCard>
          </div>
        </aside>
      </div>
      <PageArticle />
    </div>
  );
}

export default function GradientGenerator() {
  return (
    <ToolPage instructions={m["tools.cssGradientGenerator.usage"]()}>
      <GradientGeneratorContent />
    </ToolPage>
  );
}
