import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Clock3, Download, RefreshCw, TriangleAlert } from "lucide-react";
import {
  type ReactNode,
  startTransition,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  formatDateTimeLocalInput,
  parseDateTimeLocalInput,
} from "./local-date";
import {
  generateUuidV6Batch,
  isValidUuidClockSequence,
  isValidUuidV6UnixMilliseconds,
  normalizeUuidV6Count,
  parseUuidNode,
  UUID_CLOCK_SEQUENCE_MAX,
  UUID_V6_MAX_COUNT,
  UUID_V6_MAX_UNIX_MILLISECONDS,
  UUID_V6_MIN_UNIX_MILLISECONDS,
  type UuidV6ClockSequenceMode,
  type UuidV6NodeMode,
} from "@workspace/tools/uuid/v6";

type TimestampMode = "now" | "custom";
type Mode = TimestampMode | UuidV6NodeMode | UuidV6ClockSequenceMode;

const DEFAULT_COUNT = 5;
const DEFAULT_NODE = "02:00:00:00:00:01";
const STORAGE_KEYS = {
  count: "tools:uuid-v6-generator:count",
  timestampMode: "tools:uuid-v6-generator:timestamp-mode",
  customDateTime: "tools:uuid-v6-generator:custom-date-time",
  customMilliseconds: "tools:uuid-v6-generator:custom-unix-milliseconds",
  nodeMode: "tools:uuid-v6-generator:node-mode",
  customNode: "tools:uuid-v6-generator:custom-node",
  sequenceMode: "tools:uuid-v6-generator:clock-sequence-mode",
  customSequence: "tools:uuid-v6-generator:custom-clock-sequence",
} as const;

