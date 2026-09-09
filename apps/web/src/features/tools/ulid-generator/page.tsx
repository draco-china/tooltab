import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Input,
  Skeleton,
  Switch,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Download, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import {
  generateShortIds,
  MAX_ULID_TIME,
  ShortIdError,
  ulidCalendarText,
  ulidCalendarTime,
} from "@workspace/tools/id/ulid";

type Mode = "single" | "batch";
type TimestampMode = "now" | "custom";

const STORAGE_KEY = "tools:ulid-generator:options";

function UlidGeneratorContent() {
  const id = useId();
  const [mode, setMode] = useState<Mode>("single");
  const [count, setCount] = useState("5");
  const [timestampMode, setTimestampMode] = useState<TimestampMode>("now");
  const [timestamp, setTimestamp] = useState(() => String(Date.now()));
  const [monotonic, setMonotonic] = useState(true);
  const [output, setOutput] = useState("");
  const [generatedTime, setGeneratedTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const revision = useRef(0);
  const activeGeneration = useRef<{
    controller: AbortController;
    timer: number;
  } | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) ?? "null",
      ) as Partial<{
        mode: Mode;
        count: string;
        timestampMode: TimestampMode;
        timestamp: string;
        monotonic: boolean;
      }> | null;
      if (!stored) return;
      if (stored.mode === "single" || stored.mode === "batch")
        setMode(stored.mode);
      if (typeof stored.count === "string") setCount(stored.count);
      if (stored.timestampMode === "now" || stored.timestampMode === "custom")
        setTimestampMode(stored.timestampMode);
      if (typeof stored.timestamp === "string") setTimestamp(stored.timestamp);
      if (typeof stored.monotonic === "boolean") setMonotonic(stored.monotonic);
    } catch {}
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode, count, timestampMode, timestamp, monotonic }),
    );
  }, [mode, count, timestampMode, timestamp, monotonic]);

  const generate = useCallback(
    (delay = 150) => {
      if (activeGeneration.current) {
        activeGeneration.current.controller.abort();
        window.clearTimeout(activeGeneration.current.timer);
      }
      const current = ++revision.current;
      const controller = new AbortController();
      setBusy(true);
      setError(null);
      const timer = window.setTimeout(() => {
        void (async () => {
          try {
            const amount = mode === "single" ? 1 : Number(count);
            if (
              !Number.isInteger(amount) ||
              (mode === "batch" && (amount < 2 || amount > 100))
            )
              throw new ShortIdError("invalid-count");
            if (timestampMode === "custom" && !/^\d+$/.test(timestamp))
              throw new ShortIdError("invalid-time");
            const result = await generateShortIds(
              "ulid",
              {
                count: amount,
                timestamp:
                  timestampMode === "custom" ? Number(timestamp) : undefined,
                monotonic: mode === "batch" && monotonic,
              },
              controller.signal,
            );
            if (revision.current !== current) return;
            setOutput(result.ids.join("\n"));
            setGeneratedTime(result.timestamp);
          } catch (cause) {
            if (controller.signal.aborted || revision.current !== current)
              return;
            setOutput("");
            setGeneratedTime(null);
            setError(
              cause instanceof ShortIdError ? cause.code : "generation-failed",
            );
          } finally {
            if (!controller.signal.aborted && revision.current === current)
              setBusy(false);
          }
        })();
      }, delay);
      activeGeneration.current = { controller, timer };
    },
    [mode, count, timestampMode, timestamp, monotonic],
  );

  useEffect(() => {
    generate();
    return () => {
      if (!activeGeneration.current) return;
      activeGeneration.current.controller.abort();
      window.clearTimeout(activeGeneration.current.timer);
    };
  }, [generate]);

  const errorMessage =
    error === "invalid-time"
      ? !/^\d+$/.test(timestamp)
        ? m["tools.ksuidGenerator.timestampInvalid"]()
        : m["tools.ulidGenerator.timestampOutOfRange"]({
            min: "0",
            max: String(MAX_ULID_TIME),
          })
      : error
        ? m["tools.ulidGenerator.generationFailed"]()
        : null;

  function download() {
    if (!output) return;
    const url = URL.createObjectURL(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ulid.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-8">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.aesTools.encryptoptionscardtitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.ulidGenerator.optionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            <Field
              label={m["common.catalogToolUlidGeneratorGenerationModeLabel"]()}
              description={m["tools.ulidGenerator.generationModeDescription"]()}
            >
              <ToggleButtonGroup
                selectionMode="single"
                selectedKeys={new Set([mode])}
                aria-label={m[
                  "common.catalogToolUlidGeneratorGenerationModeLabel"
                ]()}
                className="w-full"
                onSelectionChange={(selection) => {
                  const next = String([...selection][0] ?? "");
                  if (next === "single" || next === "batch") setMode(next);
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

            {mode === "batch" && (
              <Field
                label={m["tools.cuid2Generator.countLabel"]()}
                description={m["tools.ulidGenerator.countDescription"]()}
              >
                <Input
                  id={`${id}-count`}
                  aria-label={m["tools.cuid2Generator.countLabel"]()}
                  type="number"
                  min={2}
                  max={100}
                  value={count}
                  onChange={(event) => setCount(event.currentTarget.value)}
                />
              </Field>
            )}

            <Field
              label={m["tools.ksuidGenerator.timestampModeLabel"]()}
              description={m["tools.ulidGenerator.timestampModeDescription"]()}
            >
              <ToggleButtonGroup
                selectionMode="single"
                selectedKeys={new Set([timestampMode])}
                aria-label={m["tools.ksuidGenerator.timestampModeLabel"]()}
                className="w-full"
                onSelectionChange={(selection) => {
                  const next = String([...selection][0] ?? "");
                  if (next === "now" || next === "custom")
                    setTimestampMode(next);
                }}
              >
                <ToggleButton id="now" className="flex-1">
                  {m["tools.ksuidGenerator.timestampNowLabel"]()}
                </ToggleButton>
                <ToggleButton id="custom" className="flex-1">
                  {m["common.ksuidCustom"]()}
                </ToggleButton>
              </ToggleButtonGroup>
            </Field>

            {timestampMode === "custom" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={m["tools.ksuidGenerator.customDateTimeLabel"]()}>
                  <Input
                    aria-label={m["tools.ksuidGenerator.customDateTimeLabel"]()}
                    type="datetime-local"
                    step="0.001"
                    value={
                      /^\d+$/.test(timestamp)
                        ? ulidCalendarText(Number(timestamp))
                        : ""
                    }
                    onChange={(event) => {
                      try {
                        setTimestamp(
                          String(ulidCalendarTime(event.currentTarget.value)),
                        );
                      } catch {
                        setTimestamp("");
                      }
                    }}
                  />
                </Field>
                <Field
                  label={m[
                    "common.catalogToolUlidGeneratorCustomUnixMillisecondsLabel"
                  ]()}
                >
                  <Input
                    aria-label={m[
                      "common.catalogToolUlidGeneratorCustomUnixMillisecondsLabel"
                    ]()}
                    inputMode="numeric"
                    value={timestamp}
                    onChange={(event) =>
                      setTimestamp(event.currentTarget.value)
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="tertiary"
                  className="sm:col-span-2 sm:justify-self-start"
                  onClick={() => setTimestamp(String(Date.now()))}
                >
                  {m["tools.uuidV7Generator.setNow"]()}
                </Button>
              </div>
            )}

            {mode === "batch" && (
              <Switch
                isSelected={monotonic}
                onChange={(selected) => setMonotonic(selected === true)}
              >
                <Switch.Content className="flex min-h-11 items-center justify-between gap-4">
                  <span className="grid gap-1">
                    <span className="font-medium">
                      {m["tools.ulidGenerator.monotonicBatchLabel"]()}
                    </span>
                    <span className="text-sm text-muted">
                      {m["tools.ulidGenerator.monotonicBatchDescription"]()}
                    </span>
                  </span>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            )}

            {errorMessage && (
              <p role="alert" className="text-sm text-danger">
                {errorMessage}
              </p>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
              <Card.Description>
                {m["tools.ulidGenerator.resultsDescription"]()}
              </Card.Description>
            </div>
            <ToolPanelActionGroup className="shrink-0 sm:justify-end">
              <Button
                type="button"
                variant="tertiary"
                isDisabled={busy}
                onClick={() => generate(0)}
              >
                <RefreshCw aria-hidden className="size-4" />
                {m["common.ksuidRegenerate"]()}
              </Button>
              <ToolCopyButton
                value={output}
                copyLabel={m["common.actions.copyResult"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={!output || busy}
              />
              <Button
                type="button"
                variant="tertiary"
                isDisabled={!output || busy}
                onClick={download}
              >
                <Download aria-hidden className="size-4" />
                {m["common.actions.download"]()}
              </Button>
            </ToolPanelActionGroup>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4" aria-busy={busy}>
            {busy ? (
              <div
                role="status"
                aria-label={m["common.passresultstitle"]()}
                className="grid gap-3"
              >
                <Skeleton className="h-72 rounded-xl" />
                <Skeleton className="h-5 w-72 max-w-full rounded-lg" />
              </div>
            ) : (
              <>
                <TextArea
                  aria-label={m["common.passresultstitle"]()}
                  readOnly
                  value={output}
                  placeholder={m["tools.ulidGenerator.resultsPlaceholder"]()}
                  className="min-h-72 resize-y font-mono text-sm"
                />
                {generatedTime !== null && output && (
                  <p className="text-sm text-muted">
                    {m["tools.ulidGenerator.generatedAtLabel"]({
                      milliseconds: String(generatedTime),
                    })}
                  </p>
                )}
              </>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <UlidArticle />
    </div>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-1 text-sm text-muted">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function UlidArticle() {
  return (
    <ToolArticle>
      <p>{m["tools.ulidGenerator.articleSummary"]()}</p>
      <h2>{m["tools.ulidGenerator.articleWhyTitle"]()}</h2>
      <p>{m["tools.ulidGenerator.articleWhyBody"]()}</p>
      <h2>{m["tools.ulidGenerator.articleTimeTitle"]()}</h2>
      <p>{m["tools.ulidGenerator.articleTimeBody"]()}</p>
      <h2>{m["tools.ulidGenerator.articleMonotonicTitle"]()}</h2>
      <p>{m["tools.ulidGenerator.articleMonotonicBody"]()}</p>
    </ToolArticle>
  );
}

export function UlidGenerator() {
  return (
    <ToolPage instructions={m["tools.ulidGenerator.usage"]()}>
      <UlidGeneratorContent />
    </ToolPage>
  );
}

export default UlidGenerator;
