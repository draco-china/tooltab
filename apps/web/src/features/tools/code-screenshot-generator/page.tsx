import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Autocomplete,
  Button,
  Card,
  Input,
  Label,
  ListBox,
  SearchField,
  Select,
  Skeleton,
  Slider,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  useFilter,
} from "@heroui/react";
import { Download, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CodeEditor } from "@/components/base/code-editor";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolColorPicker } from "@/components/base/tool-color-picker";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { COLOR_PRESETS } from "@/lib/color-presets";
import {
  CODE_SCREENSHOT_MAX_DIMENSION,
  CODE_SCREENSHOT_MAX_INPUT,
  CODE_SCREENSHOT_MAX_PIXELS,
  type CodeScreenshotOptions,
  type CodeScreenshotRender,
  codeScreenshotLanguages,
  codeThemes,
  defaultCodeScreenshotOptions,
  validateCodeScreenshotOptions,
} from "@workspace/tools/image/code-screenshot";
import { renderInWorker } from "./worker-client";

type SelectOption = Readonly<{ value: string; label: string }>;
type StoredSettings = Readonly<{
  options?: Partial<CodeScreenshotOptions>;
  filename?: string;
  scale?: number;
}>;

const STORAGE_KEY = "tools:code-screenshot-generator:v1";
const UI_DEFAULT_OPTIONS: CodeScreenshotOptions = {
  ...defaultCodeScreenshotOptions,
  code: `const createShot = (code) => ({
  code,
  theme: "nebula",
  background: "aurora",
  formats: ["png", "svg", "webp", "html"],
})`,
  language: "auto",
};
const ACCEPTED_TEXT_FILES = [
  ".txt",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".css",
  ".html",
  ".xml",
  ".md",
  ".yml",
  ".yaml",
  ".sh",
  "text/*",
  "application/json",
] as const;

const languageLabels: Record<string, string> = {
  auto: "Auto",
  bash: "Bash",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  go: "Go",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  php: "PHP",
  python: "Python",
  ruby: "Ruby",
  rust: "Rust",
  swift: "Swift",
  typescript: "TypeScript",
  xml: "HTML/XML",
  yaml: "YAML",
};

function PanelHeader({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
  );
}

