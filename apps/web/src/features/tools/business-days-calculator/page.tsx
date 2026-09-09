import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Card,
  Chip,
  Input,
  Label,
  Switch,
  TextArea,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { businessDays } from "@workspace/tools/time/business-days";

const BUSINESS_DAY_STORAGE_KEYS = {
  start: "tools:business-days-calculator:start-date",
  end: "tools:business-days-calculator:end-date",
  base: "tools:business-days-calculator:base-date",
  offset: "tools:business-days-calculator:day-offset",
  endpoints: "tools:business-days-calculator:include-endpoints",
  includeStart: "tools:business-days-calculator:include-start",
  mode: "tools:business-days-calculator:weekday-mode",
  weekends: "tools:business-days-calculator:weekend-days",
  holidays: "tools:business-days-calculator:holiday-input",
} as const;

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

function Check({
  label,
  value,
  change,
}: {
  label: string;
  value: boolean;
  change: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-2">
      <Switch
        id={id}
        isSelected={value}
        onChange={(selected) => change(selected === true)}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <span>{label}</span>
        </Switch.Content>
      </Switch>
    </div>
  );
}

function localISODate(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function normalizedWeekends(value: unknown, fallback = [0, 6]) {
  const values = Array.isArray(value) ? value : fallback;
  return [
    ...new Set(
      values
        .map(Number)
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ].sort((a, b) => a - b);
}

function storedString(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function storedBoolean(key: string, fallback: boolean) {
  const value = storedString(key, String(fallback));
  return value === "true" ? true : value === "false" ? false : fallback;
}

function storedWeekends() {
  try {
    const value = window.localStorage.getItem(
      BUSINESS_DAY_STORAGE_KEYS.weekends,
    );
    return value ? normalizedWeekends(JSON.parse(value)) : [0, 6];
  } catch {
    return [0, 6];
  }
}

function inspectHolidayInput(input: string) {
  try {
    const result = businessDays("2000-01-01", "2000-01-01", "2000-01-01", 0, {
      weekendDays: [],
      holidays: input,
    });
    const invalidLines = new Set(
      result.invalidHolidays.map((entry) => entry.line),
    );
    const validDates = new Set(
      input
        .split(/\r\n|\r|\n/)
        .map((value, index) => ({ value: value.trim(), line: index + 1 }))
        .filter(({ value, line }) => value && !invalidLines.has(line))
        .map(({ value }) => value),
    );
    return {
      error: null,
      invalidCount: result.invalidHolidays.length,
      validCount: validDates.size,
    };
  } catch (error) {
    return { error, invalidCount: 0, validCount: 0 };
  }
}

function BusinessPanelHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="grid gap-1">
        <Card.Title>{title}</Card.Title>
        {description ? (
          <Card.Description>{description}</Card.Description>
        ) : null}
      </div>
      {action}
    </Card.Header>
  );
}

function BusinessDateField({
  label,
  value,
  testId,
  onChange,
}: {
  label: string;
  value: string;
  testId: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField className="gap-2">
      <Label>{label}</Label>
      <Input
        type="date"
        value={value}
        autoComplete="off"
        className="min-h-11 font-mono"
        data-testid={testId}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </TextField>
  );
}

function BusinessOffsetField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField className="gap-2">
      <Label>{m["shared.dateTools.businessdays"]()}</Label>
      <Input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        value={value}
        autoComplete="off"
        className="min-h-11 font-mono"
        data-testid="business-days-offset-input"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </TextField>
  );
}

