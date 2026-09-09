import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Label,
  Link,
  ListBox,
  Select,
  Switch,
  TextArea,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { Download, RotateCcw, Sparkles, X } from "lucide-react";
import { type DragEvent, useEffect, useId, useRef, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import {
  type OptimizerCode,
  OptimizerError,
  optimizedName,
  PNG_INPUT_LIMIT,
  type PngOptions,
  pngDefaults,
  SVG_INPUT_LIMIT,
  type SvgOptions,
  svgDefaults,
} from "@workspace/tools/image/optimizer";
import { runOptimizerWorker } from "@/features/tools/image-optimizers/worker-client";
import { formatFileSize } from "@/lib/file-size";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { browserXml } from "../image-formats/svg";
import { validateSvg } from "@workspace/tools/image/svg";

const optionMessages = {
  multipass: m["shared.imageOptimizers.optimizerMultipass"],
  removeComments: m["shared.imageOptimizers.optimizerRemoveComments"],
  removeMetadata: m["shared.imageOptimizers.optimizerRemoveMetadata"],
  cleanupIds: m["shared.imageOptimizers.optimizerCleanupIds"],
  convertColors: m["shared.imageOptimizers.optimizerConvertColors"],
  removeDimensions: m["shared.imageOptimizers.optimizerRemoveDimensions"],
  inlineStyles: m["shared.imageOptimizers.optimizerInlineStyles"],
} as const;

const errorMessages = {
  invalid_input: m["shared.imageOptimizers.optimizererrorInvalidInput"],
  invalid_options: m["shared.imageOptimizers.optimizererrorInvalidOptions"],
  input_limit: m["shared.imageOptimizers.optimizererrorInputLimit"],
  output_limit: m["shared.imageOptimizers.optimizererrorOutputLimit"],
  pixel_limit: m["shared.imageOptimizers.optimizererrorPixelLimit"],
  unsupported: m["shared.imageOptimizers.optimizererrorUnsupported"],
  timeout: m["shared.imageOptimizers.optimizererrorTimeout"],
  busy: m["shared.imageOptimizers.optimizererrorBusy"],
  artifact_required: m["shared.imageOptimizers.optimizererrorArtifactRequired"],
  optimize_failed: m["shared.imageOptimizers.optimizererrorOptimizeFailed"],
} as const;

const sample =
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><metadata>ToolTab sample</metadata><!-- Optional editor note --><g id="art"><rect x="20" y="20" width="200" height="120" rx="20" fill="#2563eb"/><circle cx="120" cy="80" r="35" fill="#ffffff"/></g></svg>';
function Highlighted({ value }: { value: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js in the local worker escapes the entire source and emits only highlight spans.
  return <span dangerouslySetInnerHTML={{ __html: value }} />;
}
function ImageOptimizer({ kind }: { kind: "png" | "svg" }) {
  const locale = getLocale(),
    id = useId(),
    [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState(""),
    [png, setPng] = useState<PngOptions>({ ...pngDefaults }),
    [svg, setSvg] = useState<SvgOptions>({ ...svgDefaults }),
    [result, setResult] = useState<Awaited<
      ReturnType<typeof runOptimizerWorker>
    > | null>(null),
    [outputUrl, setOutputUrl] = useState(""),
    [sourceUrl, setSourceUrl] = useState(""),
    [previewUrl, setPreviewUrl] = useState(""),
    [error, setError] = useState<OptimizerCode | null>(null),
    [busy, setBusy] = useState(false);
  const revision = useRef(0),
    controller = useRef<AbortController | null>(null),
    reader = useRef<FileReader | null>(null),
    outputRef = useRef("");
  const invalidate = () => {
    revision.current++;
    controller.current?.abort();
    reader.current?.abort();
    if (outputRef.current) URL.revokeObjectURL(outputRef.current);
    outputRef.current = "";
    setResult(null);
    setOutputUrl("");
    setError(null);
    setBusy(false);
  };
  useEffect(
    () => () => {
      revision.current++;
      controller.current?.abort();
      reader.current?.abort();
      if (outputRef.current) URL.revokeObjectURL(outputRef.current);
    },
    [],
  );
  useEffect(() => {
    let url = "";
    setSourceUrl("");
    if (kind === "png" && file && result) url = URL.createObjectURL(file);
    else if (source) {
      try {
        url = URL.createObjectURL(
          new Blob([validateSvg(source, browserXml).source], {
            type: "image/svg+xml",
          }),
        );
      } catch {
        /* Code remains available; never render unvalidated SVG. */
      }
    }
    setSourceUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [source, file, kind, result]);
  useEffect(() => {
    let url = "";
    setPreviewUrl("");
    if (result) {
      if (kind === "png")
        url = URL.createObjectURL(
          new Blob([result.bytes], { type: "image/png" }),
        );
      else {
        try {
          url = URL.createObjectURL(
            new Blob(
              [
                validateSvg(new TextDecoder().decode(result.bytes), browserXml)
                  .source,
              ],
              { type: "image/svg+xml" },
            ),
          );
        } catch {
          /* Optimization is not a sanitizer. */
        }
      }
    }
    setPreviewUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [result, kind]);
  const read = (f: File) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      reader.current = r;
      const cleanup = () => {
        r.onload = null;
        r.onerror = null;
        r.onabort = null;
        if (reader.current === r) reader.current = null;
      };
      r.onload = () => {
        cleanup();
        if (r.result instanceof ArrayBuffer) resolve(r.result);
        else reject(new OptimizerError("invalid_input"));
      };
      r.onerror = () => {
        cleanup();
        reject(new OptimizerError("invalid_input"));
      };
      r.onabort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      try {
        r.readAsArrayBuffer(f);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  const choose = async (files: File[]) => {
    invalidate();
    if (files.length !== 1) {
      setError("invalid_input");
      return;
    }
    const f = files[0];
    if (f.size > (kind === "png" ? PNG_INPUT_LIMIT : SVG_INPUT_LIMIT)) {
      setError("input_limit");
      return;
    }
    setFile(f);
    if (kind === "svg") {
      setSource("");
      const rev = revision.current;
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          await read(f),
        );
        if (revision.current === rev) setSource(text);
      } catch {
        if (revision.current === rev) setError("invalid_input");
      }
    }
  };
  const run = async () => {
    invalidate();
    const rev = revision.current,
      ctrl = new AbortController();
    controller.current = ctrl;
    setBusy(true);
    try {
      const job =
        kind === "png"
          ? {
              kind,
              bytes: new Uint8Array(
                await read(file ?? new File([], "empty.png")),
              ),
              options: png,
            }
          : { kind, input: source, options: svg };
      ctrl.signal.throwIfAborted();
      const out = await runOptimizerWorker(job, ctrl.signal);
      if (revision.current !== rev) return;
      const url = URL.createObjectURL(
        new Blob([out.bytes], {
          type: kind === "png" ? "image/png" : "image/svg+xml",
        }),
      );
      outputRef.current = url;
      setOutputUrl(url);
      setResult(out);
    } catch (e) {
      if (revision.current === rev && !ctrl.signal.aborted)
        setError(e instanceof OptimizerError ? e.code : "optimize_failed");
    } finally {
      if (revision.current === rev) setBusy(false);
    }
  };
  const fileField = (
    <ToolFilePicker
      label={m["tools.svgOptimizer.choose"]()}
      accept={
        kind === "png" ? ["image/png", ".png"] : ["image/svg+xml", ".svg"]
      }
      fileName={
        file ? `${file.name} · ${formatFileSize(file.size, locale)}` : undefined
      }
      onSelect={(selected) => void choose([selected])}
      onClear={
        file
          ? () => {
              invalidate();
              setFile(null);
              if (kind === "svg") setSource("");
            }
          : undefined
      }
    />
  );
  const aggressiveSvg = {
    ...svgDefaults,
    inlineStyles: true,
    removeDimensions: true,
  };
  const svgPreset =
    kind === "svg"
      ? Object.keys(svgDefaults).every(
          (key) =>
            svg[key as keyof SvgOptions] ===
            svgDefaults[key as keyof SvgOptions],
        )
        ? "safe"
        : Object.keys(aggressiveSvg).every(
              (key) =>
                svg[key as keyof SvgOptions] ===
                aggressiveSvg[key as keyof SvgOptions],
            )
          ? "aggressive"
          : null
      : null;
  return (
    <div
      className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]"
      data-tool-panels
    >
      <ToolPanelCard
        className="xl:col-start-2 xl:row-start-1"
        aria-label={m["tools.svgOptimizer.source"]()}
        onDragOver={(event: DragEvent<HTMLDivElement>) =>
          event.preventDefault()
        }
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          void choose(Array.from(event.dataTransfer.files));
        }}
      >
        <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Card.Title>{m["tools.svgOptimizer.source"]()}</Card.Title>
            <Card.Description>
              {m["shared.imageOptimizers.optimizersvgdescription"]()}
            </Card.Description>
          </div>
          {kind === "svg" ? (
            <ToolPanelActionGroup className="shrink-0 sm:justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  invalidate();
                  setSource(sample);
                }}
              >
                {m["tools.svgOptimizer.sample"]()}
              </Button>
              <Button
                variant="ghost"
                isDisabled={!file && !source}
                onClick={() => {
                  invalidate();
                  setFile(null);
                  setSource("");
                }}
              >
                <X aria-hidden className="size-4" />
                {m["tools.svgOptimizer.clear"]()}
              </Button>
            </ToolPanelActionGroup>
          ) : null}
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          {kind === "svg" ? (
            <div className="grid gap-4">
              {fileField}
              <TextField fullWidth>
                <Label htmlFor={`${id}-source`}>
                  {m["tools.svgOptimizer.code"]()}
                </Label>
                <TextArea
                  id={`${id}-source`}
                  value={source}
                  onChange={(e) => {
                    invalidate();
                    setFile(null);
                    setSource(e.target.value);
                  }}
                  className="min-h-48 w-full resize-y font-mono"
                />
              </TextField>
            </div>
          ) : (
            fileField
          )}
          {sourceUrl ? (
            <img
              src={sourceUrl}
              alt={m["tools.svgOptimizer.source"]()}
              className="max-h-56 w-full rounded-xl border object-contain"
            />
          ) : kind === "svg" && source ? (
            <p className="text-sm text-muted-foreground">
              {m["tools.svgOptimizer.previewunavailable"]()}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessages[error]({})}
            </p>
          ) : null}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolPanelCard className="xl:sticky xl:top-6 xl:col-start-1 xl:row-span-2 xl:row-start-1">
        <Card.Header className="border-b border-separator">
          <div className="min-w-0">
            <Card.Title>{m["tools.svgOptimizer.options"]()}</Card.Title>
            <Card.Description>
              {kind === "svg"
                ? m["tools.svgOptimizer.svgnote"]()
                : m["tools.svgOptimizer.pngnote"]()}
            </Card.Description>
          </div>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          {kind === "png" ? (
            <>
              <div>
                <Select
                  variant="secondary"
                  selectedKey={String(png.level)}
                  onSelectionChange={(v) => {
                    invalidate();
                    setPng({ ...png, level: Number(v) });
                  }}
                >
                  <Label>{m["tools.svgOptimizer.level"]()}</Label>
                  <Select.Trigger id={`${id}-level`}>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {[0, 1, 2, 3, 4, 5, 6].map((level) => (
                        <ListBox.Item
                          key={level}
                          id={String(level)}
                          textValue={new Intl.NumberFormat(locale).format(
                            level,
                          )}
                        >
                          {new Intl.NumberFormat(locale).format(level)}
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
              {(["interlace", "optimiseAlpha"] as const).map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <Switch
                    isSelected={png[key]}
                    onChange={(v) => {
                      invalidate();
                      setPng({ ...png, [key]: v === true });
                    }}
                  >
                    <Switch.Content className="text-sm">
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <span>
                        {(key === "interlace"
                          ? m["shared.imageOptimizers.optimizerinterlace"]
                          : m["shared.imageOptimizers.optimizeralpha"])({})}
                      </span>
                    </Switch.Content>
                  </Switch>
                </div>
              ))}
            </>
          ) : (
            <>
              <ToggleButtonGroup
                aria-label={m["tools.svgOptimizer.options"]()}
                selectionMode="single"
                selectedKeys={svgPreset ? new Set([svgPreset]) : new Set()}
                className="grid grid-cols-2"
                onSelectionChange={(selection) => {
                  const value = String([...selection][0] ?? "");
                  if (value === "safe") {
                    invalidate();
                    setSvg({ ...svgDefaults });
                  } else if (value === "aggressive") {
                    invalidate();
                    setSvg({
                      ...svgDefaults,
                      inlineStyles: true,
                      removeDimensions: true,
                    });
                  }
                }}
              >
                <ToggleButton id="safe" className="h-10 w-full">
                  {m["tools.svgOptimizer.safe"]()}
                </ToggleButton>
                <ToggleButton id="aggressive" className="h-10 w-full">
                  {m["tools.svgOptimizer.aggressive"]()}
                </ToggleButton>
              </ToggleButtonGroup>
              {/* Keep the detailed switches below so a manual change clears the preset selection. */}
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-1">
                {(Object.keys(svgDefaults) as (keyof SvgOptions)[]).map(
                  (key) => (
                    <div key={key} className="flex min-h-8 items-center">
                      <Switch
                        isSelected={svg[key]}
                        onChange={(v) => {
                          invalidate();
                          setSvg({ ...svg, [key]: v === true });
                        }}
                      >
                        <Switch.Content className="text-sm">
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                          <span>{optionMessages[key]({})}</span>
                        </Switch.Content>
                      </Switch>
                    </div>
                  ),
                )}
              </div>
            </>
          )}
        </ToolPanelCardContent>
        <ToolPanelCardFooter className="justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              invalidate();
              if (kind === "svg") setSvg({ ...svgDefaults });
              else setPng({ ...pngDefaults });
            }}
          >
            <RotateCcw aria-hidden className="size-4" />
            {m["tools.svgOptimizer.reset"]()}
          </Button>
          <ToolPanelActionGroup className="justify-end">
            <Button
              isDisabled={busy || (kind === "png" ? !file : !source.trim())}
              onClick={() => void run()}
            >
              <Sparkles aria-hidden className="size-4" />
              {(busy
                ? m["shared.imageOptimizers.optimizerrunning"]
                : m["shared.imageOptimizers.optimizerrun"])({})}
            </Button>
            {busy && (
              <Button variant="outline" onClick={invalidate}>
                {m["common.actions.cancel"]()}
              </Button>
            )}
          </ToolPanelActionGroup>
        </ToolPanelCardFooter>
      </ToolPanelCard>
      <ToolPanelCard className="xl:col-start-2">
        <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <Card.Title>{m["tools.svgOptimizer.result"]()}</Card.Title>
          {result ? (
            <Link
              href={outputUrl}
              download={optimizedName(file?.name ?? "image", kind)}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Download aria-hidden className="size-4" />
              {m["tools.svgOptimizer.download"]()}
            </Link>
          ) : null}
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          {!result ? (
            <div
              role="status"
              className="flex min-h-44 items-center justify-center text-center text-sm text-muted-foreground"
            >
              {m["tools.svgOptimizer.empty"]()}
            </div>
          ) : (
            <>
              <p className="text-sm">
                {formatFileSize(result.originalBytes, locale)} →{" "}
                {formatFileSize(result.optimizedBytes, locale)} ·{" "}
                {result.savedBytes > 0
                  ? `${m["tools.svgOptimizer.saved"]()} ${new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(result.savedPercent / 100)}`
                  : m["tools.svgOptimizer.noreduction"]()}
              </p>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={m["tools.svgOptimizer.result"]()}
                  className="max-h-64 w-full rounded-xl border object-contain"
                />
              ) : kind === "svg" ? (
                <p className="text-sm text-muted-foreground">
                  {m["tools.svgOptimizer.previewunavailable"]()}
                </p>
              ) : null}
              {kind === "png" ? (
                <div className="space-y-2 text-sm">
                  <p>
                    {m["tools.svgOptimizer.properties"]()}: {result.width} ×{" "}
                    {result.height} · {m["tools.svgOptimizer.depth"]()}{" "}
                    {result.bitDepth} · {m["tools.svgOptimizer.animated"]()}{" "}
                    {(result.animated
                      ? m["shared.imageOptimizers.optimizeryes"]
                      : m["shared.imageOptimizers.optimizerno"])({})}{" "}
                    · {m["tools.svgOptimizer.interlaced"]()}{" "}
                    {(result.interlaced
                      ? m["shared.imageOptimizers.optimizeryes"]
                      : m["shared.imageOptimizers.optimizerno"])({})}
                  </p>
                  <p>
                    {m["tools.svgOptimizer.removed"]()}:{" "}
                    {result.chunksRemoved?.join(", ") ||
                      m["tools.svgOptimizer.none"]()}
                  </p>
                  <p>
                    {m["tools.svgOptimizer.changed"]()}:{" "}
                    {result.chunksChanged?.join(", ") ||
                      m["tools.svgOptimizer.none"]()}
                  </p>
                </div>
              ) : (
                <>
                  <CodeBlock
                    code={new TextDecoder().decode(result.bytes)}
                    title={m["tools.svgOptimizer.outputcode"]()}
                    language="SVG"
                    copyLabel={m["tools.svgOptimizer.copy"]()}
                    codeClassName="[&_.hljs-name]:text-primary [&_.hljs-string]:text-chart-2 [&_.hljs-attr]:text-chart-3 [&_.hljs-comment]:text-muted-foreground"
                  >
                    {result.highlighted ? (
                      <Highlighted value={result.highlighted} />
                    ) : (
                      new TextDecoder().decode(result.bytes.subarray(0, 65536))
                    )}
                  </CodeBlock>
                  <p className="text-xs text-muted-foreground">
                    {m["tools.svgOptimizer.previewlimit"]()}
                  </p>
                </>
              )}
            </>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>
      <p className="text-xs text-muted-foreground xl:col-start-2">
        {m["tools.svgOptimizer.limits"]()}
      </p>
    </div>
  );
}

function SvgOptimizerContent() {
  return <ImageOptimizer kind="svg" />;
}

export function SvgOptimizer() {
  return (
    <ToolPage>
      <SvgOptimizerContent />
    </ToolPage>
  );
}
