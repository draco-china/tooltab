import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Download, RefreshCcw, TriangleAlert } from "lucide-react";
import {
  type ReactNode,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { useObjectUrl } from "@/hooks/use-object-url";
import {
  fromEntropy,
  generate,
  inspect,
  LANGUAGES,
  type Language,
} from "@workspace/tools/crypto/mnemonic";

const WORD_COUNTS = [12, 15, 18, 21, 24] as const;
const WORD_COUNT_OPTIONS = WORD_COUNTS.map((count) => ({
  label: String(count),
  value: String(count),
}));
const WORDLIST_OPTIONS: readonly { label: string; value: Language }[] = [
  { label: "English", value: "english" },
  { label: "中文 (简体)", value: "chinese_simplified" },
  { label: "中文 (繁體)", value: "chinese_traditional" },
  { label: "Čeština", value: "czech" },
  { label: "Français", value: "french" },
  { label: "Italiano", value: "italian" },
  { label: "日本語", value: "japanese" },
  { label: "한국어", value: "korean" },
  { label: "Português", value: "portuguese" },
  { label: "Español", value: "spanish" },
];
const STORAGE_KEYS = {
  activeTab: "tools:bip39-mnemonic-generator:tab",
  wordlist: "tools:bip39-mnemonic-generator:wordlist",
  wordCount: "tools:bip39-mnemonic-generator:word-count",
  validationMnemonic: "tools:bip39-mnemonic-generator:validate:mnemonic",
  entropyInput: "tools:bip39-mnemonic-generator:convert:entropy",
  conversionMnemonic: "tools:bip39-mnemonic-generator:convert:mnemonic",
} as const;

type Tab = "generate" | "validate" | "convert";
type WordCount = (typeof WORD_COUNTS)[number];
type Generated = ReturnType<typeof generate>;
type ValidationState = "empty" | "valid" | "invalid";

function isTab(value: string): value is Tab {
  return value === "generate" || value === "validate" || value === "convert";
}

function isWordCount(value: number): value is WordCount {
  return WORD_COUNTS.includes(value as WordCount);
}

function isLanguage(value: string): value is Language {
  return LANGUAGES.includes(value as Language);
}

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

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key));
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger id={id} className="min-h-11 w-full">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Section>
            {options.map((option) => (
              <ListBox.Item
                key={option.value}
                id={option.value}
                textValue={option.label}
              >
                {option.label}
              </ListBox.Item>
            ))}
          </ListBox.Section>
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function ResultBlock({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-default/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <ToolCopyButton
          value={value}
          copyLabel={m["common.actions.copy"]()}
          copiedLabel={m["common.actions.copied"]()}
          variant="ghost"
        />
      </div>
      {children}
    </div>
  );
}