function BusinessResultStat({
  label,
  value,
  prominent = false,
  testId,
}: {
  label: string;
  value: string;
  prominent?: boolean;
  testId: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        prominent
          ? "border-accent/30 bg-accent/5"
          : "border-border bg-default/30"
      }`}
    >
      <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
        {label}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p
          className="text-3xl font-semibold tracking-tight"
          data-testid={testId}
        >
          {value || "—"}
        </p>
        <ToolCopyButton
          value={value}
          copyLabel={m["common.actions.copy"]()}
          copiedLabel={m["common.actions.copied"]()}
          variant="ghost"
          disabled={!value}
        />
      </div>
    </div>
  );
}

function BusinessDateResult({
  title,
  value,
  testId,
}: {
  title: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-default/30 p-4">
      <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
        {title}
      </p>
      <p className="mt-3 text-xs font-medium text-muted">
        {m["tools.businessDaysCalculator.resultDateLabel"]()}
      </p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p
          className="text-xl font-semibold tracking-tight"
          data-testid={testId}
        >
          {value || "—"}
        </p>
        <ToolCopyButton
          value={value}
          copyLabel={m["common.actions.copy"]()}
          copiedLabel={m["common.actions.copied"]()}
          variant="ghost"
          disabled={!value}
        />
      </div>
    </div>
  );
}

function BusinessDaysCalculatorContent() {
  const holidaysId = useId();
  const [restored, setRestored] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [base, setBase] = useState("");
  const [offset, setOffset] = useState("5");
  const [weekends, setWeekends] = useState<number[]>([0, 6]);
  const [mode, setMode] = useState<"weekend" | "working">("weekend");
  const [holidays, setHolidays] = useState("");
  const [endpoints, setEndpoints] = useState(true);
  const [includeStart, setIncludeStart] = useState(false);

  useEffect(() => {
    const today = new Date();
    const endDefault = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 14,
    );
    const todayValue = localISODate(today);
    setStart(storedString(BUSINESS_DAY_STORAGE_KEYS.start, todayValue));
    setEnd(
      storedString(BUSINESS_DAY_STORAGE_KEYS.end, localISODate(endDefault)),
    );
    setBase(storedString(BUSINESS_DAY_STORAGE_KEYS.base, todayValue));
    setOffset(storedString(BUSINESS_DAY_STORAGE_KEYS.offset, "5"));
    setEndpoints(storedBoolean(BUSINESS_DAY_STORAGE_KEYS.endpoints, true));
    setIncludeStart(
      storedBoolean(BUSINESS_DAY_STORAGE_KEYS.includeStart, false),
    );
    setMode(
      storedString(BUSINESS_DAY_STORAGE_KEYS.mode, "weekend") === "working"
        ? "working"
        : "weekend",
    );
    setWeekends(storedWeekends());
    setHolidays(storedString(BUSINESS_DAY_STORAGE_KEYS.holidays, ""));
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(BUSINESS_DAY_STORAGE_KEYS.start, start);
      window.localStorage.setItem(BUSINESS_DAY_STORAGE_KEYS.end, end);
      window.localStorage.setItem(BUSINESS_DAY_STORAGE_KEYS.base, base);
      window.localStorage.setItem(BUSINESS_DAY_STORAGE_KEYS.offset, offset);
      window.localStorage.setItem(
        BUSINESS_DAY_STORAGE_KEYS.endpoints,
        String(endpoints),
      );
      window.localStorage.setItem(
        BUSINESS_DAY_STORAGE_KEYS.includeStart,
        String(includeStart),
      );
      window.localStorage.setItem(BUSINESS_DAY_STORAGE_KEYS.mode, mode);
      window.localStorage.setItem(
        BUSINESS_DAY_STORAGE_KEYS.weekends,
        JSON.stringify(weekends),
      );
      window.localStorage.setItem(BUSINESS_DAY_STORAGE_KEYS.holidays, holidays);
    } catch {
      // Storage is optional; calculations stay fully local and usable without it.
    }
  }, [
    base,
    end,
    endpoints,
    holidays,
    includeStart,
    mode,
    offset,
    restored,
    start,
    weekends,
  ]);

  const selectedDays =
    mode === "weekend"
      ? weekends
      : WEEKDAYS.filter((day) => !weekends.includes(day));
  const workingDayCount = 7 - weekends.length;
  const parsedOffset = Number(offset);
  const normalizedOffset =
    Number.isFinite(parsedOffset) && parsedOffset >= 0
      ? Math.trunc(parsedOffset)
      : 0;
  const holidaySummary = useMemo(
    () => inspectHolidayInput(holidays),
    [holidays],
  );
  let countResult: ReturnType<typeof businessDays> | null = null;
  let offsetResult: ReturnType<typeof businessDays> | null = null;
  let countError: unknown;
  let offsetError: unknown;

  if (restored && start && end) {
    try {
      countResult = businessDays(
        start,
        end,
        start,
        0,
        { weekendDays: weekends, holidays },
        endpoints,
      );
    } catch (error) {
      countError = error;
    }
  }
  if (restored && base) {
    try {
      offsetResult = businessDays(
        base,
        base,
        base,
        normalizedOffset,
        { weekendDays: weekends, holidays },
        true,
        includeStart,
      );
    } catch (error) {
      offsetError = error;
    }
  }

  const invalidHolidayCount = holidaySummary.invalidCount;
  const holidayCount = holidaySummary.validCount;

  return (
    <div className="grid gap-8">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
        data-tool-panels
      >
        <ToolPanelCard data-testid="business-days-rules-card">
          <BusinessPanelHeader
            title={m["tools.businessDaysCalculator.articleRulesTitle"]()}
            description={
              mode === "weekend"
                ? m["tools.businessDaysCalculator.articleRulesItems1"]()
                : m["tools.businessDaysCalculator.articleRulesItems2"]()
            }
            action={
              <div className="flex flex-wrap gap-2">
                <Chip size="sm" variant="soft">
                  {workingDayCount}/7 {m["shared.dateTools.working"]()}
                </Chip>
                <Chip size="sm" variant="soft">
                  {holidayCount}{" "}
                  {m["tools.businessDaysCalculator.holidaysLabel"]()}
                </Chip>
              </div>
            }
          />
          <ToolPanelCardContent className="gap-6 py-4">
            <div className="grid gap-2">
              <span className="text-sm font-medium">
                {m["shared.dateTools.selectBy"]()}
              </span>
              <ToggleButtonGroup
                selectionMode="single"
                aria-label={m["shared.dateTools.selectBy"]()}
                selectedKeys={new Set([mode])}
                className="grid w-full grid-cols-2 [&_button]:min-h-11"
                onSelectionChange={(selection) => {
                  const value = String([...selection][0] ?? "");
                  if (value === "weekend" || value === "working") {
                    setMode(value);
                  }
                }}
              >
                <ToggleButton id="weekend">
                  {m["tools.businessDaysCalculator.weekendDaysLabel"]()}
                </ToggleButton>
                <ToggleButton id="working">
                  {m["shared.dateTools.working"]()}
                </ToggleButton>
              </ToggleButtonGroup>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium">
                {mode === "weekend"
                  ? m["tools.businessDaysCalculator.weekendDaysLabel"]()
                  : m["shared.dateTools.working"]()}
              </span>
              <ToggleButtonGroup
                selectionMode="multiple"
                aria-label={
                  mode === "weekend"
                    ? m["tools.businessDaysCalculator.weekendDaysLabel"]()
                    : m["shared.dateTools.working"]()
                }
                selectedKeys={new Set(selectedDays.map(String))}
                className="grid w-full grid-cols-7 [&_button]:min-h-11 [&_button]:min-w-0 [&_button]:px-1"
                onSelectionChange={(selection) => {
                  const next = normalizedWeekends(
                    [...selection].map((value) => Number(value)),
                    [],
                  );
                  setWeekends(
                    mode === "weekend"
                      ? next
                      : WEEKDAYS.filter((day) => !next.includes(day)),
                  );
                }}
              >
                {(
                  [
                    m["shared.dateTools.weekday0"](),
                    m["shared.dateTools.weekday1"](),
                    m["shared.dateTools.weekday2"](),
                    m["shared.dateTools.weekday3"](),
                    m["shared.dateTools.weekday4"](),
                    m["shared.dateTools.weekday5"](),
                    m["shared.dateTools.weekday6"](),
                  ] as const
                ).map((label, day) => (
                  <ToggleButton
                    key={label}
                    id={String(day)}
                    aria-label={label}
                    data-testid={`weekday-toggle-${day}`}
                  >
                    {label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {workingDayCount === 0 ? (
                <p role="alert" className="text-sm text-danger">
                  {m["tools.businessDaysCalculator.noWorkingDaysLabel"]()}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor={holidaysId}>
                {m["tools.businessDaysCalculator.holidaysLabel"]()}
              </label>
              <TextArea
                id={holidaysId}
                value={holidays}
                placeholder={m[
                  "tools.businessDaysCalculator.holidayPlaceholder"
                ]()}
                rows={5}
                className="min-h-28 resize-y font-mono text-sm"
                spellCheck={false}
                aria-invalid={invalidHolidayCount > 0 || undefined}
                data-testid="holiday-input"
                onChange={(event) => setHolidays(event.currentTarget.value)}
              />
              <p className="text-sm text-muted">
                {m["tools.businessDaysCalculator.holidayHint"]()}
              </p>
              <p className="text-sm text-muted">
                {m["tools.businessDaysCalculator.articleRulesItems4"]()}
              </p>
              {invalidHolidayCount > 0 ? (
                <p role="alert" className="text-sm text-danger">
                  {m["tools.businessDaysCalculator.invalidHolidaysLabel"]({
                    count: String(invalidHolidayCount),
                  })}
                </p>
              ) : null}
              <ErrorText error={holidaySummary.error} />
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <div className="grid gap-6">
          <ToolPanelCard data-testid="business-days-count-card">
            <BusinessPanelHeader
              title={m["tools.businessDaysCalculator.articleCountTitle"]()}
              description={
                countResult?.isReversed
                  ? m["tools.businessDaysCalculator.rangeSwappedLabel"]()
                  : undefined
              }
            />
            <ToolPanelCardContent className="gap-6 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <BusinessDateField
                  label={m["common.icalStartDate"]()}
                  value={start}
                  testId="start-date-input"
                  onChange={setStart}
                />
                <BusinessDateField
                  label={m["common.icalEndDate"]()}
                  value={end}
                  testId="end-date-input"
                  onChange={setEnd}
                />
              </div>
              <Check
                label={m["tools.businessDaysCalculator.articleCountItems1"]()}
                value={endpoints}
                change={setEndpoints}
              />
              <ErrorText error={holidaySummary.error ? null : countError} />
              <div className="grid gap-4 sm:grid-cols-2">
                <BusinessResultStat
                  label={m["tools.businessDaysCalculator.articleCountItems2"]()}
                  value={countResult ? String(countResult.businessDays) : ""}
                  prominent
                  testId="business-days-result"
                />
                <BusinessResultStat
                  label={m["shared.dateTools.totaldays"]()}
                  value={countResult ? String(countResult.totalDays) : ""}
                  testId="total-days-result"
                />
                <BusinessResultStat
                  label={m["tools.businessDaysCalculator.articleCountItems4"]()}
                  value={countResult ? String(countResult.weekendDays) : ""}
                  testId="weekend-days-result"
                />
                <BusinessResultStat
                  label={m["tools.businessDaysCalculator.articleCountItems5"]()}
                  value={countResult ? String(countResult.holidayDays) : ""}
                  testId="holiday-days-result"
                />
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard data-testid="business-days-offset-card">
            <BusinessPanelHeader
              title={m["tools.businessDaysCalculator.articleOffsetTitle"]()}
            />
            <ToolPanelCardContent className="gap-6 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <BusinessDateField
                  label={m[
                    "tools.businessDaysCalculator.articleOffsetItems0"
                  ]()}
                  value={base}
                  testId="base-date-input"
                  onChange={setBase}
                />
                <BusinessOffsetField value={offset} onChange={setOffset} />
              </div>
              <Check
                label={m["tools.businessDaysCalculator.articleOffsetItems2"]()}
                value={includeStart}
                change={setIncludeStart}
              />
              {workingDayCount === 0 ? (
                <p role="alert" className="text-sm text-danger">
                  {m["tools.businessDaysCalculator.noWorkingDaysLabel"]()}
                </p>
              ) : null}
              <ErrorText error={holidaySummary.error ? null : offsetError} />
              <div className="grid gap-4 sm:grid-cols-2">
                <BusinessDateResult
                  title={m["tools.businessDaysCalculator.addLabel"]()}
                  value={offsetResult?.add ?? ""}
                  testId="add-date-result"
                />
                <BusinessDateResult
                  title={m["tools.businessDaysCalculator.subtractLabel"]()}
                  value={offsetResult?.subtract ?? ""}
                  testId="subtract-date-result"
                />
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>
      </div>

      <ToolArticle>
        <h2>{m["tools.businessDaysCalculator.articleWhatTitle"]()}</h2>
        <p>{m["tools.businessDaysCalculator.articleWhatBody"]()}</p>
        <h2>{m["tools.businessDaysCalculator.articleRulesTitle"]()}</h2>
        <p>{m["tools.businessDaysCalculator.articleRulesBody"]()}</p>
        <ul>
          {(
            [
              m["tools.businessDaysCalculator.articleRulesItems0"](),
              m["tools.businessDaysCalculator.articleRulesItems1"](),
              m["tools.businessDaysCalculator.articleRulesItems2"](),
              m["tools.businessDaysCalculator.articleRulesItems3"](),
              m["tools.businessDaysCalculator.articleRulesItems4"](),
            ] as const
          ).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.businessDaysCalculator.articleCountTitle"]()}</h2>
        <p>{m["tools.businessDaysCalculator.articleCountBody"]()}</p>
        <ul>
          {(
            [
              m["tools.businessDaysCalculator.articleCountItems0"](),
              m["tools.businessDaysCalculator.articleCountItems1"](),
              m["tools.businessDaysCalculator.articleCountItems2"](),
              m["shared.dateTools.totaldays"](),
              m["tools.businessDaysCalculator.articleCountItems4"](),
              m["tools.businessDaysCalculator.articleCountItems5"](),
            ] as const
          ).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.businessDaysCalculator.articleOffsetTitle"]()}</h2>
        <p>{m["tools.businessDaysCalculator.articleOffsetBody"]()}</p>
        <ul>
          {(
            [
              m["tools.businessDaysCalculator.articleOffsetItems0"](),
              m["shared.dateTools.businessdays"](),
              m["tools.businessDaysCalculator.articleOffsetItems2"](),
              m["tools.businessDaysCalculator.articleOffsetItems3"](),
            ] as const
          ).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export function BusinessDaysCalculator() {
  return (
    <ToolPage>
      <BusinessDaysCalculatorContent />
    </ToolPage>
  );
}