function integer(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function UuidV6GeneratorContent() {
  const cryptoUnavailable = m["shared.uuidTime.uuidtCryptoUnavailable"]();
  const id = useId();
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [timestampMode, setTimestampMode] = useState<TimestampMode>("now");
  const [customDateTime, setCustomDateTime] = useState(() =>
    formatDateTimeLocalInput(Date.now()),
  );
  const [customMilliseconds, setCustomMilliseconds] = useState(() =>
    String(Date.now()),
  );
  const [nodeMode, setNodeMode] = useState<UuidV6NodeMode>("random");
  const [customNodeInput, setCustomNodeInput] = useState(DEFAULT_NODE);
  const [sequenceMode, setSequenceMode] =
    useState<UuidV6ClockSequenceMode>("random");
  const [customSequenceInput, setCustomSequenceInput] = useState("0");
  const [generationVersion, setGenerationVersion] = useState(0);
  const [output, setOutput] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    const storedCount = Number(safeLocalStorage.getItem(STORAGE_KEYS.count));
    const storedTimestampMode = safeLocalStorage.getItem(
      STORAGE_KEYS.timestampMode,
    );
    const storedNodeMode = safeLocalStorage.getItem(STORAGE_KEYS.nodeMode);
    const storedSequenceMode = safeLocalStorage.getItem(
      STORAGE_KEYS.sequenceMode,
    );
    if (
      Number.isFinite(storedCount) &&
      safeLocalStorage.getItem(STORAGE_KEYS.count)
    ) {
      setCount(normalizeUuidV6Count(storedCount));
    }
    if (storedTimestampMode === "now" || storedTimestampMode === "custom") {
      setTimestampMode(storedTimestampMode);
    }
    if (storedNodeMode === "random" || storedNodeMode === "custom") {
      setNodeMode(storedNodeMode);
    }
    if (storedSequenceMode === "random" || storedSequenceMode === "custom") {
      setSequenceMode(storedSequenceMode);
    }
    const storedDateTime = safeLocalStorage.getItem(
      STORAGE_KEYS.customDateTime,
    );
    const storedMilliseconds = safeLocalStorage.getItem(
      STORAGE_KEYS.customMilliseconds,
    );
    if (storedDateTime !== null) setCustomDateTime(storedDateTime);
    if (storedMilliseconds !== null) {
      setCustomMilliseconds(storedMilliseconds);
    }
    setCustomNodeInput(
      safeLocalStorage.getItem(STORAGE_KEYS.customNode) ?? DEFAULT_NODE,
    );
    setCustomSequenceInput(
      safeLocalStorage.getItem(STORAGE_KEYS.customSequence) ?? "0",
    );
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    safeLocalStorage.setItem(STORAGE_KEYS.count, String(count));
    safeLocalStorage.setItem(STORAGE_KEYS.timestampMode, timestampMode);
    safeLocalStorage.setItem(STORAGE_KEYS.customDateTime, customDateTime);
    safeLocalStorage.setItem(
      STORAGE_KEYS.customMilliseconds,
      customMilliseconds,
    );
    safeLocalStorage.setItem(STORAGE_KEYS.nodeMode, nodeMode);
    safeLocalStorage.setItem(STORAGE_KEYS.customNode, customNodeInput);
    safeLocalStorage.setItem(STORAGE_KEYS.sequenceMode, sequenceMode);
    safeLocalStorage.setItem(STORAGE_KEYS.customSequence, customSequenceInput);
  }, [
    count,
    customDateTime,
    customMilliseconds,
    customNodeInput,
    customSequenceInput,
    nodeMode,
    ready,
    sequenceMode,
    timestampMode,
  ]);

  const milliseconds = integer(customMilliseconds);
  const sequence = integer(customSequenceInput);
  const customNode = useMemo(() => {
    try {
      return parseUuidNode(customNodeInput);
    } catch {
      return null;
    }
  }, [customNodeInput]);
  const timestampError =
    timestampMode !== "custom"
      ? ""
      : milliseconds === null
        ? m["tools.uuidV6Generator.timestampInvalid"]()
        : !isValidUuidV6UnixMilliseconds(milliseconds)
          ? m["tools.uuidV6Generator.timestampOutOfRange"]({
              min: String(UUID_V6_MIN_UNIX_MILLISECONDS),
              max: String(UUID_V6_MAX_UNIX_MILLISECONDS),
            })
          : "";
  const nodeError =
    nodeMode === "custom" && !customNode
      ? m["tools.uuidV6Generator.nodeInvalid"]()
      : "";
  const sequenceError =
    sequenceMode === "custom" &&
    (sequence === null || !isValidUuidClockSequence(sequence))
      ? m["tools.uuidV6Generator.clockSequenceInvalid"]({
          max: String(UUID_CLOCK_SEQUENCE_MAX),
        })
      : "";
  const hasError = Boolean(timestampError || nodeError || sequenceError);

  useEffect(() => {
    // The version is an explicit regeneration signal for otherwise unchanged inputs.
    void generationVersion;
    if (!ready || hasError || (nodeMode === "custom" && !customNode)) {
      setGeneratedAt(null);
      setOutput("");
      setGenerationError("");
      return;
    }
    const unixMilliseconds =
      timestampMode === "custom" ? milliseconds : Date.now();
    if (unixMilliseconds === null) return;
    try {
      const nextOutput = generateUuidV6Batch({
        count,
        unixMilliseconds,
        nodeMode,
        customNode: customNode ?? undefined,
        clockSequenceMode: sequenceMode,
        customClockSequence: sequence ?? undefined,
      }).join("\n");
      setGenerationError("");
      startTransition(() => {
        setGeneratedAt(unixMilliseconds);
        setOutput(nextOutput);
      });
    } catch {
      setGeneratedAt(null);
      setOutput("");
      setGenerationError(cryptoUnavailable);
    }
  }, [
    count,
    cryptoUnavailable,
    customNode,
    generationVersion,
    hasError,
    milliseconds,
    nodeMode,
    ready,
    sequence,
    sequenceMode,
    timestampMode,
  ]);

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

  const downloadName = generatedAt
    ? `uuid-v6-${count}-${generatedAt}.txt`
    : "uuid-v6.txt";

  function setNow() {
    const value = Date.now();
    setCustomMilliseconds(String(value));
    setCustomDateTime(formatDateTimeLocalInput(value));
  }

  return (
    <div className="grid gap-10">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.aesTools.encryptoptionscardtitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.uuidV6Generator.optionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            <Field label={m["tools.cuid2Generator.countLabel"]()}>
              <Input
                id={`${id}-count`}
                aria-label={m["tools.cuid2Generator.countLabel"]()}
                type="number"
                min={1}
                max={UUID_V6_MAX_COUNT}
                value={String(count)}
                onChange={(event) =>
                  setCount(
                    normalizeUuidV6Count(Number(event.currentTarget.value)),
                  )
                }
              />
            </Field>
            <ModeField
              label={m["tools.ksuidGenerator.timestampModeLabel"]()}
              value={timestampMode}
              options={[
                ["now", m["tools.uuidV6Generator.timestampNowLabel"]()],
                ["custom", m["tools.uuidV6Generator.timestampCustomLabel"]()],
              ]}
              onChange={(value) => setTimestampMode(value as TimestampMode)}
            />
            {timestampMode === "custom" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={m["tools.ksuidGenerator.customDateTimeLabel"]()}
                  error={timestampError}
                >
                  <Input
                    id={`${id}-date-time`}
                    aria-label={m["tools.ksuidGenerator.customDateTimeLabel"]()}
                    type="datetime-local"
                    step="1"
                    value={customDateTime}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setCustomDateTime(value);
                      const parsed = parseDateTimeLocalInput(value);
                      setCustomMilliseconds(
                        parsed === null ? "" : String(parsed),
                      );
                    }}
                  />
                </Field>
                <Field
                  label={m[
                    "common.catalogToolUlidGeneratorCustomUnixMillisecondsLabel"
                  ]()}
                  error={timestampError}
                >
                  <Input
                    id={`${id}-milliseconds`}
                    aria-label={m[
                      "common.catalogToolUlidGeneratorCustomUnixMillisecondsLabel"
                    ]()}
                    type="number"
                    value={customMilliseconds}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setCustomMilliseconds(value);
                      const parsed = integer(value);
                      setCustomDateTime(
                        parsed === null ? "" : formatDateTimeLocalInput(parsed),
                      );
                    }}
                  />
                </Field>
                <Button size="sm" variant="outline" onPress={setNow}>
                  <Clock3 aria-hidden className="size-4" />
                  {m["tools.uuidV6Generator.setNowLabel"]()}
                </Button>
              </div>
            ) : null}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="grid content-start gap-4">
                <ModeField
                  label={m["tools.uuidV6Generator.nodeModeLabel"]()}
                  value={nodeMode}
                  options={[
                    ["random", m["tools.uuidV6Generator.nodeRandomLabel"]()],
                    ["custom", m["tools.uuidV6Generator.nodeCustomLabel"]()],
                  ]}
                  onChange={(value) => setNodeMode(value as UuidV6NodeMode)}
                />
                {nodeMode === "custom" ? (
                  <Field
                    label={m["tools.uuidV6Generator.customNodeLabel"]()}
                    description={m[
                      "tools.uuidV6Generator.customNodeDescription"
                    ]()}
                    error={nodeError}
                  >
                    <Input
                      id={`${id}-node`}
                      aria-label={m["tools.uuidV6Generator.customNodeLabel"]()}
                      value={customNodeInput}
                      placeholder="02:00:00:00:00:01"
                      spellCheck={false}
                      aria-invalid={Boolean(nodeError)}
                      onChange={(event) =>
                        setCustomNodeInput(event.currentTarget.value)
                      }
                    />
                  </Field>
                ) : null}
              </div>
              <div className="grid content-start gap-4">
                <ModeField
                  label={m["tools.uuidV6Generator.clockSequenceModeLabel"]()}
                  value={sequenceMode}
                  options={[
                    [
                      "random",
                      m["tools.uuidV6Generator.clockSequenceRandomLabel"](),
                    ],
                    [
                      "custom",
                      m["tools.uuidV6Generator.clockSequenceCustomLabel"](),
                    ],
                  ]}
                  onChange={(value) =>
                    setSequenceMode(value as UuidV6ClockSequenceMode)
                  }
                />
                {sequenceMode === "custom" ? (
                  <Field
                    label={m[
                      "tools.uuidV6Generator.customClockSequenceLabel"
                    ]()}
                    description={m[
                      "tools.uuidV6Generator.customClockSequenceDescription"
                    ]()}
                    error={sequenceError}
                  >
                    <Input
                      id={`${id}-sequence`}
                      aria-label={m[
                        "tools.uuidV6Generator.customClockSequenceLabel"
                      ]()}
                      type="number"
                      min={0}
                      max={UUID_CLOCK_SEQUENCE_MAX}
                      value={customSequenceInput}
                      aria-invalid={Boolean(sequenceError)}
                      onChange={(event) =>
                        setCustomSequenceInput(event.currentTarget.value)
                      }
                    />
                  </Field>
                ) : null}
              </div>
            </div>
            {hasError || generationError ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>
                    {timestampError ||
                      nodeError ||
                      sequenceError ||
                      generationError}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.uuidV6Generator.resultsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextArea
              aria-label={m["common.passresultstitle"]()}
              value={output}
              readOnly
              rows={14}
              spellCheck={false}
              placeholder={m["tools.uuidV6Generator.resultsPlaceholder"]()}
              className="max-h-[min(32rem,60vh)] min-h-80 resize-y overflow-y-auto font-mono text-sm"
            />
            <p className="flex min-h-5 items-center gap-2 text-sm text-muted">
              <Clock3 aria-hidden className="size-4 shrink-0" />
              {generatedAt === null
                ? "-"
                : m["tools.uuidV6Generator.generatedAtLabel"]({
                    milliseconds: String(generatedAt),
                  })}
            </p>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ToolCopyButton
                value={output}
                copyLabel={m["common.actions.copyResult"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={!output}
                variant="ghost"
              />
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className={buttonVariants({ size: "sm", variant: "ghost" })}
                >
                  <Download aria-hidden className="size-4" />
                  {m["common.actions.download"]()}
                </a>
              ) : (
                <Button size="sm" variant="ghost" isDisabled>
                  <Download aria-hidden className="size-4" />
                  {m["common.actions.download"]()}
                </Button>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => setGenerationVersion((value) => value + 1)}
            >
              <RefreshCw aria-hidden className="size-4" />
              {m["common.ksuidRegenerate"]()}
            </Button>
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>
      <ToolArticle>
        <p>{m["tools.uuidV6Generator.articleIntro"]()}</p>
        <h2>{m["tools.uuidV6Generator.articleHelpsTitle"]()}</h2>
        <p>{m["tools.uuidV6Generator.articleHelpsBody"]()}</p>
        <h2>{m["tools.uuidV6Generator.articlePrivacyTitle"]()}</h2>
        <p>{m["tools.uuidV6Generator.articlePrivacyBody"]()}</p>
        <h2>{m["tools.uuidV6Generator.articleSequenceTitle"]()}</h2>
        <p>{m["tools.uuidV6Generator.articleSequenceBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function Field({
  label,
  description,
  error,
  children,
}: {
  label: string;
  description?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label}</p>
      {children}
      {description ? <p className="text-sm text-muted">{description}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

function ModeField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Mode;
  options: readonly (readonly [Mode, string])[];
  onChange: (value: Mode) => void;
}) {
  return (
    <Field label={label}>
      <ToggleButtonGroup
        selectionMode="single"
        selectedKeys={new Set([value])}
        aria-label={label}
        className="w-full flex-wrap justify-start"
        onSelectionChange={(keys) => {
          const next = String([...keys][0] ?? "");
          const option = options.find(([candidate]) => candidate === next);
          if (option) onChange(option[0]);
        }}
      >
        {options.map(([key, optionLabel]) => (
          <ToggleButton key={key} id={key} className="min-h-11 flex-1">
            {optionLabel}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Field>
  );
}

export default function UuidV6Generator() {
  return (
    <ToolPage instructions={m["tools.uuidV6Generator.usage"]()}>
      <UuidV6GeneratorContent />
    </ToolPage>
  );
}
