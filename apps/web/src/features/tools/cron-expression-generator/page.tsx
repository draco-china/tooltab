import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  InputGroup,
  Label,
  ListBox,
  Select,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Clock3, RefreshCcw, Sparkles, TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  buildExpression,
  defaultForm,
  FIELD_LIMITS,
  FIELD_NAMES,
  type FieldName,
  type FieldState,
  formFromPreset,
  type PRESETS,
} from "@workspace/tools/time/cron";
import { inspectCron } from "../cron-tools/logic";

type CronResult = ReturnType<typeof inspectCron>;
type Calculation =
  | { status: "empty" }
  | { status: "ready"; result: CronResult }
  | { status: "error" };

const GENERATOR_STORAGE_KEY = "tools:cron-expression-generator:expression";
const GENERATOR_PRESETS = [
  "everyMinute",
  "everyFiveMinutes",
  "everyFifteenMinutes",
  "hourly",
  "dailyMidnight",
  "dailyNoon",
  "weekdaysMorning",
  "weeklySunday",
  "monthlyFirstDay",
] as const;

function generatorPresetLabel(id: (typeof GENERATOR_PRESETS)[number]) {
  switch (id) {
    case "everyMinute":
      return m["shared.cronTools.presetEveryMinute"]();
    case "everyFiveMinutes":
      return m["shared.cronTools.presetEveryFiveMinutes"]();
    case "everyFifteenMinutes":
      return m["shared.cronTools.presetEveryFifteenMinutes"]();
    case "hourly":
      return m["shared.cronTools.presetHourly"]();
    case "dailyMidnight":
      return m["shared.cronTools.presetDailyMidnight"]();
    case "dailyNoon":
      return m["shared.cronTools.presetDailyNoon"]();
    case "weekdaysMorning":
      return m["tools.cronExpressionGenerator.presetsItemsWeekdayMorning"]();
    case "weeklySunday":
      return m["tools.cronExpressionGenerator.presetsItemsWeeklySunday"]();
    case "monthlyFirstDay":
      return m["tools.cronExpressionGenerator.presetsItemsMonthlyFirstDay"]();
  }
}

function locale() {
  return getLocale() === "zh-CN" ? "zh-CN" : "en-US";
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function calculate(
  expression: string,
  count: number,
  nowMs: number,
): Calculation {
  if (!expression.trim()) return { status: "empty" };
  try {
    return {
      status: "ready",
      result: inspectCron(expression, {
        reference: new Date(nowMs).toISOString(),
        timeZone: browserTimeZone(),
        count,
        locale: locale(),
        hashSeed: "tooltab",
      }),
    };
  } catch {
    return { status: "error" };
  }
}

function formatDate(value: string, withSeconds = false) {
  return new Intl.DateTimeFormat(locale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  }).format(new Date(value));
}

function formatRelative(iso: string, nowMs: number) {
  const seconds = Math.max(0, Math.round((Date.parse(iso) - nowMs) / 1000));
  if (seconds < 60) return m["tools.cronExpressionGenerator.nextRunsSoon"]();
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return m["tools.cronExpressionGenerator.nextRunsInMinutes"]({
      count: minutes,
    });
  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return m["tools.cronExpressionGenerator.nextRunsInHours"]({ count: hours });
  return m["tools.cronExpressionGenerator.nextRunsInDays"]({
    count: Math.round(hours / 24),
  });
}

function ResultsSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="space-y-3"
    >
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-5/6" />
    </div>
  );
}

