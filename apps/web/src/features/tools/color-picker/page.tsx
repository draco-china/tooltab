import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Switch } from "@heroui/react";
import { Search } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_PIXELS,
} from "@workspace/tools/image/options";
import { getLocale } from "@/paraglide/runtime.js";
import {
  hexColor,
  parseColor,
  type Rgba,
} from "@workspace/tools/color/convert";
import { pickerValues } from "@workspace/tools/color/picker";

type PickedSource = "screen" | "image" | null;
type EyeDropperConstructor = new () => {
  open: () => Promise<{ sRGBHex: string }>;
};

const DEFAULT_COLOR: Rgba = { r: 52, g: 152, b: 219, a: 1 };
const STORAGE_KEYS = {
  rgba: "tools:color-picker:rgba",
  showAlpha: "tools:color-picker:show-alpha",
} as const;

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

function isImage(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i.test(file.name)
  );
}

function ScreenCard({
  supported,
  onPick,
}: {
  supported: boolean;
  onPick: () => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.colorPicker.screenTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.colorPicker.screenDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        {!supported ? (
          <Alert>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{m["tools.colorPicker.screenTitle"]()}</Alert.Title>
              <Alert.Description>
                {m["tools.colorPicker.screenUnsupported"]()}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        <Button
          type="button"
          className="min-h-11 w-full sm:w-auto"
          isDisabled={!supported}
          onPress={onPick}
        >
          <Search aria-hidden data-slot="icon" />
          {m["tools.colorPicker.screenButton"]()}
        </Button>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ImageCard({
  canvas,
  ready,
  fileName,
  error,
  onClear,
  onFile,
  onCanvasClick,
  onCanvasKeyDown,
}: {
  canvas: RefObject<HTMLCanvasElement | null>;
  ready: boolean;
  fileName: string;
  error: string;
  onClear: () => void;
  onFile: (file: File) => void;
  onCanvasClick: (event: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasKeyDown: (event: KeyboardEvent<HTMLCanvasElement>) => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.colorPicker.imageTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.colorPicker.imageDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        <ToolFilePicker
          label={m["tools.colorPicker.imageButton"]()}
          accept={["image/*", ".heic", ".heif", ".tif", ".tiff"]}
          fileName={fileName}
          description={m["tools.colorPicker.uploadHint"]()}
          onClear={onClear}
          onSelect={onFile}
        />
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
          >
            {error}
          </div>
        ) : null}
        <div className={ready ? "grid gap-3" : "hidden"}>
          <p className="text-sm text-muted-foreground">
            {m["tools.colorPicker.imageHint"]()}
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-default/30 p-3">
            <canvas
              ref={canvas}
              className="max-h-104 max-w-full cursor-crosshair rounded-lg border border-border bg-default object-contain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              role="img"
              tabIndex={ready ? 0 : -1}
              aria-label={m["tools.colorPicker.imageHint"]()}
              onClick={onCanvasClick}
              onKeyDown={onCanvasKeyDown}
            />
          </div>
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function OutputField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-default/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <ToolCopyButton
          value={value}
          copyLabel={m["common.actions.copyResult"]()}
          copiedLabel={m["common.actions.copied"]()}
          ariaLabel={label}
          size="icon-sm"
        />
      </div>
      <div className="font-mono text-sm break-all">{value}</div>
    </div>
  );
}

function ResultsCard({
  color,
  values,
  showAlpha,
  source,
  onShowAlphaChange,
}: {
  color: Rgba;
  values: ReturnType<typeof pickerValues>;
  showAlpha: boolean;
  source: PickedSource;
  onShowAlphaChange: (value: boolean) => void;
}) {
  const sourceLabel =
    source === "screen"
      ? m["tools.colorPicker.sourceScreen"]()
      : source === "image"
        ? m["shared.barcode.image"]()
        : m["tools.colorPicker.sourceUnknown"]();
  const fields = [
    { label: m["common.cssgenHex"](), value: values.hex },
    {
      label: showAlpha
        ? m["common.cssgenRgba"]()
        : m["tools.colorPicker.rgb"](),
      value: values.rgb,
    },
    {
      label: showAlpha
        ? m["tools.colorPicker.hsla"]()
        : m["tools.colorPicker.hsl"](),
      value: values.hsl,
    },
    {
      label: showAlpha
        ? m["tools.colorPicker.hsva"]()
        : m["tools.colorPicker.hsv"](),
      value: values.hsv,
    },
    { label: m["tools.colorPicker.cmyk"](), value: values.cmyk },
  ];
  if (showAlpha)
    fields.push({ label: m["tools.colorPicker.alpha"](), value: values.alpha });

  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.colorPicker.resultsTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.colorPicker.description"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-default/30 p-4">
          <div
            aria-hidden="true"
            className="size-16 rounded-2xl border border-border shadow-inner"
            style={{ backgroundColor: hexColor(color, true) }}
          />
          <div className="grid gap-1">
            <p className="font-medium">{m["tools.colorPicker.name"]()}</p>
            <p className="text-sm text-muted-foreground">
              {m["shared.referenceLookups.source"]()}: {sourceLabel}
            </p>
          </div>
          <Switch
            aria-label={m["tools.colorPicker.showAlpha"]()}
            isSelected={showAlpha}
            onChange={onShowAlphaChange}
          >
            <Switch.Content className="flex min-h-11 items-center gap-3 text-sm">
              <span>{m["tools.colorPicker.showAlpha"]()}</span>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {fields.map((field) => (
            <OutputField
              key={field.label}
              label={field.label}
              value={field.value}
            />
          ))}
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function PickerArticle() {
  const isChinese = getLocale() === "zh-CN";
  return (
    <ToolArticle>
      <h2>{m["shared.barcodeTools.generatorArticleWhatTitle"]()}</h2>
      <p>{m["tools.colorPicker.description"]()}</p>
      <h2>{m["tools.colorPicker.articleTipsTitle"]()}</h2>
      <ul>
        <li>{m["tools.colorPicker.articleScreenTip"]()}</li>
        <li>{m["tools.colorPicker.articleImageTip"]()}</li>
      </ul>
      <h2>{m["tools.colorPicker.articleOutputTitle"]()}</h2>
      <ul>
        <li>
          {m["tools.colorPicker.articleAlphaPrefix"]()}
          <code>#RRGGBBAA</code>
          {isChinese ? "、" : ", "}
          <code>rgba(...)</code>
          {isChinese ? "、" : ", "}
          <code>hsla(...)</code>
          {isChinese ? " 或 " : ", or "}
          <code>hsva(...)</code>
          {m["tools.colorPicker.articleAlphaSuffix"]()}
        </li>
        <li>{m["tools.colorPicker.articleFormatNote"]()}</li>
      </ul>
    </ToolArticle>
  );
}

function ColorPickerToolContent() {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const imageUrl = useRef("");
  const imageTask = useRef<HTMLImageElement | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const [color, setColor] = useState<Rgba>(DEFAULT_COLOR);
  const [showAlpha, setShowAlpha] = useState(true);
  const [source, setSource] = useState<PickedSource>(null);
  const [imageFileName, setImageFileName] = useState("");
  const [ready, setReady] = useState(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const [storageLoaded, setStorageLoaded] = useState(false);
  const eyeDropper = (
    globalThis as typeof globalThis & { EyeDropper?: EyeDropperConstructor }
  ).EyeDropper;
  const values = useMemo(
    () => pickerValues(color, showAlpha),
    [color, showAlpha],
  );

  const clearImage = useCallback(() => {
    revision.current += 1;
    imageTask.current?.removeAttribute("src");
    imageTask.current = null;
    if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
    imageUrl.current = "";
    const element = canvas.current;
    if (element) {
      element.getContext("2d")?.clearRect(0, 0, element.width, element.height);
      element.width = 0;
      element.height = 0;
    }
    if (mounted.current) {
      setReady(false);
      setError("");
      setImageFileName("");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setColor(readStoredColor());
    setShowAlpha(readStoredAlpha());
    setStorageLoaded(true);
    return () => {
      mounted.current = false;
      clearImage();
    };
  }, [clearImage]);

  useEffect(() => {
    if (!storageLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEYS.rgba, JSON.stringify(color));
      localStorage.setItem(STORAGE_KEYS.showAlpha, String(showAlpha));
    } catch {
      // Storage failure does not affect picking.
    }
  }, [color, showAlpha, storageLoaded]);

  function update(next: Rgba, pickedSource: Exclude<PickedSource, null>) {
    setColor(next);
    setSource(pickedSource);
    setError("");
  }

  async function pickScreen() {
    if (!eyeDropper) return;
    try {
      const result = await new eyeDropper().open();
      if (mounted.current) update(parseColor(result.sRGBHex), "screen");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError")
        return;
    }
  }

  function loadImage(file: File | null) {
    clearImage();
    if (!file?.size || file.size > MAX_FILE_BYTES || !isImage(file)) {
      setError(m["tools.colorPicker.imageError"]());
      return;
    }
    setImageFileName(file.name);
    const epoch = revision.current;
    const url = URL.createObjectURL(file);
    imageUrl.current = url;
    const image = new Image();
    imageTask.current = image;
    image.onload = () => {
      if (!mounted.current || revision.current !== epoch) return;
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (
        !width ||
        !height ||
        !Number.isSafeInteger(width * height) ||
        width * height > MAX_IMAGE_PIXELS
      ) {
        clearImage();
        setError(m["tools.colorPicker.imageError"]());
        return;
      }
      const element = canvas.current;
      const context = element?.getContext("2d", { willReadFrequently: true });
      if (!element || !context) {
        clearImage();
        setError(m["tools.colorPicker.imageError"]());
        return;
      }
      element.width = width;
      element.height = height;
      context.drawImage(image, 0, 0);
      setCursor({ x: Math.floor(width / 2), y: Math.floor(height / 2) });
      setReady(true);
      setError("");
      imageTask.current = null;
      URL.revokeObjectURL(url);
      imageUrl.current = "";
    };
    image.onerror = () => {
      if (!mounted.current || revision.current !== epoch) return;
      clearImage();
      setError(m["tools.colorPicker.imageError"]());
    };
    image.src = url;
  }

  function sample(x: number, y: number) {
    const element = canvas.current;
    const context = element?.getContext("2d", { willReadFrequently: true });
    if (!element || !context || !ready) return;
    const safeX = Math.max(0, Math.min(Math.floor(x), element.width - 1));
    const safeY = Math.max(0, Math.min(Math.floor(y), element.height - 1));
    try {
      const pixel = context.getImageData(safeX, safeY, 1, 1).data;
      setCursor({ x: safeX, y: safeY });
      update(
        {
          r: pixel[0] ?? 0,
          g: pixel[1] ?? 0,
          b: pixel[2] ?? 0,
          a: (pixel[3] ?? 255) / 255,
        },
        "image",
      );
    } catch {
      setError(m["tools.colorPicker.imageError"]());
    }
  }

  function samplePointer(event: MouseEvent<HTMLCanvasElement>) {
    const element = event.currentTarget;
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height) return;
    sample(
      ((event.clientX - box.left) * element.width) / box.width,
      ((event.clientY - box.top) * element.height) / box.height,
    );
  }

  function sampleKeyboard(event: KeyboardEvent<HTMLCanvasElement>) {
    const movement: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = movement[event.key];
    if (delta) {
      event.preventDefault();
      sample(cursor.x + delta[0], cursor.y + delta[1]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      sample(cursor.x, cursor.y);
    }
  }

  return (
    <div className="grid gap-8">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <div className="grid gap-6">
          <ScreenCard
            supported={Boolean(eyeDropper)}
            onPick={() => void pickScreen()}
          />
          <ImageCard
            canvas={canvas}
            ready={ready}
            fileName={imageFileName}
            error={error}
            onClear={clearImage}
            onFile={loadImage}
            onCanvasClick={samplePointer}
            onCanvasKeyDown={sampleKeyboard}
          />
        </div>
        <ResultsCard
          color={color}
          values={values}
          showAlpha={showAlpha}
          source={source}
          onShowAlphaChange={setShowAlpha}
        />
      </div>
      <PickerArticle />
    </div>
  );
}

export default function ColorPickerTool() {
  return (
    <ToolPage>
      <ColorPickerToolContent />
    </ToolPage>
  );
}