function ConversionError({ message }: { message: string }) {
  return (
    <Alert status="danger" role="alert">
      <Alert.Indicator>
        <TriangleAlert aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function MnemonicArticle() {
  return (
    <ToolArticle>
      <p>{m["shared.bip39Mnemonic.intro"]()}</p>
      <h2>{m["shared.bip39Mnemonic.generateTitle"]()}</h2>
      <p>{m["shared.bip39Mnemonic.generateBody"]()}</p>
      <h2>{m["shared.bip39Mnemonic.validateTitle"]()}</h2>
      <p>{m["shared.bip39Mnemonic.validateBody"]()}</p>
      <h2>{m["shared.bip39Mnemonic.convertTitle"]()}</h2>
      <p>{m["shared.bip39Mnemonic.convertBody"]()}</p>
    </ToolArticle>
  );
}

function MnemonicToolContent() {
  const modeLabelId = useId();
  const wordlistId = useId();
  const wordCountId = useId();
  const validationMnemonicId = useId();
  const entropyInputId = useId();
  const conversionMnemonicId = useId();
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("generate");
  const [wordlist, setWordlist] = useState<Language>("english");
  const [wordCount, setWordCount] = useState<WordCount>(12);
  const [validationMnemonic, setValidationMnemonic] = useState("");
  const [entropyInput, setEntropyInput] = useState("");
  const [conversionMnemonic, setConversionMnemonic] = useState("");
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [generationError, setGenerationError] = useState(false);
  const deferredValidationMnemonic = useDeferredValue(validationMnemonic);
  const deferredEntropyInput = useDeferredValue(entropyInput);
  const deferredConversionMnemonic = useDeferredValue(conversionMnemonic);
  const generateCurrent = useCallback(() => {
    try {
      const result = generate(wordCount, wordlist);
      startTransition(() => {
        setGenerated(result);
        setGenerationError(false);
      });
    } catch {
      startTransition(() => {
        setGenerated(null);
        setGenerationError(true);
      });
    }
  }, [wordCount, wordlist]);

  useEffect(() => {
    try {
      const storedTab = localStorage.getItem(STORAGE_KEYS.activeTab);
      const storedWordlist = localStorage.getItem(STORAGE_KEYS.wordlist);
      const storedWordCount = Number(
        localStorage.getItem(STORAGE_KEYS.wordCount),
      );
      if (storedTab && isTab(storedTab)) setActiveTab(storedTab);
      if (storedWordlist && isLanguage(storedWordlist))
        setWordlist(storedWordlist);
      if (isWordCount(storedWordCount)) setWordCount(storedWordCount);
      localStorage.removeItem(STORAGE_KEYS.validationMnemonic);
      localStorage.removeItem(STORAGE_KEYS.entropyInput);
      localStorage.removeItem(STORAGE_KEYS.conversionMnemonic);
    } catch {
      // Storage can be unavailable without affecting local conversion.
    } finally {
      setHasLoadedStorage(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage) return;
    try {
      localStorage.setItem(STORAGE_KEYS.activeTab, activeTab);
      localStorage.setItem(STORAGE_KEYS.wordlist, wordlist);
      localStorage.setItem(STORAGE_KEYS.wordCount, String(wordCount));
    } catch {
      // Keep the tool usable when browser storage is blocked or full.
    }
  }, [activeTab, hasLoadedStorage, wordCount, wordlist]);

  useEffect(() => {
    if (!hasLoadedStorage) return;
    generateCurrent();
  }, [generateCurrent, hasLoadedStorage]);

  const downloadBlob = useMemo(
    () =>
      generated
        ? new Blob(
            [
              [
                "Mnemonic",
                generated.mnemonic,
                "",
                "Entropy",
                generated.entropy,
              ].join("\n"),
            ],
            { type: "text/plain;charset=utf-8" },
          )
        : null,
    [generated],
  );
  const downloadUrl = useObjectUrl(downloadBlob);

  const strengthBits = (wordCount * 32) / 3;
  let validationState: ValidationState = "empty";
  let validationWordCount = 0;
  let validationEntropy = "";
  if (deferredValidationMnemonic.trim()) {
    try {
      const result = inspect(deferredValidationMnemonic, wordlist);
      validationState = result.valid ? "valid" : "invalid";
      validationWordCount = result.wordCount;
      validationEntropy = result.entropy;
    } catch {
      validationState = "invalid";
    }
  }

  let entropyMnemonic = "";
  let entropyHasError = false;
  if (deferredEntropyInput.trim()) {
    try {
      entropyMnemonic = fromEntropy(deferredEntropyInput, wordlist).mnemonic;
    } catch {
      entropyHasError = true;
    }
  }

  let mnemonicEntropy = "";
  let mnemonicHasError = false;
  if (deferredConversionMnemonic.trim()) {
    try {
      const result = inspect(deferredConversionMnemonic, wordlist);
      mnemonicHasError = !result.valid;
      mnemonicEntropy = result.entropy;
    } catch {
      mnemonicHasError = true;
    }
  }

  return (
    <div className="grid gap-8">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <PanelHeader
            title={m["shared.aesTools.encryptoptionscardtitle"]()}
            description={m["shared.bip39Mnemonic.optionsDescription"]()}
          />
          <ToolPanelCardContent className="gap-6 py-4">
            <div className="grid gap-2">
              <Label id={modeLabelId}>
                {m["shared.aesTools.decryptmodelabel"]()}
              </Label>
              <ToggleButtonGroup
                aria-labelledby={modeLabelId}
                selectionMode="single"
                selectedKeys={new Set([activeTab])}
                className="w-full [&_button]:min-h-11 [&_button]:flex-1"
                onSelectionChange={(selection) => {
                  const next = String([...selection][0] ?? "");
                  if (isTab(next)) setActiveTab(next);
                }}
              >
                <ToggleButton id="generate">
                  {m["tools.bip39MnemonicGenerator.generate"]()}
                </ToggleButton>
                <ToggleButton id="validate">
                  {m["shared.bip39Mnemonic.validateTabLabel"]()}
                </ToggleButton>
                <ToggleButton id="convert">
                  {m["shared.joseTools.convert"]()}
                </ToggleButton>
              </ToggleButtonGroup>
            </div>

            <SelectField
              id={wordlistId}
              label={m["tools.bip39MnemonicGenerator.language"]()}
              value={wordlist}
              options={WORDLIST_OPTIONS}
              onChange={(value) => {
                if (isLanguage(value)) setWordlist(value);
              }}
            />

            {activeTab === "generate" ? (
              <>
                <SelectField
                  id={wordCountId}
                  label={m["shared.bip39Mnemonic.wordCountLabel"]()}
                  value={String(wordCount)}
                  options={WORD_COUNT_OPTIONS}
                  onChange={(value) => {
                    const parsed = Number(value);
                    if (isWordCount(parsed)) setWordCount(parsed);
                  }}
                />
                <div className="rounded-xl border border-dashed border-border bg-default/20 p-4">
                  <p className="text-xs font-medium tracking-widest text-muted uppercase">
                    {m["shared.bip39Mnemonic.entropyBitsLabel"]({
                      bits: String(strengthBits),
                    })}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {m["shared.bip39Mnemonic.generatedPlaceholder"]()}
                  </p>
                </div>
              </>
            ) : null}

            {activeTab === "validate" ? (
              <TextField className="grid gap-2">
                <Label htmlFor={validationMnemonicId}>
                  {m["shared.bip39Mnemonic.conversionMnemonicLabel"]()}
                </Label>
                <TextArea
                  id={validationMnemonicId}
                  value={validationMnemonic}
                  rows={6}
                  placeholder={m[
                    "shared.bip39Mnemonic.conversionMnemonicLabel"
                  ]()}
                  className="min-h-36 resize-y font-mono text-sm"
                  onChange={(event) =>
                    setValidationMnemonic(event.currentTarget.value)
                  }
                />
              </TextField>
            ) : null}

            {activeTab === "convert" ? (
              <>
                <TextField className="grid gap-2">
                  <Label htmlFor={entropyInputId}>
                    {m["shared.bip39Mnemonic.entropyInputLabel"]()}
                  </Label>
                  <Input
                    id={entropyInputId}
                    value={entropyInput}
                    placeholder={m["shared.bip39Mnemonic.entropyInputLabel"]()}
                    spellCheck={false}
                    className="min-h-11 font-mono text-sm"
                    onChange={(event) =>
                      setEntropyInput(event.currentTarget.value)
                    }
                  />
                </TextField>
                <TextField className="grid gap-2">
                  <Label htmlFor={conversionMnemonicId}>
                    {m["shared.bip39Mnemonic.conversionMnemonicLabel"]()}
                  </Label>
                  <TextArea
                    id={conversionMnemonicId}
                    value={conversionMnemonic}
                    rows={6}
                    placeholder={m[
                      "shared.bip39Mnemonic.conversionMnemonicLabel"
                    ]()}
                    className="min-h-36 resize-y font-mono text-sm"
                    onChange={(event) =>
                      setConversionMnemonic(event.currentTarget.value)
                    }
                  />
                </TextField>
              </>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <PanelHeader
            title={m["common.passresultstitle"]()}
            description={m["shared.bip39Mnemonic.resultsDescription"]()}
            actions={
              activeTab === "generate" && generated ? (
                <>
                  {downloadUrl ? (
                    <a
                      href={downloadUrl}
                      download="bip39-mnemonic.txt"
                      className={buttonVariants({
                        size: "sm",
                        variant: "ghost",
                      })}
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
                    onPress={generateCurrent}
                  >
                    <RefreshCcw aria-hidden className="size-4" />
                    {m["common.mnemonicRegenerate"]()}
                  </Button>
                </>
              ) : null
            }
          />
          <ToolPanelCardContent className="gap-5 py-4">
            {activeTab === "generate" ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Chip size="sm" variant="soft">
                    {m["shared.bip39Mnemonic.validationWordCountLabel"]({
                      count: String(wordCount),
                    })}
                  </Chip>
                  <Chip size="sm" variant="secondary">
                    {m["shared.bip39Mnemonic.entropyBitsLabel"]({
                      bits: String(strengthBits),
                    })}
                  </Chip>
                </div>
                <ResultBlock
                  label={m["shared.bip39Mnemonic.generatedMnemonicLabel"]()}
                  value={generated?.mnemonic ?? ""}
                >
                  <TextArea
                    aria-label={m[
                      "shared.bip39Mnemonic.generatedMnemonicLabel"
                    ]()}
                    value={generated?.mnemonic ?? ""}
                    readOnly
                    rows={6}
                    placeholder={m[
                      "shared.bip39Mnemonic.generatedPlaceholder"
                    ]()}
                    className="min-h-40 resize-y font-mono text-sm"
                  />
                </ResultBlock>
                <ResultBlock
                  label={m["shared.bip39Mnemonic.generatedEntropyLabel"]()}
                  value={generated?.entropy ?? ""}
                >
                  <Input
                    aria-label={m[
                      "shared.bip39Mnemonic.generatedEntropyLabel"
                    ]()}
                    value={generated?.entropy ?? ""}
                    readOnly
                    className="font-mono text-sm"
                  />
                </ResultBlock>
                {generationError ? (
                  <ConversionError
                    message={m["shared.bip39Mnemonic.randomFailedMessage"]()}
                  />
                ) : null}
              </>
            ) : null}

            {activeTab === "validate" ? (
              validationState === "empty" ? (
                <p className="text-sm text-muted">
                  {m["shared.bip39Mnemonic.validationEmptyLabel"]()}
                </p>
              ) : (
                <div className="grid gap-4">
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      size="sm"
                      color={validationState === "valid" ? "success" : "danger"}
                    >
                      {validationState === "valid"
                        ? m["shared.jsonSchemaTools.valid"]()
                        : m["shared.jsonSchemaTools.invalid"]()}
                    </Chip>
                    <Chip size="sm" variant="secondary">
                      {m["shared.bip39Mnemonic.validationWordCountLabel"]({
                        count: String(validationWordCount),
                      })}
                    </Chip>
                  </div>
                  <p className="text-sm text-muted">
                    {validationState === "valid"
                      ? m["shared.bip39Mnemonic.validationValidMessage"]()
                      : m["shared.bip39Mnemonic.validationInvalidMessage"]()}
                  </p>
                  {validationState === "valid" ? (
                    <ResultBlock
                      label={m["shared.bip39Mnemonic.validationEntropyLabel"]()}
                      value={validationEntropy}
                    >
                      <Input
                        aria-label={m[
                          "shared.bip39Mnemonic.validationEntropyLabel"
                        ]()}
                        value={validationEntropy}
                        readOnly
                        className="font-mono text-sm"
                      />
                    </ResultBlock>
                  ) : null}
                </div>
              )
            ) : null}

            {activeTab === "convert" ? (
              <div className="grid gap-4">
                <ResultBlock
                  label={m["shared.bip39Mnemonic.entropyToMnemonicLabel"]()}
                  value={entropyMnemonic}
                >
                  {entropyHasError ? (
                    <ConversionError
                      message={m[
                        "shared.bip39Mnemonic.entropyInvalidMessage"
                      ]()}
                    />
                  ) : (
                    <TextArea
                      aria-label={m[
                        "shared.bip39Mnemonic.entropyToMnemonicLabel"
                      ]()}
                      value={entropyMnemonic}
                      readOnly
                      rows={5}
                      placeholder={m[
                        "shared.bip39Mnemonic.entropyToMnemonicPlaceholder"
                      ]()}
                      className="min-h-32 resize-y font-mono text-sm"
                    />
                  )}
                </ResultBlock>
                <ResultBlock
                  label={m["shared.bip39Mnemonic.mnemonicToEntropyLabel"]()}
                  value={mnemonicEntropy}
                >
                  {mnemonicHasError ? (
                    <ConversionError
                      message={m[
                        "shared.bip39Mnemonic.mnemonicInvalidMessage"
                      ]()}
                    />
                  ) : (
                    <Input
                      aria-label={m[
                        "shared.bip39Mnemonic.mnemonicToEntropyLabel"
                      ]()}
                      value={mnemonicEntropy}
                      readOnly
                      placeholder={m[
                        "shared.bip39Mnemonic.mnemonicToEntropyPlaceholder"
                      ]()}
                      className="font-mono text-sm"
                    />
                  )}
                </ResultBlock>
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <MnemonicArticle />
    </div>
  );
}

export default function MnemonicTool() {
  return (
    <ToolPage>
      <MnemonicToolContent />
    </ToolPage>
  );
}
