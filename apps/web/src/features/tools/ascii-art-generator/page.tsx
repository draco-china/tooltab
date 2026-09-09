import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Autocomplete,
  Button,
  Card,
  Input,
  Label,
  ListBox,
  SearchField,
  Select,
  Skeleton,
  TextArea,
  useFilter,
} from "@heroui/react";
import { ChevronDown, Download, FileText, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { asciiFontNames } from "./font-loader";
import {
  ASCII_INPUT_LIMIT,
  ASCII_MAX_WIDTH,
  ASCII_MIN_WIDTH,
  AsciiError,
  type AsciiOptions,
  type AsciiResult,
} from "@workspace/tools/text/ascii";
import { runAsciiWorker } from "./worker-client";

const STORAGE_KEY = "tooltab:ascii-art-generator:v1";
const defaults: AsciiOptions = {
  text: "Hello",
  font: "Standard",
  align: "left",
  width: 100,
};
const sample = "Launch notes\nship today";

function PanelHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <Card.Title>{title}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </div>
      {actions ? (
        <ToolPanelActionGroup className="shrink-0 sm:justify-end">
          {actions}
        </ToolPanelActionGroup>
      ) : null}
    </Card.Header>
  );
}

function AsciiArtGeneratorContent() {
  const id = useId();
  const [options, setOptions] = useState(defaults);
  const [result, setResult] = useState<AsciiResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const { contains } = useFilter({ sensitivity: "base" });
  const task = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const downloadUrl = useRef("");

  const invalidate = useCallback(() => {
    revision.current += 1;
    task.current?.abort();
    task.current = null;
    setBusy(false);
    setResult(null);
    setError("");
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        if (raw.length > ASCII_INPUT_LIMIT * 2) throw new Error();
        const value = JSON.parse(raw) as Partial<AsciiOptions>;
        if (
          typeof value.text === "string" &&
          typeof value.font === "string" &&
          asciiFontNames.includes(value.font) &&
          ["left", "center", "right"].includes(value.align ?? "") &&
          Number.isInteger(value.width) &&
          Number(value.width) >= ASCII_MIN_WIDTH &&
          Number(value.width) <= ASCII_MAX_WIDTH
        ) {
          setOptions(value as AsciiOptions);
        }
      }
    } catch {
      setStorageError(true);
    }

    return () => {
      revision.current += 1;
      task.current?.abort();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch {
      setStorageError(true);
    }
  }, [options]);

  useEffect(() => {
    invalidate();
    if (!options.text.trim()) return;
    const current = revision.current;
    const timer = window.setTimeout(async () => {
      const controller = new AbortController();
      task.current = controller;
      setBusy(true);
      try {
        const next = await runAsciiWorker(options, controller.signal);
        if (current === revision.current) setResult(next);
      } catch (cause) {
        if (current === revision.current && !controller.signal.aborted) {
          setError(cause instanceof AsciiError ? cause.code : "invalid_input");
        }
      } finally {
        if (current === revision.current) {
          task.current = null;
          setBusy(false);
        }
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [options, invalidate]);

  const update = <K extends keyof AsciiOptions>(
    key: K,
    value: AsciiOptions[K],
  ) => setOptions((current) => ({ ...current, [key]: value }));

  function download() {
    if (!result) return;
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = URL.createObjectURL(
      new Blob([result.output], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = downloadUrl.current;
    link.download = result.filename;
    link.click();
  }

  const message = error ? errorMessages[error]?.() : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ToolPanelCard>
          <PanelHeader
            title={m["common.caseInput"]()}
            description={m["shared.asciiArt.inputHint"]()}
            actions={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => update("text", sample)}
                >
                  <FileText aria-hidden className="size-4" />
                  {m["shared.textAnalysis.example"]()}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => update("text", "")}
                >
                  <RefreshCcw aria-hidden className="size-4" />
                  {m["shared.asciiArt.clear"]()}
                </Button>
              </>
            }
          />
          <ToolPanelCardContent className="py-4">
            <TextArea
              id={`${id}-input`}
              aria-label={m["common.caseInput"]()}
              value={options.text}
              maxLength={ASCII_INPUT_LIMIT}
              rows={12}
              className="min-h-72 resize-y font-mono text-sm"
              placeholder={m["shared.asciiArt.placeholder"]()}
              onChange={(event) => update("text", event.currentTarget.value)}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <div className="flex flex-col gap-6">
          <ToolPanelCard>
            <PanelHeader
              title={m["shared.pdfEditing.font"]()}
              description={m["shared.asciiArt.fontHint"]()}
            />
            <ToolPanelCardContent className="py-4">
              <Autocomplete
                id={`${id}-font`}
                name="font"
                variant="secondary"
                aria-label={m["shared.pdfEditing.font"]()}
                selectedKey={options.font}
                onSelectionChange={(selectionKey) => {
                  if (selectionKey != null)
                    update("font", String(selectionKey));
                }}
                fullWidth
              >
                <Autocomplete.Trigger className="min-h-11">
                  <Autocomplete.Value />
                  <Autocomplete.Indicator>
                    <ChevronDown aria-hidden />
                  </Autocomplete.Indicator>
                </Autocomplete.Trigger>
                <Autocomplete.Popover className="max-h-80">
                  <Autocomplete.Filter filter={contains}>
                    <SearchField aria-label={m["shared.pdfEditing.font"]()}>
                      <SearchField.Group>
                        <SearchField.SearchIcon />
                        <SearchField.Input
                          placeholder={m["shared.pdfEditing.font"]()}
                        />
                      </SearchField.Group>
                    </SearchField>
                    <ListBox className="max-h-64 overflow-y-auto">
                      {asciiFontNames.map((font) => (
                        <ListBox.Item key={font} id={font} textValue={font}>
                          {font}
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Autocomplete.Filter>
                </Autocomplete.Popover>
              </Autocomplete>
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <PanelHeader
              title={m["shared.asciiArt.options"]()}
              description={m["shared.asciiArt.optionsHint"]()}
            />
            <ToolPanelCardContent className="gap-4 py-4">
              <Select
                variant="secondary"
                aria-label={m["shared.asciiArt.alignment"]()}
                selectedKey={options.align}
                onSelectionChange={(selectionKey) =>
                  update("align", String(selectionKey) as AsciiOptions["align"])
                }
                fullWidth
              >
                <Label>{m["shared.asciiArt.alignment"]()}</Label>
                <Select.Trigger className="min-h-11">
                  <Select.Value />
                  <Select.Indicator>
                    <ChevronDown aria-hidden />
                  </Select.Indicator>
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {(["left", "center", "right"] as const).map((align) => (
                      <ListBox.Item
                        key={align}
                        id={align}
                        textValue={alignmentMessages[align]()}
                      >
                        {alignmentMessages[align]()}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-width`}>{m["common.width"]()}</Label>
                <Input
                  id={`${id}-width`}
                  aria-label={m["common.width"]()}
                  type="number"
                  inputMode="numeric"
                  min={ASCII_MIN_WIDTH}
                  max={ASCII_MAX_WIDTH}
                  value={options.width}
                  onChange={(event) =>
                    update(
                      "width",
                      Math.min(
                        ASCII_MAX_WIDTH,
                        Math.max(
                          ASCII_MIN_WIDTH,
                          event.currentTarget.valueAsNumber || ASCII_MIN_WIDTH,
                        ),
                      ),
                    )
                  }
                />
                <p className="text-sm text-muted">
                  {m["shared.asciiArt.widthHint"]()}
                </p>
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>
      </div>

      <ToolPanelCard>
        <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Card.Title>{m["shared.asciiArt.output"]()}</Card.Title>
            <Card.Description>{m["shared.asciiArt.empty"]()}</Card.Description>
          </div>
          <ToolPanelActionGroup className="shrink-0 sm:justify-end">
            <ToolCopyButton
              value={result?.output ?? ""}
              copyLabel={m["common.actions.copy"]()}
              copiedLabel={m["common.actions.copied"]()}
              disabled={!result}
            />
            <Button size="sm" isDisabled={!result} onPress={download}>
              <Download aria-hidden className="size-4" />
              {m["shared.asciiArt.download"]()}
            </Button>
          </ToolPanelActionGroup>
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          {busy ? (
            <section
              className="grid min-h-80 content-start gap-3"
              aria-label={m["shared.asciiArt.output"]()}
              aria-busy="true"
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </section>
          ) : (
            <section aria-label={m["shared.asciiArt.output"]()}>
              <pre
                className={`min-h-80 w-full overflow-x-auto rounded-lg border border-border bg-transparent p-3 font-mono text-sm leading-tight ${
                  result ? "text-foreground" : "text-muted"
                }`}
              >
                {result?.output ?? m["shared.asciiArt.empty"]()}
              </pre>
            </section>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>

      {storageError ? (
        <p role="status" className="text-sm text-warning">
          {m["shared.asciiArt.storageError"]()}
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}

      <ToolArticle>
        <h2>{m["shared.asciiArt.article.whatTitle"]()}</h2>
        <p>{m["shared.asciiArt.article.what"]()}</p>
        <h2>{m["shared.asciiArt.article.whereTitle"]()}</h2>
        <ul>
          <li>{m["shared.asciiArt.article.whereOne"]()}</li>
          <li>{m["shared.asciiArt.article.whereTwo"]()}</li>
          <li>{m["shared.asciiArt.article.whereThree"]()}</li>
        </ul>
        <h2>{m["shared.asciiArt.article.howTitle"]()}</h2>
        <p>{m["shared.asciiArt.article.how"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function AsciiArtGenerator() {
  return (
    <ToolPage>
      <AsciiArtGeneratorContent />
    </ToolPage>
  );
}

const errorMessages: Record<string, (() => string) | undefined> = {
  invalid_input: m["shared.asciiArt.invalidInput"],
  too_many_lines: m["shared.asciiArt.tooManyLines"],
  font_not_found: m["shared.asciiArt.fontNotFound"],
  output_too_large: m["shared.asciiArt.outputTooLarge"],
  artifact_required: m["shared.asciiArt.artifactRequired"],
  busy: m["shared.asciiArt.busy"],
  timeout: m["shared.asciiArt.timeout"],
  unsupported: m["shared.asciiArt.unsupported"],
};
const alignmentMessages = {
  left: m["shared.asciiArt.left"],
  center: m["tools.asciiArtGenerator.barcodecenter"],
  right: m["shared.asciiArt.right"],
};