function Menu({
  label,
  value,
  options,
  onChange,
  searchable = false,
}: Readonly<{
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
}>) {
  const { contains } = useFilter({ sensitivity: "base" });
  if (searchable) {
    return (
      <Autocomplete
        aria-label={label}
        selectedKey={value}
        onSelectionChange={(key) => key != null && onChange(String(key))}
        fullWidth
      >
        <Label>{label}</Label>
        <Autocomplete.Trigger className="min-h-11 rounded-xl border border-border bg-default">
          <Autocomplete.Value />
          <Autocomplete.Indicator />
        </Autocomplete.Trigger>
        <Autocomplete.Popover className="max-h-80">
          <Autocomplete.Filter filter={contains}>
            <SearchField aria-label={label}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={label} />
              </SearchField.Group>
            </SearchField>
            <ListBox className="max-h-64 overflow-y-auto">
              {options.map((option) => (
                <ListBox.Item
                  id={option.value}
                  key={option.value}
                  textValue={option.label}
                >
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Autocomplete.Filter>
        </Autocomplete.Popover>
      </Autocomplete>
    );
  }
  return (
    <Select
      variant="secondary"
      aria-label={label}
      selectedKey={value}
      onSelectionChange={(key) => key != null && onChange(String(key))}
      fullWidth
    >
      <Label>{label}</Label>
      <Select.Trigger className="min-h-11 rounded-xl border border-border bg-default">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item
              id={option.value}
              key={option.value}
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

function ChoiceGroup({
  label,
  value,
  options,
  columns = 2,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: readonly SelectOption[];
  columns?: 2 | 3 | 4;
  onChange: (value: string) => void;
}>) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <ToggleButtonGroup
        aria-label={label}
        selectionMode="single"
        selectedKeys={new Set([value])}
        className={`grid w-full ${columns === 4 ? "grid-cols-4" : columns === 3 ? "grid-cols-3" : "grid-cols-2"} [&_button]:min-h-11`}
        onSelectionChange={(selection) => {
          const next = String([...selection][0] ?? "");
          if (next) onChange(next);
        }}
      >
        {options.map((option) => (
          <ToggleButton id={option.value} key={option.value}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  isDisabled = false,
  onChange,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  isDisabled?: boolean;
  onChange: (value: number) => void;
}>) {
  const id = useId();
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex min-h-11 items-center gap-3">
        <Slider
          aria-label={label}
          minValue={min}
          maxValue={max}
          step={step}
          value={value}
          isDisabled={isDisabled}
          className="min-w-0 flex-1"
          onChange={(next) => onChange(clamp(Number(next)))}
        >
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <Input
          id={id}
          aria-label={label}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={String(value)}
          disabled={isDisabled}
          className="min-h-11 w-20 shrink-0 rounded-xl border border-border bg-default"
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) onChange(clamp(next));
          }}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  isDisabled = false,
  onChange,
}: Readonly<{
  label: string;
  value: boolean;
  isDisabled?: boolean;
  onChange: (value: boolean) => void;
}>) {
  return (
    <Switch
      isSelected={value}
      isDisabled={isDisabled}
      onChange={(selected) => onChange(selected === true)}
    >
      <Switch.Content className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <span>{label}</span>
      </Switch.Content>
    </Switch>
  );
}

function safeName(name: string, extension: string) {
  const stem =
    name
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "code-shot";
  return `${stem.replace(/\.(png|jpe?g|webp|svg|html)$/i, "")}.${extension}`;
}

async function rasterBlob(
  result: CodeScreenshotRender,
  format: "png" | "jpeg" | "webp",
  scale: number,
  jpegBackground: string,
) {
  const width = result.width * scale;
  const height = result.height * scale;
  if (
    width > CODE_SCREENSHOT_MAX_DIMENSION * 2 ||
    height > CODE_SCREENSHOT_MAX_DIMENSION * 2 ||
    width * height > CODE_SCREENSHOT_MAX_PIXELS * 2
  ) {
    throw new Error("too_large");
  }
  await document.fonts?.ready;
  const url = URL.createObjectURL(
    new Blob([result.svg], { type: "image/svg+xml" }),
  );
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("render_failed"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("unsupported");
    if (format === "jpeg") {
      context.fillStyle = jpegBackground;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("render_failed"))),
        `image/${format}`,
        0.92,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function restoredSettings(): {
  options: CodeScreenshotOptions;
  filename: string;
  scale: number;
} {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {
        options: UI_DEFAULT_OPTIONS,
        filename: "code-shot",
        scale: 2,
      };
    }
    const parsed = JSON.parse(stored) as StoredSettings;
    const options = {
      ...UI_DEFAULT_OPTIONS,
      ...parsed.options,
    };
    validateCodeScreenshotOptions({
      ...options,
      code: options.code.trim() ? options.code : "validation-placeholder",
    });
    return {
      options,
      filename:
        typeof parsed.filename === "string" ? parsed.filename : "code-shot",
      scale: [1, 2, 3].includes(parsed.scale ?? 0)
        ? (parsed.scale as number)
        : 2,
    };
  } catch {
    return {
      options: UI_DEFAULT_OPTIONS,
      filename: "code-shot",
      scale: 2,
    };
  }
}

function CodeScreenshotGeneratorContent() {
  const [options, setOptions] = useState(UI_DEFAULT_OPTIONS);
  const [result, setResult] = useState<CodeScreenshotRender | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("code-shot");
  const [scale, setScale] = useState(2);
  const [hydrated, setHydrated] = useState(false);
  const previewUrl = useRef("");
  const downloadUrl = useRef("");
  const revision = useRef(0);
  const [preview, setPreview] = useState("");

  const update = <K extends keyof CodeScreenshotOptions>(
    key: K,
    value: CodeScreenshotOptions[K],
  ) => setOptions((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const restored = restoredSettings();
    setOptions(restored.options);
    setFilename(restored.filename);
    setScale(restored.scale);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ options, filename, scale } satisfies StoredSettings),
      );
    } catch {
      // Persistence is optional; rendering remains local and fully functional.
    }
  }, [filename, hydrated, options, scale]);

  useEffect(() => {
    const run = ++revision.current;
    if (!options.code.trim()) {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = "";
      setPreview("");
      setResult(null);
      setBusy(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setError("");
    const timer = window.setTimeout(async () => {
      try {
        const next = await renderInWorker(options, controller.signal);
        if (run !== revision.current) return;
        const nextUrl = URL.createObjectURL(
          new Blob([next.svg], { type: "image/svg+xml" }),
        );
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = nextUrl;
        setPreview(nextUrl);
        setResult(next);
      } catch (caught) {
        if (!controller.signal.aborted && run === revision.current) {
          if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
          previewUrl.current = "";
          setResult(null);
          setPreview("");
          setError(
            caught instanceof Error && caught.message === "too_large"
              ? m["tools.codeScreenshotGenerator.tooLargeErrorDescription"]()
              : m["tools.codeScreenshotGenerator.exportErrorDescription"](),
          );
        }
      } finally {
        if (run === revision.current) setBusy(false);
      }
    }, 160);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [options]);

  useEffect(
    () => () => {
      revision.current += 1;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    },
    [],
  );

  async function importText(file: File) {
    if (file.size > CODE_SCREENSHOT_MAX_INPUT) {
      setError(m["tools.codeScreenshotGenerator.tooLargeErrorDescription"]());
      return;
    }
    try {
      update("code", await file.text());
    } catch {
      setError(m["tools.codeScreenshotGenerator.exportErrorDescription"]());
    }
  }

  async function download(format: "png" | "jpeg" | "webp" | "svg" | "html") {
    if (!result) return;
    setError("");
    try {
      const blob =
        format === "svg"
          ? new Blob([result.svg], { type: "image/svg+xml" })
          : format === "html"
            ? new Blob([result.html], { type: "text/html;charset=utf-8" })
            : await rasterBlob(
                result,
                format,
                scale,
                codeThemes[options.theme].background,
              );
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      const url = URL.createObjectURL(blob);
      downloadUrl.current = url;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeName(filename, format === "jpeg" ? "jpg" : format);
      anchor.click();
      window.setTimeout(() => {
        if (downloadUrl.current === url) downloadUrl.current = "";
        URL.revokeObjectURL(url);
      }, 0);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === "too_large"
          ? m["tools.codeScreenshotGenerator.tooLargeErrorDescription"]()
          : m["tools.codeScreenshotGenerator.exportErrorDescription"](),
      );
    }
  }

  const themes = [
    {
      value: "nebula",
      label: m["tools.codeScreenshotGenerator.themeNebula"](),
    },
    {
      value: "sunrise",
      label: m["tools.codeScreenshotGenerator.themeSunrise"](),
    },
    { value: "paper", label: m["tools.codeScreenshotGenerator.themePaper"]() },
    {
      value: "terminal",
      label: m["tools.codeScreenshotGenerator.themeTerminal"](),
    },
  ];
  const backgrounds = [
    {
      value: "aurora",
      label: m["tools.codeScreenshotGenerator.backgroundPresetAurora"](),
    },
    {
      value: "sunset",
      label: m["tools.codeScreenshotGenerator.backgroundPresetSunset"](),
    },
    {
      value: "ocean",
      label: m["tools.codeScreenshotGenerator.backgroundPresetOcean"](),
    },
    {
      value: "ember",
      label: m["tools.codeScreenshotGenerator.backgroundPresetEmber"](),
    },
    {
      value: "noir",
      label: m["tools.codeScreenshotGenerator.backgroundPresetNoir"](),
    },
  ];

  return (
    <div className="grid gap-8">
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(22rem,0.7fr)]">
        <div className="grid min-w-0 gap-6">
          <ToolPanelCard className="min-w-0">
            <ToolPanelCardContent className="gap-4 py-4">
              <CodeEditor
                embedded
                title={m["tools.codeScreenshotGenerator.codeTitle"]()}
                description={m[
                  "tools.codeScreenshotGenerator.codeDescription"
                ]()}
                aria-label={m["tools.codeScreenshotGenerator.codeInputLabel"]()}
                language={
                  options.language === "auto" ? "plaintext" : options.language
                }
                modelPath={`tooltab://code-screenshot/source.${options.language === "auto" ? "txt" : options.language}`}
                value={options.code}
                onChange={(value) => update("code", value)}
                height={320}
              />
            </ToolPanelCardContent>
            <ToolPanelCardFooter className="block">
              <ToolFilePicker
                label={m["tools.codeScreenshotGenerator.importTextLabel"]()}
                accept={[...ACCEPTED_TEXT_FILES]}
                onSelect={(file) => void importText(file)}
              />
            </ToolPanelCardFooter>
          </ToolPanelCard>

          <div className="grid min-w-0 gap-6 lg:grid-cols-2 xl:grid-cols-1">
            <ToolPanelCard className="min-w-0">
              <PanelHeader
                title={m["tools.codeScreenshotGenerator.syntaxTitle"]()}
                description={m[
                  "tools.codeScreenshotGenerator.syntaxDescription"
                ]()}
              />
              <ToolPanelCardContent className="grid gap-5 py-4">
                <Menu
                  label={m["tools.sqlFormatterAndLinter.fmtlanguage"]()}
                  value={options.language}
                  options={codeScreenshotLanguages.map((value) => ({
                    value,
                    label: languageLabels[value],
                  }))}
                  searchable
                  onChange={(value) =>
                    update(
                      "language",
                      value as CodeScreenshotOptions["language"],
                    )
                  }
                />
                <ChoiceGroup
                  label={m["tools.codeScreenshotGenerator.renderModeLabel"]()}
                  value={options.renderMode}
                  options={[
                    {
                      value: "highlight",
                      label:
                        m["tools.codeScreenshotGenerator.renderHighlight"](),
                    },
                    {
                      value: "plain",
                      label: m["tools.codeScreenshotGenerator.renderPlain"](),
                    },
                  ]}
                  onChange={(value) =>
                    update(
                      "renderMode",
                      value as CodeScreenshotOptions["renderMode"],
                    )
                  }
                />
                <Menu
                  label={m["tools.codeScreenshotGenerator.themeLabel"]()}
                  value={options.theme}
                  options={themes}
                  onChange={(value) =>
                    update("theme", value as CodeScreenshotOptions["theme"])
                  }
                />
              </ToolPanelCardContent>
            </ToolPanelCard>

            <ToolPanelCard className="min-w-0">
              <PanelHeader
                title={m["shared.colorTools.background"]()}
                description={m[
                  "tools.codeScreenshotGenerator.backgroundDescription"
                ]()}
              />
              <ToolPanelCardContent className="grid gap-5 py-4">
                <ChoiceGroup
                  label={m[
                    "tools.codeScreenshotGenerator.backgroundModeLabel"
                  ]()}
                  value={options.backgroundMode}
                  columns={4}
                  options={[
                    {
                      value: "preset",
                      label:
                        m[
                          "tools.codeScreenshotGenerator.backgroundModePreset"
                        ](),
                    },
                    { value: "solid", label: m["common.solid"]() },
                    {
                      value: "transparent",
                      label:
                        m[
                          "tools.codeScreenshotGenerator.backgroundModeTransparent"
                        ](),
                    },
                    { value: "none", label: m["tools.svgOptimizer.none"]() },
                  ]}
                  onChange={(value) =>
                    update(
                      "backgroundMode",
                      value as CodeScreenshotOptions["backgroundMode"],
                    )
                  }
                />
                {options.backgroundMode === "preset" ? (
                  <Menu
                    label={m[
                      "tools.codeScreenshotGenerator.backgroundModePreset"
                    ]()}
                    value={options.backgroundPreset}
                    options={backgrounds}
                    onChange={(value) =>
                      update(
                        "backgroundPreset",
                        value as CodeScreenshotOptions["backgroundPreset"],
                      )
                    }
                  />
                ) : null}
                {options.backgroundMode === "solid" ? (
                  <ToolColorPicker
                    label={m[
                      "tools.codeScreenshotGenerator.backgroundColorLabel"
                    ]()}
                    value={options.backgroundColor}
                    presets={COLOR_PRESETS}
                    onChange={(value) => update("backgroundColor", value)}
                  />
                ) : null}
              </ToolPanelCardContent>
            </ToolPanelCard>

            <ToolPanelCard className="min-w-0">
              <PanelHeader
                title={m["tools.codeScreenshotGenerator.windowTitle"]()}
                description={m[
                  "tools.codeScreenshotGenerator.windowDescription"
                ]()}
              />
              <ToolPanelCardContent className="grid gap-5 py-4">
                <ChoiceGroup
                  label={m["tools.codeScreenshotGenerator.windowStyleLabel"]()}
                  value={options.windowStyle}
                  columns={3}
                  options={[
                    {
                      value: "mac",
                      label: m["tools.codeScreenshotGenerator.windowMac"](),
                    },
                    {
                      value: "windows",
                      label: m["tools.codeScreenshotGenerator.windowWindows"](),
                    },
                    { value: "none", label: m["tools.svgOptimizer.none"]() },
                  ]}
                  onChange={(value) =>
                    update(
                      "windowStyle",
                      value as CodeScreenshotOptions["windowStyle"],
                    )
                  }
                />
                <Toggle
                  label={m["tools.codeScreenshotGenerator.lineNumbersLabel"]()}
                  value={options.lineNumbers}
                  onChange={(value) => update("lineNumbers", value)}
                />
              </ToolPanelCardContent>
            </ToolPanelCard>

            <ToolPanelCard className="min-w-0">
              <PanelHeader
                title={m["tools.codeScreenshotGenerator.layoutTitle"]()}
                description={m[
                  "tools.codeScreenshotGenerator.layoutDescription"
                ]()}
              />
              <ToolPanelCardContent className="grid gap-5 py-4">
                <NumberField
                  label={m["tools.codeScreenshotGenerator.fontSizeLabel"]()}
                  value={options.fontSize}
                  min={12}
                  max={28}
                  onChange={(value) => update("fontSize", value)}
                />
                <NumberField
                  label={m["tools.codeScreenshotGenerator.lineHeightLabel"]()}
                  value={options.lineHeight}
                  min={1.2}
                  max={2}
                  step={0.05}
                  onChange={(value) => update("lineHeight", value)}
                />
                <NumberField
                  label={m["tools.codeScreenshotGenerator.cardPaddingLabel"]()}
                  value={options.cardPadding}
                  min={12}
                  max={60}
                  onChange={(value) => update("cardPadding", value)}
                />
                <NumberField
                  label={m["tools.codeScreenshotGenerator.framePaddingLabel"]()}
                  value={
                    options.backgroundMode === "none" ? 0 : options.framePadding
                  }
                  min={0}
                  max={120}
                  isDisabled={options.backgroundMode === "none"}
                  onChange={(value) => update("framePadding", value)}
                />
                <NumberField
                  label={m["tools.codeScreenshotGenerator.cornerRadiusLabel"]()}
                  value={options.radius}
                  min={6}
                  max={40}
                  onChange={(value) => update("radius", value)}
                />
                <NumberField
                  label={m["tools.codeScreenshotGenerator.tabSizeLabel"]()}
                  value={options.tabSize}
                  min={2}
                  max={8}
                  onChange={(value) => update("tabSize", value)}
                />
                <Toggle
                  label={m["tools.codeScreenshotGenerator.shadowLabel"]()}
                  value={options.backgroundMode !== "none" && options.shadow}
                  isDisabled={options.backgroundMode === "none"}
                  onChange={(value) => update("shadow", value)}
                />
              </ToolPanelCardContent>
            </ToolPanelCard>
          </div>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-28">
          <ToolPanelCard className="min-w-0">
            <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="grid gap-1">
                <Card.Title>{m["common.faviconpreview"]()}</Card.Title>
                <Card.Description>
                  {m["tools.codeScreenshotGenerator.previewDescription"]()}
                </Card.Description>
              </div>
              {result ? (
                <span className="text-sm text-muted">
                  {m["tools.codeScreenshotGenerator.dimensionsLabel"]()}:{" "}
                  {result.width} × {result.height}
                </span>
              ) : null}
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              {error ? (
                <Alert status="danger" role="alert">
                  <Alert.Indicator>
                    <TriangleAlert aria-hidden className="size-4" />
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Title>
                      {m["tools.codeScreenshotGenerator.exportErrorTitle"]()}
                    </Alert.Title>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}

              <div className="flex min-h-96 items-center justify-center overflow-auto p-4 sm:p-6">
                {busy ? (
                  <div
                    role="status"
                    aria-label={m["common.faviconpreview"]()}
                    className="grid w-full max-w-md gap-3"
                  >
                    <Skeleton className="h-48 w-full rounded-2xl" />
                    <Skeleton className="mx-auto h-4 w-2/3" />
                  </div>
                ) : preview ? (
                  <img
                    src={preview}
                    alt={m["common.faviconpreview"]()}
                    className="max-h-136 max-w-full rounded-xl object-contain"
                  />
                ) : (
                  <div className="max-w-sm text-center">
                    <h3 className="font-medium">
                      {m["tools.codeScreenshotGenerator.emptyPreviewTitle"]()}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {m[
                        "tools.codeScreenshotGenerator.emptyPreviewDescription"
                      ]()}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <div className="grid gap-2">
                  <Label htmlFor="code-shot-name">
                    {m["common.datauriFilename"]()}
                  </Label>
                  <Input
                    id="code-shot-name"
                    value={filename}
                    className="min-h-11 rounded-xl border border-border bg-default"
                    onChange={(event) => setFilename(event.currentTarget.value)}
                  />
                </div>
                <Menu
                  label={m["tools.codeScreenshotGenerator.scaleLabel"]()}
                  value={String(scale)}
                  options={[1, 2, 3].map((value) => ({
                    value: String(value),
                    label: `${value}×`,
                  }))}
                  onChange={(value) => setScale(Number(value))}
                />
              </div>
            </ToolPanelCardContent>
            <ToolPanelCardFooter className="flex-col items-stretch gap-4">
              <div className="grid gap-1">
                <span className="text-sm font-medium">
                  {m["tools.codeScreenshotGenerator.exportTitle"]()}
                </span>
                <span className="text-sm text-muted">
                  {m["tools.codeScreenshotGenerator.exportDescription"]()}
                </span>
              </div>
              <ToolPanelActionGroup>
                {(
                  [
                    [
                      "png",
                      m["tools.codeScreenshotGenerator.downloadPngLabel"](),
                    ],
                    [
                      "jpeg",
                      m["tools.codeScreenshotGenerator.downloadJpegLabel"](),
                    ],
                    [
                      "webp",
                      m["tools.codeScreenshotGenerator.downloadWebpLabel"](),
                    ],
                    [
                      "svg",
                      m["tools.codeScreenshotGenerator.downloadSvgLabel"](),
                    ],
                    [
                      "html",
                      m["tools.codeScreenshotGenerator.downloadHtmlLabel"](),
                    ],
                  ] as const
                ).map(([format, label]) => (
                  <Button
                    key={format}
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    isDisabled={!result || busy}
                    onPress={() => void download(format)}
                  >
                    <Download aria-hidden className="size-4" />
                    {label}
                  </Button>
                ))}
                <ToolCopyButton
                  value={result?.svg ?? ""}
                  copyLabel={m["tools.svgOptimizer.copy"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  className="min-h-11"
                  disabled={!result || busy}
                />
                <ToolCopyButton
                  value={result?.html ?? ""}
                  copyLabel={m["tools.codeScreenshotGenerator.copyHtmlLabel"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  className="min-h-11"
                  disabled={!result || busy}
                />
              </ToolPanelActionGroup>
            </ToolPanelCardFooter>
          </ToolPanelCard>
        </aside>
      </div>

      <ToolArticle>
        <h2>{m["tools.codeScreenshotGenerator.articleWhatTitle"]()}</h2>
        <p>{m["tools.codeScreenshotGenerator.articleWhatBody"]()}</p>
        <h2>{m["tools.codeScreenshotGenerator.articleWhenTitle"]()}</h2>
        <p>{m["tools.codeScreenshotGenerator.articleWhenBody"]()}</p>
        <h2>{m["tools.codeScreenshotGenerator.articleCleanTitle"]()}</h2>
        <p>{m["tools.codeScreenshotGenerator.articleCleanBody"]()}</p>
        <h2>{m["tools.codeScreenshotGenerator.articlePrivacyTitle"]()}</h2>
        <p>{m["tools.codeScreenshotGenerator.articlePrivacyBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function CodeScreenshotGenerator() {
  return (
    <ToolPage>
      <CodeScreenshotGeneratorContent />
    </ToolPage>
  );
}
