import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Accordion,
  Alert,
  Button,
  Card,
  Input,
  Label,
  Link,
  ListBox,
  Select,
  Skeleton,
  Slider,
  Switch,
  TextArea,
  TextField,
} from "@heroui/react";
import { strToU8, zipSync } from "fflate";
import {
  Download,
  ImagePlus,
  RotateCcw,
  RefreshCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { CodeBlock } from "@/components/base/code-block";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolColorPicker } from "@/components/base/tool-color-picker";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { buttonVariants } from "@heroui/styles";
import { m } from "@/paraglide/messages.js";
import { runOptimizerWorker } from "@/features/tools/image-optimizers/worker-client";
import { formatFileSize } from "@/lib/file-size";
import { getLocale } from "@/paraglide/runtime.js";
import { browserXml } from "../image-formats/svg";
import { validateSvg } from "@workspace/tools/image/svg";
import {
  clampPercent,
  type DisplayMode,
  defaultPlatformIconConfig,
  defaultPwaIconConfig,
  encodePngIco,
  type FaviconSite,
  faviconHead,
  faviconManifest,
  type PlatformIconConfig,
  type PwaIconConfig,
  squareLayout,
} from "@workspace/tools/image/favicon";

type SourceKey = "global" | "desktop" | "ios" | "pwa";
type ImageSource = {
  file: File;
  image: HTMLImageElement;
  url: string;
  svgText: string | null;
};
type GeneratedAsset = {
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
  url: string;
};
type GeneratedBundle = {
  assets: GeneratedAsset[];
  zipUrl: string;
  manifest: string;
  head: string;
};
type ErrorState = { title: string; description: string };

