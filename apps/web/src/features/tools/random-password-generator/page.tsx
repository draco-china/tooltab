import { downloadUrl as startDownload } from "@/lib/download";
import { useObjectUrl } from "@/hooks/use-object-url";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Skeleton,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Download, Eye, EyeOff, RefreshCcw } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import {
  CHARSETS,
  type Charset,
  type GeneratorOptions,
  generatorDefaults,
} from "@workspace/tools/password/generator";
import type { PasswordJob, PasswordResult } from "../password-tools/logic";
import { runPasswordWorker } from "../password-tools/worker-client";

type Mode = GeneratorOptions["mode"];
type Profiles = Record<Mode, GeneratorOptions>;

const MODE_ITEMS = ["random", "words", "separator", "pin"] as const;
const CHARSET_ITEMS = Object.keys(CHARSETS) as Charset[];
const STORAGE_PREFIX = "tools:random-password-generator";

function defaultProfiles(): Profiles {
  return {
    random: { ...generatorDefaults, charsets: [...generatorDefaults.charsets] },
    words: { ...generatorDefaults, mode: "words" },
    separator: {
      ...generatorDefaults,
      mode: "separator",
      charsets: [...generatorDefaults.charsets],
    },
    pin: { ...generatorDefaults, mode: "pin", length: 6 },
  };
}

