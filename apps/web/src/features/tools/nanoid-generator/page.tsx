import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
} from "@heroui/react";
import { Download, RefreshCcw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  alphabetMetrics,
  generateShortIds,
  NANO_ALPHABETS,
  type NanoPreset,
} from "@workspace/tools/id/nanoid";

const DEFAULT_COUNT = 5;
const DEFAULT_LENGTH = 21;
const MAX_COUNT = 100;
const MAX_LENGTH = 128;
const DEBOUNCE_MS = 150;
const STORAGE_KEYS = {
  count: "tools:nanoid-generator:count",
  length: "tools:nanoid-generator:length",
  preset: "tools:nanoid-generator:alphabet-preset",
  customAlphabet: "tools:nanoid-generator:custom-alphabet",
} as const;
const PRESETS = [
  "url-safe",
  "alphanumeric",
  "lowercase",
  "uppercase",
  "numbers",
  "hex-lowercase",
  "hex-uppercase",
  "custom",
] as const satisfies readonly NanoPreset[];

const PRESET_LABELS = {
  "url-safe": m["tools.nanoidGenerator.presetUrlSafe"],
  alphanumeric: m["tools.nanoidGenerator.presetAlphanumeric"],
  lowercase: m["tools.nanoidGenerator.presetLowercase"],
  uppercase: m["tools.nanoidGenerator.presetUppercase"],
  numbers: m["tools.nanoidGenerator.presetNumbers"],
  "hex-lowercase": m["tools.nanoidGenerator.presetHexLowercase"],
  "hex-uppercase": m["tools.nanoidGenerator.presetHexUppercase"],
  custom: m["shared.shortId.custom"],
} as const satisfies Record<NanoPreset, () => string>;

function normalizeCount(value: number) {
  if (Number.isNaN(value)) return 1;
  return Math.min(Math.max(Math.floor(value), 1), MAX_COUNT);
}

function normalizeLength(value: number) {
  if (Number.isNaN(value)) return DEFAULT_LENGTH;
  return Math.min(Math.max(Math.floor(value), 1), MAX_LENGTH);
}

function isNanoPreset(value: string): value is NanoPreset {
  return PRESETS.includes(value as NanoPreset);
}