const COLOR_PRESETS = [
  "#000000",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
] as const;
const DISPLAY_MODES: DisplayMode[] = [
  "fullscreen",
  "standalone",
  "minimal-ui",
  "browser",
];
const DEMO_ICON_URL = "/icon.svg";
const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/*",
] as const;

function revokeBundle(value: GeneratedBundle | null) {
  if (!value) return;
  URL.revokeObjectURL(value.zipUrl);
  for (const asset of value.assets) URL.revokeObjectURL(asset.url);
}

function BooleanSwitch({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Switch
      className="bg-field-background min-h-20 w-full items-center gap-4 rounded-xl border border-border px-4 py-3"
      isSelected={value}
      onChange={(selected) => onChange(selected === true)}
    >
      <Switch.Content className="flex w-full min-w-0 items-center gap-4">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {label}
          </span>
          {description ? (
            <span className="mt-1 block text-xs leading-5 text-muted">
              {description}
            </span>
          ) : null}
        </span>
        <Switch.Control className="shrink-0 self-center">
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

function PercentSlider({
  label,
  description,
  value,
  max = 100,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="bg-field-background grid gap-3 rounded-xl border border-border px-4 py-3">
      <div className="grid gap-1">
        <span className="text-sm font-medium text-foreground">
          {label}: {value}%
        </span>
        {description ? (
          <span className="text-xs leading-5 text-muted">{description}</span>
        ) : null}
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

function FieldDescription({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-5 text-muted">{children}</p>;
}

function SourceInput({
  label,
  description,
  clearLabel,
  source,
  onChange,
  onRemove,
}: {
  label: string;
  description?: string;
  clearLabel: string;
  source: ImageSource | null;
  onChange: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <ToolFilePicker
      label={label}
      description={description}
      accept={[...IMAGE_TYPES]}
      fileName={source?.file.name}
      clearLabel={clearLabel}
      onSelect={onChange}
      onClear={onRemove}
    />
  );
}

function IconPreview({
  source,
  background,
  radius = 0,
  margin = 0,
  className = "rounded-2xl",
}: {
  source: ImageSource | null;
  background?: string;
  radius?: number;
  margin?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex aspect-square items-center justify-center overflow-hidden border border-border bg-default ${className}`}
      style={{
        backgroundColor: background,
        borderRadius: radius ? `${radius / 2}%` : undefined,
        padding: `${clampPercent(margin) / 2}%`,
      }}
    >
      {source ? (
        <img className="size-full object-contain" src={source.url} alt="" />
      ) : (
        <ImagePlus aria-hidden className="size-7 text-muted" />
      )}
    </div>
  );
}

function PreviewGallery({
  kind,
  source,
  background,
  radius,
  margin,
  appName,
  hasBundle,
  includeMaskable = false,
  maskableBackground,
  maskableMargin = 40,
}: {
  kind: "desktop" | "ios" | "pwa";
  source: ImageSource | null;
  background?: string;
  radius?: number;
  margin: number;
  appName: string;
  hasBundle: boolean;
  includeMaskable?: boolean;
  maskableBackground?: string;
  maskableMargin?: number;
}) {
  const labels =
    kind === "desktop"
      ? [
          m["tools.faviconAssetsGenerator.previewDesktopBrowserLabel"](),
          m["tools.faviconAssetsGenerator.previewGoogleSearchLabel"](),
        ]
      : kind === "ios"
        ? [m["tools.faviconAssetsGenerator.previewIosHomeScreenLabel"]()]
        : [
            m["tools.faviconAssetsGenerator.previewWindowsTaskbarLabel"](),
            ...(includeMaskable
              ? [
                  m[
                    "tools.faviconAssetsGenerator.previewAndroidLauncherLabel"
                  ](),
                ]
              : []),
          ];
  return (
    <section
      className="grid content-start gap-3"
      aria-label={m["common.faviconpreview"]()}
    >
      <div className="grid gap-1">
        <h3 className="font-medium text-foreground">
          {m["common.faviconpreview"]()}
        </h3>
        <p className="text-xs leading-5 text-muted">
          {m["tools.faviconAssetsGenerator.previewGalleryDescription"]()}
        </p>
        {!hasBundle ? (
          <p className="text-xs leading-5 text-muted">
            {m["tools.faviconAssetsGenerator.previewBeforeGenerateHint"]()}
          </p>
        ) : null}
      </div>
      <div
        className={`grid gap-3 ${labels.length > 1 ? "sm:grid-cols-2" : ""}`}
      >
        {labels.map((label, index) => {
          const maskable =
            kind === "pwa" &&
            label ===
              m["tools.faviconAssetsGenerator.previewAndroidLauncherLabel"]();
          return (
            <figure
              key={label}
              className="grid gap-2 rounded-xl border border-border bg-default/30 p-3"
            >
              <div
                className={`grid min-h-40 place-items-center overflow-hidden rounded-lg ${
                  kind === "ios"
                    ? "bg-linear-to-br from-sky-500 via-violet-500 to-rose-400"
                    : kind === "pwa" && index === 1
                      ? "bg-linear-to-br from-teal-500 to-emerald-700"
                      : "bg-default"
                }`}
              >
                <div
                  className={
                    kind === "desktop"
                      ? "grid w-[88%] grid-cols-[2.75rem_1fr] items-center gap-3 rounded-xl border border-border bg-background/90 p-3 shadow-sm"
                      : "grid w-28 gap-2 text-center"
                  }
                >
                  <IconPreview
                    source={source}
                    background={maskable ? maskableBackground : background}
                    radius={maskable ? 80 : radius}
                    margin={maskable ? maskableMargin : margin}
                    className={
                      maskable
                        ? "rounded-full"
                        : kind === "ios"
                          ? "rounded-[22%]"
                          : "rounded-lg"
                    }
                  />
                  <span className="truncate text-xs font-medium text-foreground">
                    {appName}
                  </span>
                </div>
              </div>
              <figcaption className="text-xs text-muted">{label}</figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas"))),
      "image/png",
    ),
  );
}

async function renderPng(
  source: ImageSource,
  size: number,
  options: { margin: number; background?: string; radius?: number },
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    if (options.background) {
      const radius = (clampPercent(options.radius ?? 0) / 200) * size;
      context.beginPath();
      context.roundRect(0, 0, size, size, radius);
      context.fillStyle = options.background;
      context.fill();
      context.clip();
    }
    const layout = squareLayout(
      source.image.naturalWidth,
      source.image.naturalHeight,
      size,
      options.margin,
    );
    context.drawImage(
      source.image,
      layout.x,
      layout.y,
      layout.width,
      layout.height,
    );
    return new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer());
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function loadImageSource(file: File) {
  const isSvg =
    file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  if (
    !file.size ||
    file.size > 2 * 1024 * 1024 ||
    (!file.type.startsWith("image/") && !isSvg)
  ) {
    throw new Error("invalid");
  }
  let svgText: string | null = null;
  let preview: Blob = file;
  if (isSvg) {
    svgText = validateSvg(await file.text(), browserXml).source;
    preview = new Blob([svgText], { type: "image/svg+xml" });
  }
  const url = URL.createObjectURL(preview);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { file, image, url, svgText } satisfies ImageSource;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function ResultSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid gap-4 rounded-xl border border-border bg-default/20 p-4"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["one", "two", "three", "four"].map((key) => (
          <Skeleton key={key} className="h-32 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

function FaviconAssetsGeneratorContent() {
  const locale = getLocale();
  const [sources, setSources] = useState<Record<SourceKey, ImageSource | null>>(
    {
      global: null,
      desktop: null,
      ios: null,
      pwa: null,
    },
  );
  const [site, setSite] = useState<FaviconSite>({
    name: "App",
    shortName: "App",
    description: "",
    startUrl: "/",
    assetPath: "/",
    display: "standalone",
    themeColor: "#ffffff",
    enableDarkThemeColor: true,
    darkThemeColor: "#000000",
    backgroundColor: "#ffffff",
    includeMaskable: true,
  });
  const [desktop, setDesktop] = useState<PlatformIconConfig>({
    ...defaultPlatformIconConfig,
  });
  const [ios, setIos] = useState<PlatformIconConfig>({
    ...defaultPlatformIconConfig,
    addBackground: true,
  });
  const [pwa, setPwa] = useState<PwaIconConfig>({ ...defaultPwaIconConfig });
  const [useOriginalSvg, setUseOriginalSvg] = useState(true);
  const [optimizePng, setOptimizePng] = useState(true);
  const [bundle, setBundle] = useState<GeneratedBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const revisions = useRef<Record<SourceKey, number>>({
    global: 0,
    desktop: 0,
    ios: 0,
    pwa: 0,
  });
  const generation = useRef(0);
  const generationController = useRef<AbortController | null>(null);
  const sourcesRef = useRef(sources);
  const bundleRef = useRef(bundle);
  sourcesRef.current = sources;
  bundleRef.current = bundle;

  const releaseBundle = (value = bundleRef.current) => {
    if (!value) return;
    revokeBundle(value);
    if (value === bundleRef.current) {
      bundleRef.current = null;
      setBundle(null);
    }
  };
  const invalidate = () => {
    generation.current += 1;
    generationController.current?.abort();
    generationController.current = null;
    releaseBundle();
    setBusy(false);
  };
  useEffect(
    () => () => {
      generation.current += 1;
      generationController.current?.abort();
      for (const key of Object.keys(revisions.current) as SourceKey[]) {
        revisions.current[key] += 1;
      }
      for (const source of Object.values(sourcesRef.current)) {
        if (source) URL.revokeObjectURL(source.url);
      }
      revokeBundle(bundleRef.current);
    },
    [],
  );

  const replaceSource = (key: SourceKey, next: ImageSource | null) => {
    setSources((previous) => {
      if (previous[key]) URL.revokeObjectURL(previous[key].url);
      return { ...previous, [key]: next };
    });
    invalidate();
  };
  const choose = async (key: SourceKey, file: File) => {
    const revision = ++revisions.current[key];
    setError(null);
    try {
      const next = await loadImageSource(file);
      if (revision !== revisions.current[key]) {
        URL.revokeObjectURL(next.url);
        return;
      }
      replaceSource(key, next);
    } catch {
      if (revision === revisions.current[key]) {
        setError({
          title: m["tools.faviconAssetsGenerator.invalidImageTitle"](),
          description:
            m["tools.faviconAssetsGenerator.invalidImageDescription"](),
        });
      }
    }
  };
  const handleUseDemo = async () => {
    const revision = ++revisions.current.global;
    setError(null);
    try {
      const response = await fetch(DEMO_ICON_URL);
      if (!response.ok) throw new Error("demo");
      const source = await loadImageSource(
        new File([await response.blob()], "inbrowser-demo-icon.svg", {
          type: "image/svg+xml",
        }),
      );
      if (revision !== revisions.current.global) {
        URL.revokeObjectURL(source.url);
        return;
      }
      replaceSource("global", source);
    } catch {
      if (revision === revisions.current.global) {
        setError({
          title: m["tools.faviconAssetsGenerator.invalidImageTitle"](),
          description:
            m["tools.faviconAssetsGenerator.invalidImageDescription"](),
        });
      }
    }
  };
  const remove = (key: SourceKey) => {
    revisions.current[key] += 1;
    replaceSource(key, null);
  };
  const updateSite = <Key extends keyof FaviconSite>(
    key: Key,
    value: FaviconSite[Key],
  ) => {
    setSite((previous) => ({ ...previous, [key]: value }));
    invalidate();
  };
  const updatePlatform = (
    setter: Dispatch<SetStateAction<PlatformIconConfig>>,
    patch: Partial<PlatformIconConfig>,
  ) => {
    setter((previous) => ({ ...previous, ...patch }));
    invalidate();
  };
  const updatePwa = (patch: Partial<PwaIconConfig>) => {
    setPwa((previous) => ({ ...previous, ...patch }));
    invalidate();
  };
  const effective = (key: Exclude<SourceKey, "global">) => {
    const config = key === "desktop" ? desktop : key === "ios" ? ios : pwa;
    return config.useDifferentImage ? sources[key] : sources.global;
  };
  const displayLabels: Record<DisplayMode, string> = {
    fullscreen: m["tools.faviconAssetsGenerator.displayfullscreen"](),
    standalone: m["tools.faviconAssetsGenerator.displaystandalone"](),
    "minimal-ui": m["tools.faviconAssetsGenerator.displayMinimalUi"](),
    browser: m["tools.faviconAssetsGenerator.displaybrowser"](),
  };
  const addAsset = (
    assets: GeneratedAsset[],
    files: Record<string, Uint8Array>,
    filename: string,
    bytes: Uint8Array,
    mimeType: string,
  ) => {
    files[filename] = bytes;
    assets.push({
      filename,
      bytes,
      mimeType,
      url: URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: mimeType }),
      ),
    });
  };
  const optimize = async (bytes: Uint8Array, signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!optimizePng) return bytes;
    const result = await runOptimizerWorker(
      {
        kind: "png",
        bytes: new Uint8Array(bytes),
        options: { level: 2, interlace: false, optimiseAlpha: true },
      },
      signal,
    );
    return result.bytes;
  };
  const generate = async () => {
    const global = sources.global;
    if (!global) {
      setError({
        title: m["tools.faviconAssetsGenerator.needImageTitle"](),
        description: m["tools.faviconAssetsGenerator.needImageDescription"](),
      });
      return;
    }
    if (!site.name.trim()) {
      setError({
        title: m["tools.faviconAssetsGenerator.needAppNameTitle"](),
        description: m["tools.faviconAssetsGenerator.needAppNameDescription"](),
      });
      return;
    }
    if (
      (desktop.useDifferentImage && !sources.desktop) ||
      (ios.useDifferentImage && !sources.ios) ||
      (pwa.useDifferentImage && !sources.pwa)
    ) {
      setError({
        title: m["tools.faviconAssetsGenerator.missingDedicatedImageTitle"](),
        description:
          m["tools.faviconAssetsGenerator.missingDedicatedImageDescription"](),
      });
      return;
    }
    generationController.current?.abort();
    const controller = new AbortController();
    generationController.current = controller;
    const current = ++generation.current;
    const pendingAssets: GeneratedAsset[] = [];
    let committed = false;
    setBusy(true);
    setError(null);
    try {
      const desktopSource = effective("desktop") ?? global;
      const iosSource = effective("ios") ?? global;
      const pwaSource = effective("pwa") ?? global;
      const files: Record<string, Uint8Array> = {};
      const desktopOptions = {
        margin: desktop.margin,
        background: desktop.addBackground ? desktop.backgroundColor : undefined,
        radius: desktop.backgroundRadius,
      };
      const desktopPng = new Map<number, Uint8Array>();
      for (const size of [16, 32, 48]) {
        desktopPng.set(
          size,
          await optimize(
            await renderPng(desktopSource, size, desktopOptions),
            controller.signal,
          ),
        );
      }
      addAsset(
        pendingAssets,
        files,
        "favicon-16x16.png",
        desktopPng.get(16) as Uint8Array,
        "image/png",
      );
      addAsset(
        pendingAssets,
        files,
        "favicon-32x32.png",
        desktopPng.get(32) as Uint8Array,
        "image/png",
      );
      addAsset(
        pendingAssets,
        files,
        "favicon.ico",
        encodePngIco(
          [16, 32, 48].map((size) => ({
            size,
            bytes: desktopPng.get(size) as Uint8Array,
          })),
        ),
        "image/x-icon",
      );
      const includeSvg = Boolean(useOriginalSvg && desktopSource.svgText);
      if (includeSvg) {
        addAsset(
          pendingAssets,
          files,
          "favicon.svg",
          new TextEncoder().encode(desktopSource.svgText as string),
          "image/svg+xml",
        );
      }
      addAsset(
        pendingAssets,
        files,
        "apple-touch-icon.png",
        await optimize(
          await renderPng(iosSource, 180, {
            margin: ios.margin,
            background: ios.backgroundColor,
          }),
          controller.signal,
        ),
        "image/png",
      );
      for (const size of [192, 512]) {
        addAsset(
          pendingAssets,
          files,
          `pwa-${size}x${size}.png`,
          await optimize(
            await renderPng(pwaSource, size, {
              margin: pwa.margin,
              background: pwa.addBackground ? pwa.backgroundColor : undefined,
              radius: pwa.backgroundRadius,
            }),
            controller.signal,
          ),
          "image/png",
        );
        if (site.includeMaskable) {
          addAsset(
            pendingAssets,
            files,
            `pwa-maskable-${size}x${size}.png`,
            await optimize(
              await renderPng(pwaSource, size, {
                margin: pwa.maskableMargin,
                background: pwa.maskableBackgroundColor,
              }),
              controller.signal,
            ),
            "image/png",
          );
        }
      }
      const manifest = `${JSON.stringify(faviconManifest(site), null, 2)}\n`;
      const head = `${faviconHead(site, includeSvg)}\n`;
      addAsset(
        pendingAssets,
        files,
        "site.webmanifest",
        strToU8(manifest),
        "application/manifest+json",
      );
      addAsset(pendingAssets, files, "head.html", strToU8(head), "text/html");
      const zip = new Blob([zipSync(files, { level: 6 }) as BlobPart], {
        type: "application/zip",
      });
      if (controller.signal.aborted || current !== generation.current) return;
      releaseBundle();
      setBundle({
        assets: pendingAssets,
        zipUrl: URL.createObjectURL(zip),
        manifest,
        head,
      });
      committed = true;
    } catch (caught) {
      if (
        !controller.signal.aborted &&
        current === generation.current &&
        !(caught instanceof DOMException && caught.name === "AbortError")
      ) {
        setError({
          title: m["tools.faviconAssetsGenerator.generationFailedTitle"](),
          description:
            m["tools.faviconAssetsGenerator.generationFailedDescription"](),
        });
      }
    } finally {
      if (!committed) {
        for (const asset of pendingAssets) URL.revokeObjectURL(asset.url);
      }
      if (current === generation.current) {
        generationController.current = null;
        setBusy(false);
      }
    }
  };
  const reset = () => {
    setSite({
      name: "App",
      shortName: "App",
      description: "",
      startUrl: "/",
      assetPath: "/",
      display: "standalone",
      themeColor: "#ffffff",
      enableDarkThemeColor: true,
      darkThemeColor: "#000000",
      backgroundColor: "#ffffff",
      includeMaskable: true,
    });
    setDesktop({ ...defaultPlatformIconConfig });
    setIos({ ...defaultPlatformIconConfig, addBackground: true });
    setPwa({ ...defaultPwaIconConfig });
    setUseOriginalSvg(true);
    setOptimizePng(true);
    for (const key of Object.keys(revisions.current) as SourceKey[]) {
      revisions.current[key] += 1;
    }
    for (const source of Object.values(sourcesRef.current)) {
      if (source) URL.revokeObjectURL(source.url);
    }
    setSources({ global: null, desktop: null, ios: null, pwa: null });
    invalidate();
    setError(null);
  };

  const platformControls = (
    key: "desktop" | "ios" | "pwa",
    config: PlatformIconConfig,
    patch: (next: Partial<PlatformIconConfig>) => void,
  ) => (
    <div className="grid content-start gap-4">
      {key !== "ios" ? (
        <BooleanSwitch
          label={m["tools.faviconAssetsGenerator.addbackground"]()}
          value={config.addBackground}
          onChange={(addBackground) => patch({ addBackground })}
        />
      ) : null}
      {config.addBackground || key === "ios" ? (
        <div className="grid gap-2">
          <ToolColorPicker
            label={
              key === "ios"
                ? m["common.faviconbackgroundcolor"]()
                : m["common.faviconbackgroundcolor"]()
            }
            value={config.backgroundColor}
            presets={COLOR_PRESETS}
            onChange={(backgroundColor) => patch({ backgroundColor })}
          />
          {key === "ios" ? (
            <FieldDescription>
              {m[
                "tools.faviconAssetsGenerator.iosBackgroundColorDescription"
              ]()}
            </FieldDescription>
          ) : null}
        </div>
      ) : null}
      {config.addBackground && key !== "ios" ? (
        <PercentSlider
          label={m["tools.faviconAssetsGenerator.backgroundRadiusLabel"]()}
          description={m[
            "tools.faviconAssetsGenerator.backgroundRadiusDescription"
          ]()}
          value={config.backgroundRadius}
          onChange={(backgroundRadius) => patch({ backgroundRadius })}
        />
      ) : null}
      <PercentSlider
        label={m["shared.barcodeTools.generatorMargin"]()}
        description={m["tools.faviconAssetsGenerator.marginDescription"]()}
        value={config.margin}
        max={50}
        onChange={(margin) => patch({ margin })}
      />
      <BooleanSwitch
        label={m["tools.faviconAssetsGenerator.useDifferentImageLabel"]()}
        description={m[
          "tools.faviconAssetsGenerator.useDifferentImageDescription"
        ]()}
        value={config.useDifferentImage}
        onChange={(useDifferentImage) => patch({ useDifferentImage })}
      />
      {config.useDifferentImage ? (
        <SourceInput
          label={m["tools.faviconAssetsGenerator.uploadDedicatedImageLabel"]()}
          clearLabel={m["common.formatremove"]()}
          source={sources[key]}
          onChange={(file) => void choose(key, file)}
          onRemove={() => remove(key)}
        />
      ) : null}
    </div>
  );

  return (
    <div className="space-y-8">
      <ToolPanelCard>
        <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid gap-1">
            <Card.Title>
              {m["tools.faviconAssetsGenerator.uploadCardTitle"]()}
            </Card.Title>{" "}
            <Card.Description>
              {m["tools.faviconAssetsGenerator.uploadCardDescription"]()}
            </Card.Description>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onPress={() => void handleUseDemo()}
          >
            <Sparkles aria-hidden className="size-4" />
            {m["tools.faviconAssetsGenerator.useDemoLabel"]()}
          </Button>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          {sources.global ? (
            <div className="grid gap-4 rounded-xl border border-border bg-default/20 p-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
              <div className="rounded-xl bg-default p-3">
                <img
                  src={sources.global.url}
                  alt={m["tools.faviconAssetsGenerator.filePreviewAlt"]()}
                  className="mx-auto aspect-square max-h-44 w-full object-contain"
                />
              </div>
              <dl className="grid gap-2 text-sm">
                <div className="grid gap-1">
                  <dt className="text-xs text-muted">
                    {sources.global.file.name}
                  </dt>
                  <dd className="font-mono text-xs text-foreground">
                    {sources.global.image.naturalWidth} ×{" "}
                    {sources.global.image.naturalHeight} ·{" "}
                    {formatFileSize(sources.global.file.size, locale)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
          <SourceInput
            label={
              sources.global
                ? m["common.change"]()
                : m["tools.faviconAssetsGenerator.chooseImageLabel"]()
            }
            description={m["tools.faviconAssetsGenerator.uploadHint"]()}
            clearLabel={m["common.formatremove"]()}
            source={sources.global}
            onChange={(file) => void choose("global", file)}
            onRemove={() => remove("global")}
          />
        </ToolPanelCardContent>
      </ToolPanelCard>

      <Accordion
        className="overflow-hidden rounded-2xl border border-border bg-surface"
        allowsMultipleExpanded
        defaultExpandedKeys={["site", "desktop", "ios", "pwa"]}
      >
        <Accordion.Item id="site">
          <Accordion.Heading>
            <Accordion.Trigger>
              <span className="grid min-w-0 flex-1 gap-1 text-start">
                <span className="font-medium text-foreground">
                  {m["tools.faviconAssetsGenerator.siteInfoCardTitle"]()}
                </span>
                <span className="text-xs leading-5 font-normal text-muted">
                  {m["tools.faviconAssetsGenerator.siteInfoCardDescription"]()}
                </span>
              </span>
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="grid gap-5 border-t border-separator py-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField>
                  <Label>{m["tools.faviconAssetsGenerator.appname"]()}</Label>
                  <Input
                    className="bg-field-background min-h-11 rounded-xl border border-border"
                    value={site.name}
                    onChange={(event) => updateSite("name", event.target.value)}
                  />
                </TextField>
                <TextField>
                  <Label>{m["tools.faviconAssetsGenerator.shortname"]()}</Label>
                  <Input
                    className="bg-field-background min-h-11 rounded-xl border border-border"
                    value={site.shortName}
                    onChange={(event) =>
                      updateSite("shortName", event.target.value)
                    }
                  />
                  <FieldDescription>
                    {m["tools.faviconAssetsGenerator.shortNameDescription"]()}
                  </FieldDescription>
                </TextField>
              </div>
              <TextField>
                <Label>{m["common.favicondescriptionlabel"]()}</Label>
                <TextArea
                  className="bg-field-background min-h-24 rounded-xl border border-border"
                  value={site.description}
                  onChange={(event) =>
                    updateSite("description", event.target.value)
                  }
                />
                <FieldDescription>
                  {m["tools.faviconAssetsGenerator.descriptionDescription"]()}
                </FieldDescription>
              </TextField>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField>
                  <Label>
                    {m["tools.faviconAssetsGenerator.startUrlLabel"]()}
                  </Label>
                  <Input
                    className="bg-field-background min-h-11 rounded-xl border border-border"
                    value={site.startUrl}
                    onChange={(event) =>
                      updateSite("startUrl", event.target.value)
                    }
                  />
                  <FieldDescription>
                    {m["tools.faviconAssetsGenerator.startUrlDescription"]()}
                  </FieldDescription>
                </TextField>
                <TextField>
                  <Label>{m["tools.faviconAssetsGenerator.assetpath"]()}</Label>
                  <Input
                    className="bg-field-background min-h-11 rounded-xl border border-border"
                    value={site.assetPath}
                    onChange={(event) =>
                      updateSite("assetPath", event.target.value)
                    }
                  />
                  <FieldDescription>
                    {m["tools.faviconAssetsGenerator.assetPathDescription"]()}
                  </FieldDescription>
                </TextField>
              </div>
              <Select
                variant="secondary"
                aria-label={m["tools.faviconAssetsGenerator.displaymode"]()}
                selectedKey={site.display}
                onSelectionChange={(key) =>
                  key && updateSite("display", key as DisplayMode)
                }
              >
                <Label>{m["tools.faviconAssetsGenerator.displaymode"]()}</Label>
                <Select.Trigger className="bg-field-background min-h-11 border border-border">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {DISPLAY_MODES.map((mode) => (
                      <ListBox.Item
                        key={mode}
                        id={mode}
                        textValue={displayLabels[mode]}
                      >
                        {displayLabels[mode]}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <ToolColorPicker
                    label={m["tools.faviconAssetsGenerator.themecolor"]()}
                    value={site.themeColor}
                    presets={COLOR_PRESETS}
                    onChange={(value) => updateSite("themeColor", value)}
                  />
                  <FieldDescription>
                    {m["tools.faviconAssetsGenerator.themeColorDescription"]()}
                  </FieldDescription>
                </div>
                <div className="grid gap-2">
                  <ToolColorPicker
                    label={m["common.faviconbackgroundcolor"]()}
                    value={site.backgroundColor}
                    presets={COLOR_PRESETS}
                    onChange={(value) => updateSite("backgroundColor", value)}
                  />
                  <FieldDescription>
                    {m[
                      "tools.faviconAssetsGenerator.backgroundColorDescription"
                    ]()}
                  </FieldDescription>
                </div>
              </div>
              <BooleanSwitch
                label={m[
                  "tools.faviconAssetsGenerator.enableDarkThemeColorLabel"
                ]()}
                description={m[
                  "tools.faviconAssetsGenerator.enableDarkThemeColorDescription"
                ]()}
                value={site.enableDarkThemeColor !== false}
                onChange={(checked) =>
                  updateSite("enableDarkThemeColor", checked)
                }
              />
              {site.enableDarkThemeColor !== false ? (
                <ToolColorPicker
                  label={m["tools.faviconAssetsGenerator.darkthemecolor"]()}
                  value={site.darkThemeColor}
                  presets={COLOR_PRESETS}
                  onChange={(value) => updateSite("darkThemeColor", value)}
                />
              ) : null}
              <BooleanSwitch
                label={m["tools.faviconAssetsGenerator.optimizePngLabel"]()}
                description={m[
                  "tools.faviconAssetsGenerator.optimizePngDescription"
                ]()}
                value={optimizePng}
                onChange={(checked) => {
                  setOptimizePng(checked);
                  invalidate();
                }}
              />
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item id="desktop">
          <Accordion.Heading>
            <Accordion.Trigger>
              <span className="grid min-w-0 flex-1 gap-1 text-start">
                <span className="font-medium text-foreground">
                  {m["tools.faviconAssetsGenerator.desktopCardTitle"]()}
                </span>
                <span className="text-xs leading-5 font-normal text-muted">
                  {m["tools.faviconAssetsGenerator.desktopCardDescription"]()}
                </span>
              </span>
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="grid gap-6 border-t border-separator py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="grid content-start gap-4">
                <BooleanSwitch
                  label={m[
                    "tools.faviconAssetsGenerator.useOriginalSvgLabel"
                  ]()}
                  description={m[
                    "tools.faviconAssetsGenerator.useOriginalSvgDescription"
                  ]()}
                  value={useOriginalSvg}
                  onChange={(checked) => {
                    setUseOriginalSvg(checked);
                    invalidate();
                  }}
                />
                {platformControls("desktop", desktop, (patch) =>
                  updatePlatform(setDesktop, patch),
                )}
              </div>
              <PreviewGallery
                kind="desktop"
                source={effective("desktop")}
                background={
                  desktop.addBackground ? desktop.backgroundColor : undefined
                }
                radius={desktop.backgroundRadius}
                margin={desktop.margin}
                appName={
                  site.name || m["tools.faviconAssetsGenerator.assetsname"]()
                }
                hasBundle={Boolean(bundle)}
              />
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item id="ios">
          <Accordion.Heading>
            <Accordion.Trigger>
              <span className="grid min-w-0 flex-1 gap-1 text-start">
                <span className="font-medium text-foreground">
                  {m["tools.faviconAssetsGenerator.iosCardTitle"]()}
                </span>
                <span className="text-xs leading-5 font-normal text-muted">
                  {m["tools.faviconAssetsGenerator.iosCardDescription"]()}
                </span>
              </span>
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="grid gap-6 border-t border-separator py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              {platformControls("ios", ios, (patch) =>
                updatePlatform(setIos, patch),
              )}
              <PreviewGallery
                kind="ios"
                source={effective("ios")}
                background={ios.backgroundColor}
                margin={ios.margin}
                appName={
                  site.name || m["tools.faviconAssetsGenerator.assetsname"]()
                }
                hasBundle={Boolean(bundle)}
              />
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item id="pwa">
          <Accordion.Heading>
            <Accordion.Trigger>
              <span className="grid min-w-0 flex-1 gap-1 text-start">
                <span className="font-medium text-foreground">
                  {m["tools.faviconAssetsGenerator.pwasection"]()}
                </span>
                <span className="text-xs leading-5 font-normal text-muted">
                  {m["tools.faviconAssetsGenerator.pwaCardDescription"]()}
                </span>
              </span>
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="grid gap-6 border-t border-separator py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="grid content-start gap-4">
                {platformControls("pwa", pwa, updatePwa)}
                <BooleanSwitch
                  label={m[
                    "tools.faviconAssetsGenerator.includeMaskableLabel"
                  ]()}
                  description={m[
                    "tools.faviconAssetsGenerator.includeMaskableDescription"
                  ]()}
                  value={site.includeMaskable}
                  onChange={(checked) => updateSite("includeMaskable", checked)}
                />
                {site.includeMaskable ? (
                  <div className="grid gap-4">
                    <ToolColorPicker
                      label={m[
                        "tools.faviconAssetsGenerator.maskableBackgroundColorLabel"
                      ]()}
                      value={pwa.maskableBackgroundColor}
                      presets={COLOR_PRESETS}
                      onChange={(maskableBackgroundColor) =>
                        updatePwa({ maskableBackgroundColor })
                      }
                    />
                    <PercentSlider
                      label={m[
                        "tools.faviconAssetsGenerator.maskableMarginLabel"
                      ]()}
                      description={m[
                        "tools.faviconAssetsGenerator.maskableMarginDescription"
                      ]()}
                      value={pwa.maskableMargin}
                      onChange={(maskableMargin) =>
                        updatePwa({ maskableMargin })
                      }
                    />
                  </div>
                ) : null}
              </div>
              <PreviewGallery
                kind="pwa"
                source={effective("pwa")}
                background={pwa.addBackground ? pwa.backgroundColor : undefined}
                radius={pwa.backgroundRadius}
                margin={pwa.margin}
                appName={
                  site.name || m["tools.faviconAssetsGenerator.assetsname"]()
                }
                hasBundle={Boolean(bundle)}
                includeMaskable={site.includeMaskable}
                maskableBackground={pwa.maskableBackgroundColor}
                maskableMargin={pwa.maskableMargin}
              />
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>{error.title}</Alert.Title>
            <Alert.Description>{error.description}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <ToolPanelCard>
        <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid gap-1">
            <Card.Title>
              {m["tools.faviconAssetsGenerator.resultCardTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.faviconAssetsGenerator.resultCardDescription"]()}
            </Card.Description>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              isDisabled={busy}
              onPress={reset}
            >
              <RefreshCcw aria-hidden className="size-4" />
              {m["tools.svgOptimizer.reset"]()}
            </Button>
            <Button
              type="button"
              size="sm"
              isDisabled={!sources.global || busy}
              onPress={() => void generate()}
            >
              {bundle ? (
                <RotateCcw aria-hidden className="size-4" />
              ) : (
                <Sparkles aria-hidden className="size-4" />
              )}
              {busy
                ? m["tools.faviconAssetsGenerator.generatingLabel"]()
                : bundle
                  ? m["common.ksuidRegenerate"]()
                  : m["tools.faviconAssetsGenerator.generateLabel"]()}
            </Button>
            {bundle ? (
              <Link
                className={`${buttonVariants({ size: "sm", variant: "primary" })} gap-2`}
                href={bundle.zipUrl}
                download="Favicon Assets.zip"
              >
                <Download aria-hidden className="size-4" />
                {m["tools.faviconAssetsGenerator.downloadZipLabel"]()}
              </Link>
            ) : null}
          </div>
        </Card.Header>
        <ToolPanelCardContent className="gap-5 py-4">
          {busy ? (
            <ResultSkeleton
              label={m["tools.faviconAssetsGenerator.generatingLabel"]()}
            />
          ) : bundle ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-foreground">
                    {m["tools.faviconAssetsGenerator.generatedAssetsTitle"]()}
                  </h3>
                  <span className="rounded-full bg-default px-2.5 py-1 text-xs text-muted">
                    {m["common.filescount"]({ count: bundle.assets.length })}
                  </span>
                </div>
              </div>
              <div className="grid gap-2">
                {bundle.assets.map((asset) => (
                  <Link
                    key={asset.filename}
                    href={asset.url}
                    download={asset.filename}
                    aria-label={`${m["tools.faviconAssetsGenerator.downloadAssetLabel"]()} – ${asset.filename}`}
                    className="group flex min-w-0 items-center gap-3 rounded-xl border border-border bg-default/20 p-3 transition-colors hover:bg-default/50"
                  >
                    <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-default">
                      {asset.mimeType.startsWith("image/") ? (
                        <img
                          className="max-h-12 max-w-12 object-contain"
                          src={asset.url}
                          alt={asset.filename}
                        />
                      ) : (
                        <span className="font-mono text-xs text-muted">
                          {asset.filename.endsWith(".json") ||
                          asset.filename.endsWith(".webmanifest")
                            ? "JSON"
                            : "HTML"}
                        </span>
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {asset.filename}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {formatFileSize(asset.bytes.length, locale)}
                    </span>
                  </Link>
                ))}
              </div>
              <CodeBlock
                code={bundle.head}
                title={m["tools.faviconAssetsGenerator.htmlSnippetTitle"]()}
                description={m[
                  "tools.faviconAssetsGenerator.htmlSnippetDescription"
                ]()}
                language="HTML"
                copyLabel={m["common.actions.copy"]()}
                copiedLabel={m["common.actions.copied"]()}
                maxHeightClassName="max-h-72"
                codeClassName="text-xs"
              />
              <CodeBlock
                code={bundle.manifest}
                title={m["tools.faviconAssetsGenerator.manifestPreviewTitle"]()}
                description={m[
                  "tools.faviconAssetsGenerator.manifestPreviewDescription"
                ]()}
                language="JSON"
                copyLabel={m["common.actions.copy"]()}
                copiedLabel={m["common.actions.copied"]()}
                maxHeightClassName="max-h-72"
                codeClassName="text-xs"
              />
            </>
          ) : (
            <div className="grid min-h-40 place-items-center gap-2 p-6 text-center">
              <ImagePlus aria-hidden className="size-6 text-muted" />
              <div className="grid gap-1">
                <h3 className="font-medium text-foreground">
                  {m["tools.faviconAssetsGenerator.resultEmptyTitle"]()}
                </h3>
                <p className="text-sm text-muted">
                  {m["tools.faviconAssetsGenerator.resultEmptyDescription"]()}
                </p>
              </div>
            </div>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["tools.faviconAssetsGenerator.articleWhatTitle"]()}</h2>
        <p>{m["tools.faviconAssetsGenerator.articleWhatBody"]()}</p>
        <h2>{m["tools.faviconAssetsGenerator.articleBundleTitle"]()}</h2>
        <ul>
          {[
            m["tools.faviconAssetsGenerator.articleBundleItems0"](),
            m["tools.faviconAssetsGenerator.articleBundleItems1"](),
            m["tools.faviconAssetsGenerator.articleBundleItems2"](),
            m["tools.faviconAssetsGenerator.articleBundleItems3"](),
            m["tools.faviconAssetsGenerator.articleBundleItems4"](),
            m["tools.faviconAssetsGenerator.articleBundleItems5"](),
            m["tools.faviconAssetsGenerator.articleBundleItems6"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.faviconAssetsGenerator.articlePaddingTitle"]()}</h2>
        <p>{m["tools.faviconAssetsGenerator.articlePaddingBody"]()}</p>
        <h2>{m["tools.faviconAssetsGenerator.articleWiringTitle"]()}</h2>
        <ol>
          {[
            m["tools.faviconAssetsGenerator.articleWiringSteps0"](),
            m["tools.faviconAssetsGenerator.articleWiringSteps1"](),
            m["tools.faviconAssetsGenerator.articleWiringSteps2"](),
            m["tools.faviconAssetsGenerator.articleWiringSteps3"](),
          ].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </ToolArticle>
    </div>
  );
}

export default function FaviconAssetsGenerator() {
  return (
    <ToolPage>
      <FaviconAssetsGeneratorContent />
    </ToolPage>
  );
}