function CronTable({
  headings,
  rows,
}: {
  headings: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-136 border-separate border-spacing-0 text-sm">
        <thead className="bg-surface-secondary">
          <tr>
            {headings.map((heading) => (
              <th
                key={heading}
                className="border-b border-separator px-3 py-2 text-start font-medium"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[0])}>
              {row.map((value, index) => (
                <td
                  key={headings[index]}
                  className="border-b border-separator/60 px-3 py-2 align-top last:border-b-0"
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formFromExpression(expression: string) {
  const form = defaultForm();
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== FIELD_NAMES.length) return form;
  for (const [index, name] of FIELD_NAMES.entries()) {
    const part = parts[index] ?? "*";
    const state = form[name];
    if (part === "*") continue;
    if (/^\*\/\d+$/.test(part)) {
      state.mode = "interval";
      state.interval = Number(part.slice(2));
    } else if (/^\d+(?:,\d+)+$/.test(part)) {
      state.mode = "specific";
      state.specificValues = part.split(",").map(Number);
    } else if (/^\d+-\d+$/.test(part)) {
      state.mode = "range";
      [state.rangeStart, state.rangeEnd] = part.split("-").map(Number) as [
        number,
        number,
      ];
    } else if (/^\d+$/.test(part)) {
      state.mode = "specific";
      state.specificValues = [Number(part)];
    }
  }
  try {
    return buildExpression(form) === expression.trim() ? form : defaultForm();
  } catch {
    return defaultForm();
  }
}

const MONTH_VALUES = [
  m["tools.cronExpressionGenerator.valuesMonths0"](),
  m["tools.cronExpressionGenerator.valuesMonths1"](),
  m["tools.cronExpressionGenerator.valuesMonths2"](),
  m["tools.cronExpressionGenerator.valuesMonths3"](),
  m["tools.cronExpressionGenerator.valuesMonths4"](),
  m["tools.cronExpressionGenerator.valuesMonths5"](),
  m["tools.cronExpressionGenerator.valuesMonths6"](),
  m["tools.cronExpressionGenerator.valuesMonths7"](),
  m["tools.cronExpressionGenerator.valuesMonths8"](),
  m["tools.cronExpressionGenerator.valuesMonths9"](),
  m["tools.cronExpressionGenerator.valuesMonths10"](),
  m["tools.cronExpressionGenerator.valuesMonths11"](),
];
const WEEKDAY_VALUES = [
  m["shared.dateTools.weekday0"](),
  m["shared.dateTools.weekday1"](),
  m["shared.dateTools.weekday2"](),
  m["shared.dateTools.weekday3"](),
  m["shared.dateTools.weekday4"](),
  m["shared.dateTools.weekday5"](),
  m["shared.dateTools.weekday6"](),
];

function fieldValue(name: FieldName, value: number) {
  if (name === "month") return MONTH_VALUES[value - 1] ?? String(value);
  if (name === "dayOfWeek") return WEEKDAY_VALUES[value] ?? String(value);
  return String(value);
}

function fieldLabel(name: FieldName) {
  switch (name) {
    case "minute":
      return m["common.unitMinute"]();
    case "hour":
      return m["common.unitHour"]();
    case "dayOfMonth":
      return m["tools.cronExpressionGenerator.fieldsLabelsDayOfMonth"]();
    case "month":
      return m["common.icalMonth"]();
    case "dayOfWeek":
      return m["tools.cronExpressionGenerator.fieldsLabelsDayOfWeek"]();
  }
}

function fieldDescription(name: FieldName) {
  switch (name) {
    case "minute":
      return m["tools.cronExpressionGenerator.fieldsDescriptionsMinute"]();
    case "hour":
      return m["tools.cronExpressionGenerator.fieldsDescriptionsHour"]();
    case "dayOfMonth":
      return m["tools.cronExpressionGenerator.fieldsDescriptionsDayOfMonth"]();
    case "month":
      return m["tools.cronExpressionGenerator.fieldsDescriptionsMonth"]();
    case "dayOfWeek":
      return m["tools.cronExpressionGenerator.fieldsDescriptionsDayOfWeek"]();
  }
}

function fieldUnit(name: FieldName) {
  switch (name) {
    case "minute":
      return m["tools.cronExpressionGenerator.fieldsUnitsMinute"]();
    case "hour":
      return m["tools.cronExpressionGenerator.fieldsUnitsHour"]();
    case "dayOfMonth":
      return m["tools.cronExpressionGenerator.fieldsUnitsDay"]();
    case "month":
      return m["tools.cronExpressionGenerator.fieldsUnitsMonth"]();
    case "dayOfWeek":
      return m["tools.cronExpressionGenerator.fieldsUnitsWeekday"]();
  }
}

function fieldModeLabel(mode: "every" | "interval" | "specific" | "range") {
  switch (mode) {
    case "every":
      return m["tools.cronExpressionGenerator.fieldsEvery"]();
    case "interval":
      return m["common.icalInterval"]();
    case "specific":
      return m["tools.cronExpressionGenerator.fieldsSpecific"]();
    case "range":
      return m["shared.cronTools.range"]();
  }
}

function fieldSummary(name: FieldName, state: FieldState) {
  const field = fieldLabel(name);
  if (state.mode === "interval") {
    const unit =
      name === "dayOfMonth"
        ? m["tools.cronExpressionGenerator.fieldsUnitsDay"]()
        : name === "dayOfWeek"
          ? m["tools.cronExpressionGenerator.fieldsUnitsWeekday"]()
          : fieldUnit(name);
    return m["tools.cronExpressionGenerator.fieldsIntervalSummary"]({
      interval: state.interval,
      unit,
    });
  }
  if (state.mode === "specific" && state.specificValues.length) {
    return m["tools.cronExpressionGenerator.fieldsSpecificSummary"]({
      field,
      values: state.specificValues
        .map((value) => fieldValue(name, value))
        .join(", "),
    });
  }
  if (state.mode === "range") {
    return m["tools.cronExpressionGenerator.fieldsRangeSummary"]({
      field,
      start: fieldValue(name, state.rangeStart),
      end: fieldValue(name, state.rangeEnd),
    });
  }
  return m["tools.cronExpressionGenerator.fieldsEverySummary"]({ field });
}

function RangeSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: Array<{ value: number; label: string }>;
  onChange: (value: number) => void;
}) {
  return (
    <Select
      variant="secondary"
      selectedKey={String(value)}
      onSelectionChange={(key) => key != null && onChange(Number(key))}
    >
      <Label>{label}</Label>
      <Select.Trigger className="min-h-11 w-full">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item
              key={option.value}
              id={String(option.value)}
              textValue={option.label}
            >
              {option.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function CronFieldCard({
  name,
  state,
  onChange,
}: {
  name: FieldName;
  state: FieldState;
  onChange: (state: FieldState) => void;
}) {
  const [min, max] = FIELD_LIMITS[name];
  const options = Array.from({ length: max - min + 1 }, (_, index) => {
    const value = min + index;
    return { value, label: fieldValue(name, value) };
  });
  const update = (patch: Partial<FieldState>) =>
    onChange({ ...state, ...patch });
  const fieldExpression = buildExpression({
    ...defaultForm(),
    [name]: state,
  }).split(" ")[FIELD_NAMES.indexOf(name)];

  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <div className="flex flex-wrap items-center gap-2">
          <Card.Title>{fieldLabel(name)}</Card.Title>
          <code className="rounded-full border border-border px-2 py-0.5 text-xs">
            {fieldExpression}
          </code>
        </div>
        <Card.Description>{fieldDescription(name)}</Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        <div className="space-y-2">
          <span className="text-sm font-medium">
            {m["shared.aesTools.decryptmodelabel"]()}
          </span>
          <ToggleButtonGroup
            selectionMode="single"
            aria-label={`${fieldLabel(name)} ${m["shared.aesTools.decryptmodelabel"]()}`}
            className="w-full [&_button]:min-w-0 [&_button]:flex-1 [&_button]:overflow-hidden"
            selectedKeys={new Set([state.mode])}
            onSelectionChange={(selection) => {
              const mode = [...selection][0];
              if (
                mode === "every" ||
                mode === "interval" ||
                mode === "specific" ||
                mode === "range"
              )
                update({ mode });
            }}
          >
            {(["every", "interval", "specific", "range"] as const).map(
              (mode) => (
                <ToggleButton
                  key={mode}
                  id={mode}
                  aria-label={fieldModeLabel(mode)}
                >
                  <span className="truncate">{fieldModeLabel(mode)}</span>
                </ToggleButton>
              ),
            )}
          </ToggleButtonGroup>
          <p className="text-sm text-muted">{fieldSummary(name, state)}</p>
        </div>

        {state.mode === "interval" ? (
          <TextField className="gap-2">
            <Label>
              {m["tools.cronExpressionGenerator.fieldsIntervalPrefix"]()}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={max - min + 1}
                value={String(state.interval)}
                className="min-h-11 max-w-28"
                onChange={(event) => {
                  const value = Number(event.target.value);
                  update({
                    interval: Math.min(max - min + 1, Math.max(1, value || 1)),
                  });
                }}
              />
              <span className="text-sm text-muted">
                {fieldSummary(name, state).split(" ").at(-1)}
              </span>
            </div>
          </TextField>
        ) : null}

        {state.mode === "specific" ? (
          <div className="space-y-2">
            <span className="text-sm font-medium">{fieldLabel(name)}</span>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {options.map((option) => (
                <Checkbox
                  key={option.value}
                  isSelected={state.specificValues.includes(option.value)}
                  onChange={(selected) =>
                    update({
                      specificValues: selected
                        ? [
                            ...new Set([...state.specificValues, option.value]),
                          ].sort((a, b) => a - b)
                        : state.specificValues.filter(
                            (value) => value !== option.value,
                          ),
                    })
                  }
                >
                  <Checkbox.Content className="min-w-0">
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <span className="truncate text-xs">{option.label}</span>
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </div>
            {!state.specificValues.length ? (
              <p className="text-sm text-muted">
                {m["tools.cronExpressionGenerator.fieldsSpecificEmpty"]()}
              </p>
            ) : null}
          </div>
        ) : null}

        {state.mode === "range" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <RangeSelect
              label={m["common.unitfrom"]()}
              value={state.rangeStart}
              options={options}
              onChange={(rangeStart) =>
                update({
                  rangeStart,
                  rangeEnd: Math.max(rangeStart, state.rangeEnd),
                })
              }
            />
            <RangeSelect
              label={m["common.unitto"]()}
              value={state.rangeEnd}
              options={options}
              onChange={(rangeEnd) =>
                update({
                  rangeEnd,
                  rangeStart: Math.min(state.rangeStart, rangeEnd),
                })
              }
            />
          </div>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function GeneratorArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.cronExpressionGenerator.articleTitle"]()}</h2>
      <p>{m["tools.cronExpressionGenerator.articleBody"]()}</p>
      <h3>{m["tools.cronExpressionGenerator.articleHelpsTitle"]()}</h3>
      <ul>
        {[
          m["tools.cronExpressionGenerator.articleHelps0"](),
          m["tools.cronExpressionGenerator.articleHelps1"](),
          m["tools.cronExpressionGenerator.articleHelps2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>{m["tools.cronExpressionGenerator.article.useTitle"]()}</h3>
      <ol>
        {[
          m["tools.cronExpressionGenerator.articleUse0"](),
          m["tools.cronExpressionGenerator.articleUse1"](),
          m["tools.cronExpressionGenerator.articleUse1"](),
          m["tools.cronExpressionGenerator.articleUse2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <h3>{m["tools.cronExpressionGenerator.article.notesTitle"]()}</h3>
      <ul>
        <li>{m["tools.cronExpressionGenerator.articleNotes0"]()}</li>
        <li>
          {locale() === "zh-CN" ? (
            <>
              星期日显示为 <code>0</code>，常见 Unix 风格 cron
              调度器接受这种表示。
            </>
          ) : (
            <>
              Sunday is shown as <code>0</code>, which is accepted by common
              Unix-style cron schedulers.
            </>
          )}
        </li>
        <li>{m["tools.cronExpressionGenerator.articleNotes2"]()}</li>
      </ul>
    </ToolArticle>
  );
}

function CronExpressionGeneratorPageContent() {
  const [form, setForm] = useState(defaultForm);
  const [nowMs, setNowMs] = useState(Date.now);
  const [hydrated, setHydrated] = useState(false);
  const expression = buildExpression(form);
  const deferredExpression = useDeferredValue(expression);
  const calculation = useMemo(
    () => calculate(deferredExpression, 5, nowMs),
    [deferredExpression, nowMs],
  );

  useEffect(() => {
    const stored = safeLocalStorage.getItem(GENERATOR_STORAGE_KEY);
    if (stored) setForm(formFromExpression(stored));
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) safeLocalStorage.setItem(GENERATOR_STORAGE_KEY, expression);
  }, [expression, hydrated]);
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const updateField = (name: FieldName, state: FieldState) => {
    setNowMs(Date.now());
    setForm((current) => ({ ...current, [name]: state }));
  };
  const applyPreset = (id: keyof typeof PRESETS) => {
    setNowMs(Date.now());
    setForm(formFromPreset(id));
  };

  return (
    <div className="grid gap-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]">
        <div className="grid min-w-0 gap-6">
          <ToolPanelCard>
            <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="grid gap-1">
                <Card.Title>
                  {m["tools.cronExpressionGenerator.outputTitle"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.cronExpressionGenerator.outputDescription"]()}
                </Card.Description>
              </div>
            </Card.Header>
            <ToolPanelCardContent className="gap-5 py-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {m["tools.cronExpressionGenerator.outputExpressionLabel"]()}
                </p>
                <InputGroup variant="secondary" fullWidth>
                  <InputGroup.Input
                    readOnly
                    value={expression}
                    aria-label={m[
                      "tools.cronExpressionGenerator.outputExpressionLabel"
                    ]()}
                    className="font-mono text-lg"
                  />
                  <InputGroup.Suffix>
                    <ToolCopyButton
                      value={expression}
                      copyLabel={m["shared.cronTools.copy"]()}
                      copiedLabel={m["common.actions.copied"]()}
                      ariaLabel={m[
                        "tools.cronExpressionGenerator.outputExpressionLabel"
                      ]()}
                      size="icon-sm"
                      variant="ghost"
                    />
                  </InputGroup.Suffix>
                </InputGroup>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {m["tools.cronExpressionGenerator.outputSummaryLabel"]()}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FIELD_NAMES.map((name) => (
                    <div
                      key={name}
                      className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {fieldLabel(name)}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {fieldSummary(name, form[name])}
                        </p>
                      </div>
                      <code className="rounded-full border border-border px-2 py-0.5 text-xs">
                        {expression.split(" ")[FIELD_NAMES.indexOf(name)]}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
              <Alert>
                <Alert.Indicator>
                  <Clock3 aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.cronExpressionGenerator.outputNoteTitle"]()}
                  </Alert.Title>
                  <Alert.Description>
                    {m["tools.cronExpressionGenerator.outputNoteDescription"]()}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["tools.cronExpressionGenerator.presetsTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.cronExpressionGenerator.presetsDescription"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="flex-row flex-wrap gap-2 py-4">
              {GENERATOR_PRESETS.map((id) => (
                <Button
                  key={id}
                  variant="outline"
                  size="sm"
                  onPress={() => applyPreset(id)}
                >
                  <Sparkles aria-hidden className="size-4" />
                  {generatorPresetLabel(id)}
                </Button>
              ))}
            </ToolPanelCardContent>
          </ToolPanelCard>

          <section className="grid gap-4" aria-labelledby="cron-fields-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="cron-fields-title" className="text-xl font-medium">
                  {m["tools.cronExpressionGenerator.fieldsTitle"]()}
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-muted">
                  {m["tools.cronExpressionGenerator.fieldsDescription"]()}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onPress={() => applyPreset("everyMinute")}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.actions.reset"]()}
              </Button>
            </div>
            {FIELD_NAMES.map((name) => (
              <CronFieldCard
                key={name}
                name={name}
                state={form[name]}
                onChange={(state) => updateField(name, state)}
              />
            ))}
          </section>
        </div>

        <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["tools.cronExpressionGenerator.nextRunsTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.cronExpressionGenerator.nextRunsDescription"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="py-4">
              {deferredExpression !== expression ? (
                <ResultsSkeleton
                  label={m["tools.cronExpressionGenerator.nextRunsTitle"]()}
                />
              ) : calculation.status === "ready" &&
                calculation.result.runs.length ? (
                <CronTable
                  headings={[
                    m["tools.cronExpressionGenerator.nextRunsIndexHeader"](),
                    m["tools.cronExpressionGenerator.nextRunsDateHeader"](),
                    m["tools.cronExpressionGenerator.nextRunsRelativeHeader"](),
                  ]}
                  rows={calculation.result.runs.map((run, index) => [
                    index + 1,
                    formatDate(run.iso),
                    formatRelative(run.iso, nowMs),
                  ])}
                />
              ) : calculation.status === "error" ? (
                <Alert status="danger" role="alert">
                  <Alert.Indicator>
                    <TriangleAlert aria-hidden className="size-4" />
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Title>
                      {m["tools.cronExpressionGenerator.nextRunsEmptyTitle"]()}
                    </Alert.Title>
                    <Alert.Description>
                      {m[
                        "tools.cronExpressionGenerator.nextRunsEmptyDescription"
                      ]()}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : (
                <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
                  <Clock3 aria-hidden className="size-6 text-muted" />
                  <h3 className="font-medium">
                    {m["tools.cronExpressionGenerator.nextRunsEmptyTitle"]()}
                  </h3>
                  <p className="text-sm text-muted">
                    {m[
                      "tools.cronExpressionGenerator.nextRunsEmptyDescription"
                    ]()}
                  </p>
                </div>
              )}
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>
      </div>
      <GeneratorArticle />
    </div>
  );
}

export default function CronExpressionGeneratorPage() {
  return (
    <ToolPage>
      <CronExpressionGeneratorPageContent />
    </ToolPage>
  );
}
