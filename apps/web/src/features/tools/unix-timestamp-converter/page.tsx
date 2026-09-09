import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Input,
  InputGroup,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { getLocale } from "@/paraglide/runtime.js";
import {
  calendarTimestamp,
  formatTimestamp,
  relativeTimestamp,
  timestampResult,
  timestampValue,
  type TimestampUnit as CoreTimestampUnit,
} from "@workspace/tools/time/timestamp";
import { m } from "@/paraglide/messages.js";

type TimestampUnit = CoreTimestampUnit | "auto";

function UnixTimestampConverterContent() {
  const language = getLocale();
  const [timestampInput, setTimestampInput] = useState("");
  const [unit, setUnit] = useState<TimestampUnit>("auto");
  const [nowMs, setNowMs] = useState(0);
  const [dateError, setDateError] = useState(false);

  useEffect(() => {
    const initialNow = Date.now();
    setTimestampInput(String(initialNow));
    setNowMs(initialNow);
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: clear validation feedback whenever either input changes.
  useEffect(() => setDateError(false), [timestampInput, unit]);

  const result = useMemo(() => {
    try {
      const parsed = timestampValue(timestampInput, unit);
      const output = timestampResult(parsed.nanoseconds, "local");
      return {
        nanoseconds: parsed.nanoseconds,
        effectiveUnit: parsed.effectiveUnit,
        digitCount: parsed.digits,
        localDate: new Date(output.iso).toLocaleString(language, {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        dateInput: output.calendar,
        iso: output.iso,
        utc: output.utc,
        relative: relativeTimestamp(parsed.nanoseconds, nowMs, language),
      };
    } catch {
      return null;
    }
  }, [language, nowMs, timestampInput, unit]);

  function unitLabel(value: TimestampUnit) {
    if (value === "auto") return m["shared.pdfEditing.finishAuto"]();
    if (value === "seconds") return m["shared.dateTools.seconds"]();
    if (value === "milliseconds") return m["shared.dateTools.milliseconds"]();
    return m["common.unixnanoseconds"]();
  }

  function changeUnit(nextUnit: TimestampUnit) {
    if (result && nextUnit !== unit) {
      setTimestampInput(formatTimestamp(result.nanoseconds, nextUnit));
    }
    setUnit(nextUnit);
  }

  const details = [
    [m["tools.unixTimestampConverter.timestampLabel"](), timestampInput, true],
    [
      m["tools.unixTimestampConverter.dateTimeLabel"](),
      result?.localDate ?? "",
      true,
    ],
    [m["tools.durationCalculator.iso8601Label"](), result?.iso ?? "", true],
    [m["common.icalUtc"](), result?.utc ?? "", true],
    [
      m["tools.cronExpressionGenerator.nextRunsRelativeHeader"](),
      result?.relative ?? "—",
      false,
    ],
  ] as const;

  return (
    <div className="grid gap-6 xl:grid-cols-2" data-tool-panels>
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>
            {m["tools.unixTimestampConverter.timestampLabel"]()}
          </Card.Title>
          <Card.Description>
            {m["tools.unixTimestampConverter.usage"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="gap-6 py-4">
          <div className="grid gap-2">
            <InputGroup variant="secondary" fullWidth>
              <InputGroup.Input
                id="unix-timestamp-input"
                aria-label={m["tools.unixTimestampConverter.timestampLabel"]()}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!result}
                value={timestampInput}
                onChange={(event) => setTimestampInput(event.target.value)}
                placeholder={m[
                  "tools.unixTimestampConverter.timestampPlaceholder"
                ]()}
                className="font-mono text-sm"
              />
              <InputGroup.Suffix>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    setTimestampInput(
                      formatTimestamp(BigInt(Date.now()) * 1_000_000n, unit),
                    )
                  }
                >
                  <Clock3 aria-hidden className="size-4" />
                  {m["shared.dateTools.now"]()}
                </Button>
              </InputGroup.Suffix>
            </InputGroup>
            {timestampInput && !result ? (
              <p className="text-sm text-danger">
                {m["tools.unixTimestampConverter.invalidTimestamp"]()}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3">
            <p className="text-sm font-medium text-foreground">
              {m["common.unixunit"]()}
            </p>
            <ToggleButtonGroup
              aria-label={m["common.unixunit"]()}
              selectionMode="single"
              selectedKeys={new Set([unit])}
              onSelectionChange={(keys) => {
                const next = [...keys][0];
                if (next) changeUnit(String(next) as TimestampUnit);
              }}
              isDetached
              className="flex w-full flex-wrap gap-2"
            >
              {(
                ["auto", "seconds", "milliseconds", "nanoseconds"] as const
              ).map((value) => (
                <ToggleButton
                  key={value}
                  id={value}
                  className="border border-border px-3"
                >
                  {unitLabel(value)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <p className="text-sm text-muted">
              {unit === "auto" && result
                ? `${m["tools.unixTimestampConverter.detectedLabel"]()}: ${unitLabel(result.effectiveUnit)} (${new Intl.NumberFormat(language).format(result.digitCount)} ${m["tools.creditCardValidator.digitsLabel"]()})`
                : unitLabel(unit)}
            </p>
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="unix-date-time-input"
              className="text-sm font-medium"
            >
              {m["tools.unixTimestampConverter.dateTimeLabel"]()}
            </label>
            <Input
              id="unix-date-time-input"
              aria-label={m["tools.unixTimestampConverter.dateTimeLabel"]()}
              type="datetime-local"
              aria-invalid={dateError}
              step="0.001"
              disabled={!result}
              value={result?.dateInput ?? ""}
              onChange={(event) => {
                try {
                  const parsed = calendarTimestamp(event.target.value, "local");
                  setTimestampInput(formatTimestamp(parsed, unit));
                  setDateError(false);
                } catch {
                  setDateError(true);
                }
              }}
            />
            {dateError ? (
              <p role="alert" className="text-sm text-danger">
                {m["common.error"]()}
              </p>
            ) : null}
          </div>
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.unixTimestampConverter.dateTimeLabel"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          {details.map(([label, value, copyable]) => (
            <div
              key={label}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-separator pb-4 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted">{label}</p>
                <p className="font-mono text-sm break-all">{value || "—"}</p>
              </div>
              {copyable ? (
                <ToolCopyButton
                  value={value}
                  copyLabel={m["common.actions.copy"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  disabled={!result}
                  variant="ghost"
                />
              ) : null}
            </div>
          ))}
        </ToolPanelCardContent>
      </ToolPanelCard>
    </div>
  );
}

export default function UnixTimestampConverter() {
  return (
    <ToolPage instructions={m["tools.unixTimestampConverter.usage"]()}>
      <UnixTimestampConverterContent />
    </ToolPage>
  );
}