function NanoidGeneratorPageContent() {
  const ids = { count: useId(), length: useId(), alphabet: useId() };
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [length, setLength] = useState(DEFAULT_LENGTH);
  const [preset, setPreset] = useState<NanoPreset>("url-safe");
  const [customAlphabet, setCustomAlphabet] = useState<string>(
    NANO_ALPHABETS["url-safe"],
  );
  const [version, setVersion] = useState(0);
  const [output, setOutput] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    const storedCount = safeLocalStorage.getItem(STORAGE_KEYS.count);
    const storedLength = safeLocalStorage.getItem(STORAGE_KEYS.length);
    const storedPreset = safeLocalStorage.getItem(STORAGE_KEYS.preset);
    const storedCustomAlphabet = safeLocalStorage.getItem(
      STORAGE_KEYS.customAlphabet,
    );

    if (storedCount !== null && Number.isFinite(Number(storedCount))) {
      setCount(normalizeCount(Number(storedCount)));
    }
    if (storedLength !== null && Number.isFinite(Number(storedLength))) {
      setLength(normalizeLength(Number(storedLength)));
    }
    if (storedPreset && isNanoPreset(storedPreset)) {
      setPreset(storedPreset);
    }
    if (storedCustomAlphabet) {
      setCustomAlphabet(storedCustomAlphabet);
    }
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.count, String(count));
  }, [count]);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.length, String(length));
  }, [length]);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.preset, preset);
  }, [preset]);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.customAlphabet, customAlphabet);
  }, [customAlphabet]);

  const alphabet =
    preset === "custom" ? customAlphabet : NANO_ALPHABETS[preset];
  const metrics = useMemo(() => alphabetMetrics(alphabet), [alphabet]);
  const alphabetError =
    metrics.unique < 2
      ? m["tools.nanoidGenerator.alphabetTooShort"]()
      : metrics.duplicates.length > 0
        ? m["tools.nanoidGenerator.alphabetDuplicate"]()
        : "";

  // biome-ignore lint/correctness/useExhaustiveDependencies: version deliberately regenerates the same options.
  useEffect(() => {
    const controller = new AbortController();
    setOutput("");
    if (alphabetError) return () => controller.abort();

    const timer = window.setTimeout(() => {
      void generateShortIds(
        "nanoid",
        { count, length, preset, alphabet: customAlphabet },
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) setOutput(result.ids.join("\n"));
        })
        .catch(() => {
          if (!controller.signal.aborted) setOutput("");
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [alphabetError, count, customAlphabet, length, preset, version]);

  useEffect(() => {
    if (!output) {
      setDownloadUrl(null);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
    );
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [output]);

  return (
    <div className="grid gap-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.aesTools.encryptoptionscardtitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.nanoidGenerator.optionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={ids.count}>
                  {m["tools.cuid2Generator.countLabel"]()}
                </Label>
                <Input
                  id={ids.count}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_COUNT}
                  value={String(count)}
                  onChange={(event) =>
                    setCount(normalizeCount(Number(event.target.value)))
                  }
                  className="min-h-11"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={ids.length}>
                  {m["shared.checksumValidators.length"]()}
                </Label>
                <Input
                  id={ids.length}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_LENGTH}
                  value={String(length)}
                  onChange={(event) =>
                    setLength(normalizeLength(Number(event.target.value)))
                  }
                  className="min-h-11"
                />
              </div>
            </div>

            <Select
              variant="secondary"
              selectedKey={preset}
              onSelectionChange={(key) => {
                if (key != null) setPreset(String(key) as NanoPreset);
              }}
            >
              <Label>{m["tools.nanoidGenerator.alphabetPresetLabel"]()}</Label>
              <Select.Trigger className="min-h-11 w-full">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Section>
                    {PRESETS.map((option) => (
                      <ListBox.Item
                        key={option}
                        id={option}
                        textValue={PRESET_LABELS[option]()}
                      >
                        {PRESET_LABELS[option]()}
                      </ListBox.Item>
                    ))}
                  </ListBox.Section>
                </ListBox>
              </Select.Popover>
            </Select>

            {preset === "custom" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor={ids.alphabet}>
                    {m["tools.nanoidGenerator.customAlphabetLabel"]()}
                  </Label>
                  <Input
                    id={ids.alphabet}
                    value={customAlphabet}
                    onChange={(event) => setCustomAlphabet(event.target.value)}
                    placeholder={m[
                      "tools.nanoidGenerator.customAlphabetPlaceholder"
                    ]()}
                    spellCheck={false}
                    className="min-h-11 font-mono text-sm"
                  />
                </div>
                <div className="grid gap-4 rounded-xl border border-dashed border-border bg-default/20 p-4 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
                      {m["tools.nanoidGenerator.alphabetUniqueLabel"]()}
                    </p>
                    <p className="font-mono text-2xl leading-none">
                      {metrics.unique}
                    </p>
                  </div>
                  <div className="grid gap-1">
                    <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
                      {m["tools.nanoidGenerator.alphabetDuplicatesLabel"]()}
                    </p>
                    <p className="font-mono text-sm leading-6 break-all">
                      {metrics.duplicates.length
                        ? metrics.duplicates.join(" ")
                        : m["tools.sqlFormatterAndLinter.fmtnone"]()}
                    </p>
                  </div>
                </div>
              </>
            ) : null}

            {alphabetError ? (
              <Alert status="danger">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>{alphabetError}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
              <Card.Description>
                {m["tools.nanoidGenerator.resultsDescription"]()}
              </Card.Description>
            </div>
            <ToolPanelActionGroup className="shrink-0 sm:justify-end">
              <ToolCopyButton
                value={output}
                copyLabel={m["tools.nanoidGenerator.copyResultsLabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                variant="ghost"
                disabled={!output}
              />
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={`nanoid-${count}x${length}.txt`}
                  className={buttonVariants({ size: "sm", variant: "ghost" })}
                >
                  <Download aria-hidden className="size-4" />
                  {m["common.listslugDownload"]()}
                </a>
              ) : (
                <Button type="button" size="sm" variant="ghost" isDisabled>
                  <Download aria-hidden className="size-4" />
                  {m["common.listslugDownload"]()}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onPress={() => setVersion((current) => current + 1)}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.ksuidRegenerate"]()}
              </Button>
            </ToolPanelActionGroup>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <TextArea
              aria-label={m["common.passresultstitle"]()}
              value={output}
              readOnly
              rows={14}
              placeholder={m["tools.nanoidGenerator.resultsPlaceholder"]()}
              className="max-h-[min(32rem,60vh)] min-h-80 resize-y overflow-y-auto font-mono text-sm"
            />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.nanoidGenerator.article.title"]()}</h2>
        <p>{m["tools.nanoidGenerator.article.intro"]()}</p>
        <p>{m["tools.nanoidGenerator.article.privacy"]()}</p>
        <p>
          <strong>{m["tools.nanoidGenerator.article.keyPointsTitle"]()}</strong>
        </p>
        <ul>
          {[
            [
              m["tools.nanoidGenerator.article.keyPoints00"](),
              m["tools.nanoidGenerator.article.keyPoints01"](),
            ],
            [
              m["tools.nanoidGenerator.article.keyPoints10"](),
              m["tools.nanoidGenerator.article.keyPoints11"](),
            ],
            [
              m["tools.nanoidGenerator.article.keyPoints20"](),
              m["tools.nanoidGenerator.article.keyPoints21"](),
            ],
            [
              m["tools.nanoidGenerator.article.keyPoints30"](),
              m["tools.nanoidGenerator.article.keyPoints31"](),
            ],
          ].map(([title, body]) => (
            <li key={title}>
              <strong>{title}</strong>: {body}
            </li>
          ))}
        </ul>
        <p>
          <strong>{m["tools.nanoidGenerator.article.guidanceTitle"]()}</strong>
        </p>
        <ul>
          {[
            m["tools.nanoidGenerator.article.guidance0"](),
            m["tools.nanoidGenerator.article.guidance1"](),
            m["tools.nanoidGenerator.article.guidance2"](),
            m["tools.nanoidGenerator.article.guidance3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function NanoidGeneratorPage() {
  return (
    <ToolPage>
      <NanoidGeneratorPageContent />
    </ToolPage>
  );
}
