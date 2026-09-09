import { LOREM_LABELS } from "@/features/tools/text-utilities/lorem";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Download, RefreshCcw } from "lucide-react";
import { startTransition, useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { LOREM_LOCALES, type LoremLocale } from "@workspace/tools/text/lorem";
import { TextUtilityError } from "@workspace/tools/text/shared";
import { runUtilityWorker } from "../text-utilities/worker-client";

const errorMessages = {
  invalid_input: m["common.utilityerrorInvalidInput"],
  invalid_options: m["shared.textUtilities.utilityerrorInvalidOptions"],
  invalid_morse: m["shared.textUtilities.utilityerrorInvalidMorse"],
  too_large: m["shared.textUtilities.utilityerrorTooLarge"],
  audio_too_long: m["shared.textUtilities.utilityerrorAudioTooLong"],
  unsupported: m["shared.textUtilities.utilityerrorUnsupported"],
  timeout: m["shared.textUtilities.utilityerrorTimeout"],
  busy: m["shared.textUtilities.utilityerrorBusy"],
  read_failed: m["shared.textUtilities.utilityerrorReadFailed"],
  artifact_required: m["shared.textUtilities.utilityerrorArtifactRequired"],
} as const;

type LoremMode = "words" | "sentences" | "paragraphs";

const MIN_COUNT = 1;
const MAX_COUNT = 100;
const DEFAULT_COUNT = 3;
const STORAGE_KEYS = {
  mode: "tools:lorem-ipsum-generator:mode",
  count: "tools:lorem-ipsum-generator:count",
  locale: "tools:lorem-ipsum-generator:locale",
} as const;

function LoremIpsumToolContent() {
  const countId = useId();
  const localeId = useId();
  const modeLabelId = useId();
  const [mode, setMode] = useState<LoremMode>("paragraphs");
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [locale, setLocale] = useState<LoremLocale>("en");
  const [generationVersion, setGenerationVersion] = useState(0);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState("");

  useEffect(() => {
    try {
      const storedMode = localStorage.getItem(STORAGE_KEYS.mode);
      const storedCount = Number(localStorage.getItem(STORAGE_KEYS.count));
      const storedLocale = localStorage.getItem(STORAGE_KEYS.locale);
      if (isLoremMode(storedMode)) setMode(storedMode);
      if (Number.isFinite(storedCount) && storedCount > 0) {
        setCount(normalizeCount(storedCount));
      }
      if (isLoremLocale(storedLocale)) setLocale(storedLocale);
    } catch {
      // Preferences are optional; generation works without browser storage.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.mode, mode);
      localStorage.setItem(STORAGE_KEYS.count, String(count));
      localStorage.setItem(STORAGE_KEYS.locale, locale);
    } catch {
      // Preferences are optional; generation works without browser storage.
    }
  }, [count, locale, mode]);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setIsGenerating(true);
    setError("");
    void runUtilityWorker(
      { kind: "lorem", mode, count, locale, seed: generationVersion + 1 },
      controller.signal,
    )
      .then((output) => {
        if (!current || controller.signal.aborted || output.kind !== "lorem")
          return;
        startTransition(() => setOutput(output.output));
      })
      .catch((caught) => {
        if (!current || controller.signal.aborted) return;
        setError(utilityError(caught));
      })
      .finally(() => {
        if (current && !controller.signal.aborted) setIsGenerating(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [count, generationVersion, locale, mode]);

  useEffect(() => {
    if (!output) {
      setDownloadUrl("");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
    );
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [output]);
  const filename = `lorem-ipsum-${mode}-${count}-${locale}.txt`;

  return (
    <div className="grid gap-8">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.aesTools.encryptoptionscardtitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.loremIpsumGenerator.optionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <div className="grid gap-2">
              <Label id={modeLabelId} className="sr-only">
                {m["shared.aesTools.encryptoptionscardtitle"]()}
              </Label>
              <ToggleButtonGroup
                aria-labelledby={modeLabelId}
                selectionMode="single"
                selectedKeys={new Set([mode])}
                isDetached
                className="grid w-full grid-cols-3"
                onSelectionChange={(keys) => {
                  const selected = String([...keys][0] ?? "");
                  if (isLoremMode(selected)) setMode(selected);
                }}
              >
                {(
                  [
                    ["words", m["tools.loremIpsumGenerator.wordsLabel"]()],
                    [
                      "sentences",
                      m[
                        "tools.unicodeInvisibleCharacterChecker.utilitysentences"
                      ](),
                    ],
                    ["paragraphs", m["tools.textStatistics.paragraphs"]()],
                  ] as const
                ).map(([value, label]) => (
                  <ToggleButton key={value} id={value} className="min-h-11">
                    {label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                variant="secondary"
                aria-label={m["tools.loremIpsumGenerator.localeLabel"]()}
                selectedKey={locale}
                onSelectionChange={(key) => {
                  const value = String(key ?? "");
                  if (isLoremLocale(value)) setLocale(value);
                }}
              >
                <Label>{m["tools.loremIpsumGenerator.localeLabel"]()}</Label>
                <Select.Trigger
                  id={localeId}
                  className="bg-field-background min-h-11 border border-border"
                >
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {LOREM_LOCALES.map((value) => (
                      <ListBox.Item
                        key={value}
                        id={value}
                        textValue={LOREM_LABELS[value]}
                      >
                        {LOREM_LABELS[value]}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              <div className="grid gap-2">
                <Label htmlFor={countId}>
                  {m["tools.cuid2Generator.countLabel"]()}
                </Label>
                <Input
                  id={countId}
                  type="number"
                  inputMode="numeric"
                  min={MIN_COUNT}
                  max={MAX_COUNT}
                  value={String(count)}
                  className="bg-field-background min-h-11 rounded-xl border border-border"
                  onChange={(event) =>
                    setCount(normalizeCount(Number(event.currentTarget.value)))
                  }
                />
              </div>
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
              <Card.Description>
                {m["tools.loremIpsumGenerator.resultsDescription"]()}
              </Card.Description>
            </div>
            <ToolPanelActionGroup className="shrink-0 sm:justify-end">
              <ToolCopyButton
                value={output}
                copyLabel={m["common.actions.copyResult"]()}
                copiedLabel={m["common.actions.copied"]()}
                variant="ghost"
                disabled={!output || isGenerating}
              />
              {downloadUrl && !isGenerating ? (
                <a
                  href={downloadUrl}
                  download={filename}
                  className={buttonVariants({ size: "sm", variant: "ghost" })}
                >
                  <Download aria-hidden className="size-4" />
                  {m["common.actions.download"]()}
                </a>
              ) : (
                <Button type="button" variant="ghost" size="sm" isDisabled>
                  <Download aria-hidden className="size-4" />
                  {m["common.actions.download"]()}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={() => setGenerationVersion((current) => current + 1)}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.ksuidRegenerate"]()}
              </Button>
            </ToolPanelActionGroup>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextArea
              aria-label={m["common.passresultstitle"]()}
              value={output}
              readOnly
              rows={12}
              placeholder={m["tools.loremIpsumGenerator.resultsPlaceholder"]()}
              aria-busy={isGenerating}
              className="bg-field-background max-h-[min(32rem,60vh)] min-h-80 resize-y overflow-y-auto rounded-xl border border-border text-sm leading-6"
            />
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <LoremArticle />
    </div>
  );
}

function LoremArticle() {
  return (
    <ToolArticle>
      <p>{m["tools.loremIpsumGenerator.articleIntro"]()}</p>
      <h2>{m["tools.loremIpsumGenerator.articleShapeTitle"]()}</h2>
      <p>{m["tools.loremIpsumGenerator.articleShapeBody"]()}</p>
      <h2>{m["tools.loremIpsumGenerator.articleLocaleTitle"]()}</h2>
      <p>{m["tools.loremIpsumGenerator.articleLocaleBody"]()}</p>
      <h2>{m["tools.loremIpsumGenerator.articleCopyTitle"]()}</h2>
      <p>{m["tools.loremIpsumGenerator.articleCopyBody"]()}</p>
    </ToolArticle>
  );
}

function normalizeCount(value: number) {
  if (!Number.isFinite(value)) return MIN_COUNT;
  return Math.min(Math.max(Math.floor(value), MIN_COUNT), MAX_COUNT);
}

function isLoremMode(value: unknown): value is LoremMode {
  return value === "words" || value === "sentences" || value === "paragraphs";
}

function isLoremLocale(value: unknown): value is LoremLocale {
  return (
    typeof value === "string" && LOREM_LOCALES.includes(value as LoremLocale)
  );
}

function utilityError(error: unknown) {
  const code = error instanceof TextUtilityError ? error.code : "invalid_input";
  const message = errorMessages[code];
  return typeof message === "function"
    ? (message as unknown as (inputs: Record<string, never>) => string)({})
    : m["common.utilityerrorInvalidInput"]();
}

export default function LoremIpsumTool() {
  return (
    <ToolPage>
      <LoremIpsumToolContent />
    </ToolPage>
  );
}
