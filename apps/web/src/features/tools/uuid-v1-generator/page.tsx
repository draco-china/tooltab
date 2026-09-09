import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Input,
  InputGroup,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Clock3, Download, RefreshCw } from "lucide-react";
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
import { getLocale } from "@/paraglide/runtime.js";
import {
  generateUuidV1Batch,
  normalizeMacAddress,
  normalizeUuidV1ClockSequence,
  normalizeUuidV1Count,
  parseMacAddress,
  randomMacAddress,
  randomUuidV1ClockSequence,
  UUID_V1_MAX_CLOCK_SEQUENCE,
  UUID_V1_MAX_COUNT,
} from "@workspace/tools/uuid/v1";

type GenerationMode = "single" | "batch";

const STORAGE_KEYS = {
  generationMode: "tools:uuid-v1-generator:generation-mode",
  count: "tools:uuid-v1-generator:count",
  macAddress: "tools:uuid-v1-generator:mac-address",
  clockSequence: "tools:uuid-v1-generator:clock-sequence",
} as const;

function UuidV1GeneratorContent() {
  const locale = getLocale();
  const id = useId();
  const [mode, setMode] = useState<GenerationMode>("single");
  const [count, setCount] = useState(10);
  const [macAddress, setMacAddress] = useState("02:00:00:00:00:00");
  const [clockSequence, setClockSequence] = useState(0);
  const [ready, setReady] = useState(false);
  const [generationVersion, setGenerationVersion] = useState(0);
  const [output, setOutput] = useState("");
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    const storedMode = safeLocalStorage.getItem(STORAGE_KEYS.generationMode);
    const storedCount = Number(safeLocalStorage.getItem(STORAGE_KEYS.count));
    const storedMac = safeLocalStorage.getItem(STORAGE_KEYS.macAddress);
    const storedSequence = Number(
      safeLocalStorage.getItem(STORAGE_KEYS.clockSequence),
    );
    const restoredCount =
      Number.isFinite(storedCount) && storedCount > 0
        ? normalizeUuidV1Count(storedCount)
        : 10;
    if (storedMode === "single" || storedMode === "batch") setMode(storedMode);
    else if (
      restoredCount > 1 &&
      safeLocalStorage.getItem(STORAGE_KEYS.count) !== null
    )
      setMode("batch");
    setCount(Math.max(2, restoredCount));
    setMacAddress(
      storedMac
        ? (normalizeMacAddress(storedMac) ?? randomMacAddress())
        : randomMacAddress(),
    );
    setClockSequence(
      Number.isFinite(storedSequence) &&
        safeLocalStorage.getItem(STORAGE_KEYS.clockSequence) !== null
        ? normalizeUuidV1ClockSequence(storedSequence)
        : randomUuidV1ClockSequence(),
    );
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    safeLocalStorage.setItem(STORAGE_KEYS.generationMode, mode);
    safeLocalStorage.setItem(STORAGE_KEYS.count, String(count));
    safeLocalStorage.setItem(STORAGE_KEYS.macAddress, macAddress);
    safeLocalStorage.setItem(STORAGE_KEYS.clockSequence, String(clockSequence));
  }, [clockSequence, count, macAddress, mode, ready]);

  const node = useMemo(() => parseMacAddress(macAddress), [macAddress]);
  const macError =
    macAddress.trim() === ""
      ? m["tools.uuidV1Generator.macAddressRequired"]()
      : node === null
        ? m["tools.uuidV1Generator.macAddressInvalid"]()
        : "";
  const effectiveCount = mode === "single" ? 1 : count;

  useEffect(() => {
    void generationVersion;
    if (!ready || !node) {
      setOutput("");
      setGeneratedAt(null);
      return;
    }
    const nextGeneratedAt = Date.now();
    startTransition(() => {
      setGeneratedAt(nextGeneratedAt);
      setOutput(
        generateUuidV1Batch(effectiveCount, {
          msecs: nextGeneratedAt,
          node,
          clockSequence,
        }).join("\n"),
      );
    });
  }, [clockSequence, effectiveCount, generationVersion, node, ready]);

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

  const generatedAtText =
    generatedAt === null
      ? "-"
      : m["tools.uuidV1Generator.generatedAtLabel"]({
          time: new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "medium",
          }).format(new Date(generatedAt)),
        });
  const downloadName =
    generatedAt === null
      ? "uuid-v1.txt"
      : mode === "single"
        ? `uuid-v1-${generatedAt}.txt`
        : `uuid-v1-batch-${effectiveCount}-${generatedAt}.txt`;

  return (
    <div className="grid gap-10">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.aesTools.encryptoptionscardtitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.uuidV1Generator.optionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            <Field
              label={m["common.catalogToolUlidGeneratorGenerationModeLabel"]()}
              description={m["tools.uuidV1Generator.modeDescription"]()}
            >
              <ToggleButtonGroup
                selectionMode="single"
                selectedKeys={new Set([mode])}
                aria-label={m[
                  "common.catalogToolUlidGeneratorGenerationModeLabel"
                ]()}
                className="w-full"
                onSelectionChange={(keys) => {
                  const value = String([...keys][0] ?? "");
                  if (value === "single" || value === "batch") setMode(value);
                }}
              >
                <ToggleButton id="single" className="flex-1">
                  {m["shared.shortId.single"]()}
                </ToggleButton>
                <ToggleButton id="batch" className="flex-1">
                  {m["shared.shortId.batch"]()}
                </ToggleButton>
              </ToggleButtonGroup>
            </Field>

            {mode === "batch" ? (
              <Field
                label={m["tools.cuid2Generator.countLabel"]()}
                description={m["tools.uuidV1Generator.countDescription"]()}
              >
                <Input
                  id={`${id}-count`}
                  aria-label={m["tools.cuid2Generator.countLabel"]()}
                  type="number"
                  min={2}
                  max={UUID_V1_MAX_COUNT}
                  value={String(count)}
                  onChange={(event) =>
                    setCount(
                      Math.max(
                        2,
                        normalizeUuidV1Count(Number(event.currentTarget.value)),
                      ),
                    )
                  }
                />
              </Field>
            ) : null}

            <Field
              label={m["tools.uuidV1Generator.clockSequenceLabel"]()}
              description={m[
                "tools.uuidV1Generator.clockSequenceDescription"
              ]()}
            >
              <InputGroup variant="secondary" fullWidth>
                <InputGroup.Input
                  id={`${id}-clock-sequence`}
                  aria-label={m["tools.uuidV1Generator.clockSequenceLabel"]()}
                  type="number"
                  min={0}
                  max={UUID_V1_MAX_CLOCK_SEQUENCE}
                  value={String(clockSequence)}
                  onChange={(event) =>
                    setClockSequence(
                      normalizeUuidV1ClockSequence(
                        Number(event.currentTarget.value),
                      ),
                    )
                  }
                />
                <InputGroup.Suffix>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={m[
                      "tools.uuidV1Generator.randomClockSequenceLabel"
                    ]()}
                    onPress={() =>
                      setClockSequence(randomUuidV1ClockSequence())
                    }
                  >
                    <RefreshCw aria-hidden className="size-4" />
                  </Button>
                </InputGroup.Suffix>
              </InputGroup>
            </Field>

            <Field
              label={m[
                "tools.macAddressToIpv6LinkLocalAddressConverter.macLabel"
              ]()}
              description={m["tools.uuidV1Generator.macAddressDescription"]()}
              error={macError}
            >
              <InputGroup
                variant="secondary"
                fullWidth
                isInvalid={Boolean(macError)}
              >
                <InputGroup.Input
                  id={`${id}-mac-address`}
                  aria-label={m[
                    "tools.macAddressToIpv6LinkLocalAddressConverter.macLabel"
                  ]()}
                  value={macAddress}
                  placeholder="02:00:00:00:00:00"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setMacAddress(event.currentTarget.value)}
                  onBlur={() => {
                    const normalized = normalizeMacAddress(macAddress);
                    if (normalized) setMacAddress(normalized);
                  }}
                />
                <InputGroup.Suffix>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={m[
                      "tools.uuidV1Generator.randomMacAddressLabel"
                    ]()}
                    onPress={() => setMacAddress(randomMacAddress())}
                  >
                    <RefreshCw aria-hidden className="size-4" />
                  </Button>
                </InputGroup.Suffix>
              </InputGroup>
            </Field>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.uuidV1Generator.resultsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextArea
              aria-label={m["common.passresultstitle"]()}
              value={output}
              readOnly
              rows={mode === "batch" ? 12 : 5}
              placeholder={m["tools.uuidV1Generator.resultsPlaceholder"]()}
              className={
                mode === "batch"
                  ? "max-h-[min(32rem,60vh)] min-h-80 resize-y overflow-y-auto font-mono text-sm"
                  : "max-h-[min(32rem,60vh)] min-h-36 resize-y overflow-y-auto font-mono text-sm"
              }
            />
            <p className="flex min-h-5 items-center gap-2 text-sm text-muted">
              <Clock3 aria-hidden className="size-4 shrink-0" />
              {generatedAtText}
            </p>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ToolCopyButton
                value={output}
                copyLabel={m["tools.uuidV1Generator.copyResultsLabel"]()}
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
      <UuidV1Article />
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
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function UuidV1Article() {
  return (
    <ToolArticle>
      <p>{m["tools.uuidV1Generator.articleSummary"]()}</p>
      <h2>{m["tools.uuidV1Generator.articleHelpsTitle"]()}</h2>
      <p>{m["tools.uuidV1Generator.articleHelpsBody"]()}</p>
      <h2>{m["tools.uuidV1Generator.articlePrivacyTitle"]()}</h2>
      <p>{m["tools.uuidV1Generator.articlePrivacyBody"]()}</p>
      <h2>{m["tools.uuidV1Generator.articleClockTitle"]()}</h2>
      <p>{m["tools.uuidV1Generator.articleClockBody"]()}</p>
    </ToolArticle>
  );
}

export default function UuidV1Generator() {
  return (
    <ToolPage instructions={m["tools.uuidV1Generator.usage"]()}>
      <UuidV1GeneratorContent />
    </ToolPage>
  );
}