function RandomPasswordGeneratorPageContent() {
  const id = useId();
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("random");
  const [profiles, setProfiles] = useState<Profiles>(defaultProfiles);
  const [nonce, setNonce] = useState(0);
  const [hidden, setHidden] = useState(true);
  const options = profiles[mode];

  useEffect(() => {
    try {
      const storedMode = localStorage.getItem(`${STORAGE_PREFIX}:mode`);
      const nextMode = MODE_ITEMS.includes(storedMode as Mode)
        ? (storedMode as Mode)
        : "random";
      const next = defaultProfiles();
      next.random.length = storedInteger("random:length", 4, 128, 16);
      next.random.charsets = storedCharsets(
        "random:charsets",
        generatorDefaults.charsets,
      );
      next.random.excludeSimilar = storedBoolean("random:excludeSimilar", true);
      next.words.wordCount = storedInteger("words:count", 2, 12, 4);
      next.words.separator = storedString("words:separator", "-");
      next.words.capitalize = storedBoolean("words:capitalize", false);
      next.words.includeNumber = storedBoolean("words:includeNumber", false);
      next.separator.charsets = storedCharsets(
        "separator:charsets",
        generatorDefaults.charsets,
      );
      next.separator.excludeSimilar = storedBoolean(
        "separator:excludeSimilar",
        true,
      );
      next.separator.blockLength = storedInteger(
        "separator:blockLength",
        1,
        16,
        3,
      );
      next.separator.blockCount = storedInteger(
        "separator:blockCount",
        2,
        10,
        3,
      );
      next.separator.blockSeparator = storedString(
        "separator:blockSeparator",
        "-",
      );
      next.pin.length = storedInteger("pin:length", 1, 12, 6);
      next.pin.allowLeadingZero = storedBoolean("pin:allowLeadingZero", true);
      localStorage.removeItem(`${STORAGE_PREFIX}:history`);
      setMode(nextMode);
      setProfiles(next);
    } catch {
      // Optional settings persistence must not block password generation.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}:mode`, mode);
      localStorage.setItem(
        `${STORAGE_PREFIX}:random:length`,
        String(profiles.random.length),
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:random:charsets`,
        JSON.stringify(profiles.random.charsets),
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:random:excludeSimilar`,
        String(profiles.random.excludeSimilar),
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:words:count`,
        String(profiles.words.wordCount),
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:words:separator`,
        profiles.words.separator,
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:words:capitalize`,
        String(profiles.words.capitalize),
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:words:includeNumber`,
        String(profiles.words.includeNumber),
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:separator:charsets`,
        JSON.stringify(profiles.separator.charsets),
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:separator:excludeSimilar`,
        String(profiles.separator.excludeSimilar),
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:separator:blockLength`,
        String(profiles.separator.blockLength),
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:separator:blockCount`,
        String(profiles.separator.blockCount),
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:separator:blockSeparator`,
        profiles.separator.blockSeparator,
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:pin:length`,
        String(profiles.pin.length),
      );
      localStorage.setItem(
        `${STORAGE_PREFIX}:pin:allowLeadingZero`,
        String(profiles.pin.allowLeadingZero),
      );
    } catch {
      // Storage can be unavailable while generation remains fully usable.
    }
  }, [mode, profiles, ready]);

  const job = useMemo<PasswordJob | null>(() => {
    void nonce;
    return ready ? { kind: "generate", options } : null;
  }, [nonce, options, ready]);
  const task = usePasswordTask(job);
  const result = task.result?.kind === "generated" ? task.result.output : "";
  const resultBlob = useMemo(
    () =>
      result ? new Blob([result], { type: "text/plain;charset=utf-8" }) : null,
    [result],
  );
  const downloadUrl = useObjectUrl(resultBlob);

  useEffect(() => {
    if (job) setHidden(true);
  }, [job]);

  function change<Key extends keyof GeneratorOptions>(
    key: Key,
    value: GeneratorOptions[Key],
  ) {
    setProfiles((current) => ({
      ...current,
      [mode]: { ...current[mode], [key]: value },
    }));
  }

  return (
    <div className="grid gap-8">
      <div
        className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.aesTools.encryptoptionscardtitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.randomPasswordGenerator.optionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            <div className="grid gap-2">
              <Label id={`${id}-mode-label`}>
                {m["shared.aesTools.decryptmodelabel"]()}
              </Label>
              <ToggleButtonGroup
                aria-labelledby={`${id}-mode-label`}
                selectionMode="single"
                selectedKeys={new Set([mode])}
                className="grid w-full grid-cols-4"
                onSelectionChange={(selection) => {
                  const next = String([...selection][0] ?? "");
                  if (MODE_ITEMS.includes(next as Mode)) setMode(next as Mode);
                }}
              >
                {MODE_ITEMS.map((item) => (
                  <ToggleButton key={item} id={item} size="sm">
                    {modeLabel(item)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </div>

            {mode === "random" ? (
              <>
                <NumberField
                  id={`${id}-random-length`}
                  label={m["common.passlength"]()}
                  min={4}
                  max={128}
                  value={options.length}
                  onChange={(value) => change("length", value)}
                />
                <CharsetField
                  id={`${id}-random-charsets`}
                  value={options.charsets}
                  onChange={(value) => change("charsets", value)}
                />
                <SwitchField
                  label={m[
                    "tools.randomPasswordGenerator.excludeSimilarLabel"
                  ]()}
                  selected={options.excludeSimilar}
                  onChange={(value) => change("excludeSimilar", value)}
                />
              </>
            ) : null}

            {mode === "words" ? (
              <>
                <NumberField
                  id={`${id}-word-count`}
                  label={m["shared.bip39Mnemonic.wordCountLabel"]()}
                  min={2}
                  max={12}
                  value={options.wordCount}
                  onChange={(value) => change("wordCount", value)}
                />
                <TextField className="grid gap-2">
                  <Label htmlFor={`${id}-word-separator`}>
                    {m["common.passseparator"]()}
                  </Label>
                  <Input
                    id={`${id}-word-separator`}
                    maxLength={3}
                    value={options.separator}
                    onChange={(event) =>
                      change("separator", event.currentTarget.value)
                    }
                  />
                </TextField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SwitchField
                    label={m[
                      "tools.randomPasswordGenerator.capitalizeWordsLabel"
                    ]()}
                    selected={options.capitalize}
                    onChange={(value) => change("capitalize", value)}
                  />
                  <SwitchField
                    label={m[
                      "tools.randomPasswordGenerator.includeNumberLabel"
                    ]()}
                    selected={options.includeNumber}
                    onChange={(value) => change("includeNumber", value)}
                  />
                </div>
              </>
            ) : null}

            {mode === "separator" ? (
              <>
                <CharsetField
                  id={`${id}-block-charsets`}
                  value={options.charsets}
                  onChange={(value) => change("charsets", value)}
                />
                <SwitchField
                  label={m[
                    "tools.randomPasswordGenerator.excludeSimilarLabel"
                  ]()}
                  selected={options.excludeSimilar}
                  onChange={(value) => change("excludeSimilar", value)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    id={`${id}-block-length`}
                    label={m[
                      "tools.randomPasswordGenerator.blockLengthLabel"
                    ]()}
                    min={1}
                    max={16}
                    value={options.blockLength}
                    onChange={(value) => change("blockLength", value)}
                  />
                  <NumberField
                    id={`${id}-block-count`}
                    label={m["common.passblockcount"]()}
                    min={2}
                    max={10}
                    value={options.blockCount}
                    onChange={(value) => change("blockCount", value)}
                  />
                </div>
                <TextField className="grid gap-2">
                  <Label htmlFor={`${id}-block-separator`}>
                    {m["tools.randomPasswordGenerator.blockSeparatorLabel"]()}
                  </Label>
                  <Input
                    id={`${id}-block-separator`}
                    maxLength={3}
                    value={options.blockSeparator}
                    onChange={(event) =>
                      change("blockSeparator", event.currentTarget.value)
                    }
                  />
                </TextField>
              </>
            ) : null}

            {mode === "pin" ? (
              <>
                <NumberField
                  id={`${id}-pin-length`}
                  label={m["common.passlength"]()}
                  min={1}
                  max={12}
                  value={options.length}
                  onChange={(value) => change("length", value)}
                />
                <SwitchField
                  label={m[
                    "tools.randomPasswordGenerator.allowLeadingZeroLabel"
                  ]()}
                  selected={options.allowLeadingZero}
                  onChange={(value) => change("allowLeadingZero", value)}
                />
              </>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="flex flex-col items-start gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
            <div className="grid min-w-0 gap-1">
              <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
              <Card.Description>
                {m["tools.randomPasswordGenerator.resultsDescription"]()}
              </Card.Description>
            </div>
            <div className="flex w-full shrink-0 flex-wrap justify-start gap-1 sm:w-auto sm:justify-end">
              <Button
                type="button"
                size="sm"
                variant="primary"
                isDisabled={task.busy}
                onPress={() => setNonce((value) => value + 1)}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.mnemonicRegenerate"]()}
              </Button>
              <ToolCopyButton
                value={result}
                copyLabel={m["common.adler32copyresultlabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                variant="ghost"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                isDisabled={!downloadUrl}
                onPress={() =>
                  startDownload(downloadUrl, "random-password.txt")
                }
              >
                <Download aria-hidden className="size-4" />
                {m["common.actions.download"]()}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                isDisabled={!result}
                onPress={() => setHidden((value) => !value)}
              >
                {hidden ? (
                  <Eye aria-hidden className="size-4" />
                ) : (
                  <EyeOff aria-hidden className="size-4" />
                )}
                {hidden
                  ? m["tools.randomPasswordGenerator.passshowresult"]()
                  : m["tools.randomPasswordGenerator.passhideresult"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <section
              aria-label={m["common.passresultstitle"]()}
              className="flex min-h-56 w-full flex-1 items-center justify-center px-5 py-6 text-center"
            >
              {task.busy || !ready ? (
                <div className="grid w-full justify-items-center gap-4">
                  <Skeleton className="h-4 w-20 rounded-lg" />
                  <Skeleton className="h-10 w-3/4 rounded-xl" />
                </div>
              ) : result ? (
                <div className="w-full space-y-3">
                  <div className="text-xs font-medium tracking-[0.24em] text-muted uppercase">
                    {modeLabel(mode)}
                  </div>
                  <div
                    data-slot="password-result-value"
                    data-concealed={hidden}
                    className="font-mono text-2xl font-semibold tracking-tight break-all sm:text-4xl"
                  >
                    {hidden ? "••••••••••••" : result}
                  </div>
                </div>
              ) : (
                <span className="text-sm text-muted">
                  {m["tools.randomPasswordGenerator.resultsPlaceholder"]()}
                </span>
              )}
            </section>
            {task.error ? (
              <Alert status="danger">
                <Alert.Content>
                  <Alert.Description>
                    {m["tools.randomPasswordGenerator.generationError"]()}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <p>{m["tools.randomPasswordGenerator.articleIntro"]()}</p>
        <h2>{m["tools.randomPasswordGenerator.articleFormatTitle"]()}</h2>
        <p>
          <InlineArticleText>
            {m["tools.randomPasswordGenerator.articleFormatBody"]()}
          </InlineArticleText>
        </p>
        <h2>{m["tools.randomPasswordGenerator.articleTuneTitle"]()}</h2>
        <p>
          <InlineArticleText>
            {m["tools.randomPasswordGenerator.articleTuneBody"]()}
          </InlineArticleText>
        </p>
        <h2>{m["tools.randomPasswordGenerator.articleExportTitle"]()}</h2>
        <p>{m["tools.randomPasswordGenerator.articleExportBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function InlineArticleText({ children }: Readonly<{ children: string }>) {
  return children
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("**"))
        return <strong key={part}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`"))
        return <code key={part}>{part.slice(1, -1)}</code>;
      return part;
    });
}

function usePasswordTask(job: PasswordJob | null) {
  const [result, setResult] = useState<PasswordResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const revision = useRef(0);

  useEffect(() => {
    const current = ++revision.current;
    const controller = new AbortController();
    setResult(null);
    setError(false);
    if (!job) return () => controller.abort();
    setBusy(true);
    const timer = window.setTimeout(() => {
      void runPasswordWorker(job, controller.signal)
        .then((value) => {
          if (current === revision.current) setResult(value);
        })
        .catch(() => {
          if (current === revision.current && !controller.signal.aborted) {
            setError(true);
          }
        })
        .finally(() => {
          if (current === revision.current) setBusy(false);
        });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [job]);

  return { result, busy, error };
}

function NumberField({
  id,
  label,
  min,
  max,
  value,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}>) {
  return (
    <TextField className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) =>
          onChange(clampInteger(event.currentTarget.value, min, max, value))
        }
      />
    </TextField>
  );
}

function SwitchField({
  label,
  selected,
  onChange,
}: Readonly<{
  label: string;
  selected: boolean;
  onChange: (value: boolean) => void;
}>) {
  return (
    <Switch
      className="w-full"
      isSelected={selected}
      onChange={(value) => onChange(value === true)}
    >
      <Switch.Content className="flex min-h-11 w-full items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

function CharsetField({
  id,
  value,
  onChange,
}: Readonly<{
  id: string;
  value: Charset[];
  onChange: (value: Charset[]) => void;
}>) {
  return (
    <div className="grid gap-2">
      <Label id={`${id}-label`}>
        {m["tools.randomPasswordGenerator.characterSetLabel"]()}
      </Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {CHARSET_ITEMS.map((item) => (
          <Checkbox
            key={item}
            isSelected={value.includes(item)}
            onChange={(selected) =>
              onChange(
                selected
                  ? [...value, item]
                  : value.filter((current) => current !== item),
              )
            }
          >
            <Checkbox.Content className="flex min-h-10 items-center gap-2 text-sm">
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              {charsetLabel(item)}
            </Checkbox.Content>
          </Checkbox>
        ))}
      </div>
    </div>
  );
}

function modeLabel(mode: Mode) {
  if (mode === "random")
    return m["tools.randomPasswordGenerator.randomTabLabel"]();
  if (mode === "words") return m["tools.loremIpsumGenerator.wordsLabel"]();
  if (mode === "separator")
    return m["tools.randomPasswordGenerator.separatorTabLabel"]();
  return m["common.passpin"]();
}

function charsetLabel(charset: Charset) {
  if (charset === "upper") return m["common.passupper"]();
  if (charset === "lower") return m["common.passlower"]();
  if (charset === "digits") return m["common.passdigits"]();
  return m["common.passsymbols"]();
}

function clampInteger(
  value: string,
  min: number,
  max: number,
  fallback: number,
) {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, Math.floor(parsed)))
    : fallback;
}

function storedInteger(
  key: string,
  min: number,
  max: number,
  fallback: number,
) {
  return clampInteger(
    safeLocalStorage.getItem(`${STORAGE_PREFIX}:${key}`) ?? "",
    min,
    max,
    fallback,
  );
}

function storedBoolean(key: string, fallback: boolean) {
  const value = safeLocalStorage.getItem(`${STORAGE_PREFIX}:${key}`);
  return value === null ? fallback : value === "true";
}

function storedString(key: string, fallback: string) {
  return safeLocalStorage.getItem(`${STORAGE_PREFIX}:${key}`) ?? fallback;
}

function storedCharsets(key: string, fallback: readonly Charset[]) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(`${STORAGE_PREFIX}:${key}`) ?? "null",
    );
    if (!Array.isArray(parsed)) return [...fallback];
    return CHARSET_ITEMS.filter((item) => parsed.includes(item));
  } catch {
    return [...fallback];
  }
}

export default function RandomPasswordGeneratorPage() {
  return (
    <ToolPage>
      <RandomPasswordGeneratorPageContent />
    </ToolPage>
  );
}
