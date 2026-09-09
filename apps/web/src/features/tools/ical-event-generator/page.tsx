import { useObjectUrl } from "@/hooks/use-object-url";
import { downloadUrl } from "@/lib/download";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Autocomplete,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  ListBox,
  SearchField,
  Select,
  Skeleton,
  Switch,
  TextArea,
  useFilter,
} from "@heroui/react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { CodeBlock } from "@/components/base/code-block";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { runIcal } from "./client";
import { initialIcal } from "./defaults";
import { icalOptionsSchema } from "@workspace/tools/time/ical";
import {
  IcalError,
  type IcalOptions,
  type IcalResult,
  newIcalUid,
  WEEKDAYS,
} from "@workspace/tools/time/ical-contract";

const warningMessages = {
  adjusted_time: m["tools.icalEventGenerator.warningAdjustedTime"],
  start_rule_mismatch: m["tools.icalEventGenerator.warningStartRuleMismatch"],
  utc_recurrence: m["tools.icalEventGenerator.warningUtcRecurrence"],
} as const;

const errorMessages = {
  ical_error_ambiguous_time: m["tools.icalEventGenerator.errorAmbiguousTime"],
  ical_error_copy_failed: m["tools.icalEventGenerator.errorCopyFailed"],
  ical_error_end_before_start:
    m["tools.icalEventGenerator.errorEndBeforeStart"],
  ical_error_fold_tzid: m["tools.icalEventGenerator.errorFoldTzid"],
  ical_error_generation_failed:
    m["tools.icalEventGenerator.errorGenerationFailed"],
  ical_error_invalid_date: m["tools.icalEventGenerator.errorInvalidDate"],
  ical_error_invalid_recurrence:
    m["tools.icalEventGenerator.errorInvalidRecurrence"],
  ical_error_invalid_reminders:
    m["tools.icalEventGenerator.errorInvalidReminders"],
  ical_error_invalid_time: m["tools.icalEventGenerator.errorInvalidTime"],
  ical_error_invalid_uid: m["tools.icalEventGenerator.errorInvalidUid"],
  ical_error_invalid_unicode: m["tools.icalEventGenerator.errorInvalidUnicode"],
  ical_error_invalid_url: m["tools.icalEventGenerator.errorInvalidUrl"],
  ical_error_invalid_zone: m["tools.icalEventGenerator.errorInvalidZone"],
  ical_error_output_too_large:
    m["tools.icalEventGenerator.errorOutputTooLarge"],
  ical_error_storage_failed: m["tools.icalEventGenerator.errorStorageFailed"],
  ical_error_timeout: m["tools.icalEventGenerator.errorTimeout"],
  ical_error_too_large: m["tools.icalEventGenerator.errorTooLarge"],
  ical_error_until_before_start:
    m["tools.icalEventGenerator.errorUntilBeforeStart"],
  ical_error_worker_failed: m["tools.icalEventGenerator.errorWorkerFailed"],
  ical_error_zone_capacity: m["tools.icalEventGenerator.errorZoneCapacity"],
} as const;

export const ICAL_STORAGE = "tooltab:ical-event:v1";

function Choice({
  label,
  value,
  choices,
  onChange,
  searchable = false,
  name,
}: {
  label: string;
  value: string;
  choices: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  searchable?: boolean;
  name?: string;
}) {
  const id = useId();
  const { contains } = useFilter({ sensitivity: "base" });
  if (searchable)
    return (
      <div>
        <Autocomplete
          id={id}
          name={name}
          variant="secondary"
          selectedKey={value}
          onSelectionChange={(key) => {
            if (key != null) onChange(String(key));
          }}
          fullWidth
        >
          <Label>{label}</Label>
          <Autocomplete.Trigger className="min-h-11 w-full">
            <Autocomplete.Value />
            <Autocomplete.Indicator />
          </Autocomplete.Trigger>
          <Autocomplete.Popover className="max-h-80">
            <Autocomplete.Filter filter={contains}>
              <SearchField aria-label={label}>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder={label} />
                </SearchField.Group>
              </SearchField>
              <ListBox className="max-h-64 overflow-y-auto">
                {choices.map(([key, itemLabel]) => (
                  <ListBox.Item key={key} id={key} textValue={itemLabel}>
                    {itemLabel}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Autocomplete.Filter>
          </Autocomplete.Popover>
        </Autocomplete>
      </div>
    );
  return (
    <div>
      <Select
        variant="secondary"
        selectedKey={value}
        onSelectionChange={(key) => key != null && onChange(String(key))}
      >
        <Label>{label}</Label>
        <Select.Trigger id={id} className="min-h-11 w-full">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {choices.map(([key, name]) => (
              <ListBox.Item key={key} id={key} textValue={name}>
                {name}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <Switch id={id} isSelected={checked} onChange={(v) => onChange(v === true)}>
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <span className="sr-only">{label}</span>
      </Switch.Content>
    </Switch>
  );
}
function failure(error: unknown) {
  const key = `ical_error_${error instanceof IcalError ? error.code : "generation_failed"}`;
  return Object.hasOwn(errorMessages, key)
    ? (key as keyof typeof errorMessages)
    : "ical_error_generation_failed";
}
function isValidDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3])
  );
}
function isValidTime(value: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(value);
  return Boolean(
    match &&
      Number(match[1]) < 24 &&
      Number(match[2]) < 60 &&
      Number(match[3] ?? 0) < 60,
  );
}
function validationFailure(error: unknown, value: IcalOptions) {
  if (error instanceof IcalError) {
    if (error.code === "end_before_start")
      return m["tools.icalEventGenerator.ui.output.endBeforeStart"]();
    if (error.code === "until_before_start")
      return m["tools.icalEventGenerator.ui.output.invalidUntilDate"]();
    if (error.code === "invalid_date") {
      if (!isValidDate(value.startDate))
        return m["tools.icalEventGenerator.ui.output.invalidStartDate"]();
      if (!isValidDate(value.endDate))
        return m["tools.icalEventGenerator.ui.output.invalidEndDate"]();
      if (value.endMode === "until" && !isValidDate(value.untilDate))
        return m["tools.icalEventGenerator.ui.output.invalidUntilDate"]();
    }
    if (error.code === "invalid_time") {
      if (!isValidTime(value.startTime))
        return m["tools.icalEventGenerator.ui.output.invalidStartTime"]();
      if (!isValidTime(value.endTime))
        return m["tools.icalEventGenerator.ui.output.invalidEndTime"]();
      if (value.endMode === "until" && !isValidTime(value.untilTime))
        return m["tools.icalEventGenerator.ui.output.invalidUntilTime"]();
    }
  }
  return errorMessages[failure(error)]({});
}
function InitialSkeleton() {
  return (
    <div
      className="grid min-w-0 gap-6"
      aria-label={m["tools.icalEventGenerator.busy"]()}
      role="status"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)]">
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="grid gap-6">
          <Skeleton className="h-96 rounded-3xl" />
          <Skeleton className="h-96 rounded-3xl" />
        </div>
        <Skeleton className="h-136 rounded-3xl" />
      </div>
    </div>
  );
}

function IcalEventGeneratorContent() {
  const locale = getLocale();
  const id = useId();
  const [form, setForm] = useState<IcalOptions | null>(null);
  const [stamp, setStamp] = useState(0);
  const [remember, setRemember] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [result, setResult] = useState<IcalResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultBlob = useMemo(
    () =>
      result
        ? new Blob([result.content], { type: "text/calendar;charset=utf-8" })
        : null,
    [result],
  );
  const resultUrl = useObjectUrl(resultBlob);

  function clear() {
    revision.current++;
    controller.current?.abort();
    controller.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setResult(null);
    setError("");
    setBusy(false);
  }

  useEffect(() => {
    const now = Date.now();
    let next = initialIcal(
      now,
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
    let time = now;
    try {
      const raw = localStorage.getItem(ICAL_STORAGE);
      if (raw) {
        if (raw.length > 16 * 1024 * 1024) throw Error();
        const value = JSON.parse(raw);
        next = icalOptionsSchema.parse(value.event);
        if (Number.isSafeInteger(value.nowMs)) time = value.nowMs;
        setRemember(true);
      }
    } catch {
      setStorageError(true);
    }
    setForm(next);
    setStamp(time);
    return () => {
      // Invalidate the latest async generation at cleanup, not the generation captured at mount.
      revision.current++;
      controller.current?.abort();
      controller.current = null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  useEffect(() => {
    if (!form) return;
    try {
      if (remember) {
        localStorage.setItem(
          ICAL_STORAGE,
          JSON.stringify({ event: form, nowMs: stamp }),
        );
      } else {
        localStorage.removeItem(ICAL_STORAGE);
      }
    } catch {
      setStorageError(true);
    }
  }, [form, remember, stamp]);

  const generate = async (value: IcalOptions, time: number) => {
    clear();
    const current = revision.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const output = await runIcal(value, time, abort.signal);
      if (current === revision.current) setResult(output);
    } catch (cause) {
      if (current === revision.current && !abort.signal.aborted) {
        setError(validationFailure(cause, value));
      }
    } finally {
      if (controller.current === abort) controller.current = null;
      if (current === revision.current) setBusy(false);
    }
  };
  const auto = useEffectEvent(
    (value: IcalOptions, time: number) => void generate(value, time),
  );
  useEffect(() => {
    if (!form) return;
    const scheduled = setTimeout(() => auto(form, stamp), 350);
    timer.current = scheduled;
    return () => {
      clearTimeout(scheduled);
      if (timer.current === scheduled) timer.current = null;
    };
  }, [form, stamp]);

  const selectedZone = form?.timeZone;
  const zones = useMemo(
    () =>
      Array.from(
        new Set([
          "UTC",
          ...(typeof Intl.supportedValuesOf === "function"
            ? Intl.supportedValuesOf("timeZone")
            : []),
          ...(selectedZone ? [selectedZone] : []),
        ]),
      ).sort(),
    [selectedZone],
  );

  function edit<K extends keyof IcalOptions>(key: K, value: IcalOptions[K]) {
    clear();
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function reset(sample = false) {
    clear();
    setRemember(false);
    try {
      localStorage.removeItem(ICAL_STORAGE);
      setStorageError(false);
      const now = Date.now();
      const next = initialIcal(
        now,
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      );
      if (sample) {
        next.summary = m["tools.icalEventGenerator.ui.sample.title"]();
        next.location = m["tools.icalEventGenerator.ui.sample.location"]();
        next.notes = m["tools.icalEventGenerator.ui.sample.description"]();
        next.frequency = "weekly";
        next.weekdays = ["MO", "WE"];
        next.endMode = "count";
        next.count = 6;
        next.remindersEnabled = true;
      }
      setStamp(now);
      setForm(next);
    } catch {
      setError(m["tools.icalEventGenerator.errorGenerationFailed"]());
    }
  }

  function download() {
    if (!result) return;
    try {
      downloadUrl(resultUrl, result.filename);
    } catch {
      setError(m["tools.icalEventGenerator.errorGenerationFailed"]());
    }
  }

  if (!form) return <InitialSkeleton />;
  const activeForm = form;

  function input(
    key: keyof IcalOptions,
    label: string,
    type = "text",
    min?: number,
    max?: number,
    placeholder?: string,
  ) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${id}-${key}`}>
          {label}
        </label>
        <Input
          id={`${id}-${key}`}
          type={type}
          className="min-h-11 w-full"
          autoComplete="off"
          min={min}
          max={max}
          step={type === "time" ? 1 : undefined}
          value={String(activeForm[key])}
          placeholder={placeholder}
          onChange={(event) => {
            if (type === "number") edit(key, Number(event.target.value));
            else edit(key, event.target.value);
          }}
        />
      </div>
    );
  }

  const frequencyChoices = [
    ["none", m["tools.icalEventGenerator.ui.recurrence.none"]()],
    ["daily", m["tools.icalEventGenerator.daily"]()],
    ["weekly", m["tools.icalEventGenerator.weekly"]()],
    ["monthly", m["tools.icalEventGenerator.monthly"]()],
    ["yearly", m["tools.icalEventGenerator.yearly"]()],
  ] as const;
  const endChoices = [
    ["never", m["tools.icalEventGenerator.never"]()],
    ["count", m["tools.icalEventGenerator.ui.recurrence.count"]()],
    ["until", m["tools.icalEventGenerator.ui.recurrence.until"]()],
  ] as const;
  const unitChoices = [
    ["minutes", m["tools.icalEventGenerator.minutes"]()],
    ["hours", m["tools.icalEventGenerator.hours"]()],
    ["days", m["tools.icalEventGenerator.days"]()],
    ["weeks", m["tools.icalEventGenerator.weeks"]()],
  ] as const;
  const outputModeLabel =
    form.outputMode === "utc"
      ? m["tools.icalEventGenerator.ui.schedule.outputUtc"]()
      : m["tools.icalEventGenerator.ui.schedule.outputTzid"]();
  const frequencyLabel =
    frequencyChoices.find(([value]) => value === form.frequency)?.[1] ??
    m["tools.icalEventGenerator.ui.recurrence.none"]();
  const start = new Date(`${form.startDate}T00:00:00Z`);
  const dateParts = Number.isNaN(start.getTime())
    ? { month: "—", day: "—", weekday: "—", year: "—" }
    : {
        month: new Intl.DateTimeFormat(locale, {
          month: "short",
          timeZone: "UTC",
        }).format(start),
        day: new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          timeZone: "UTC",
        }).format(start),
        weekday: new Intl.DateTimeFormat(locale, {
          weekday: "short",
          timeZone: "UTC",
        }).format(start),
        year: new Intl.DateTimeFormat(locale, {
          year: "numeric",
          timeZone: "UTC",
        }).format(start),
      };

  return (
    <div className="grid min-w-0 gap-6">
      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)]">
        <Card className="rounded-3xl border border-separator bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">
            {m["common.icalStartDate"]()}
          </p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-primary uppercase">
                {dateParts.month}
              </p>
              <p className="text-6xl leading-none font-semibold tracking-tight">
                {dateParts.day}
              </p>
            </div>
            <div className="text-right text-sm text-muted">
              <p>{dateParts.weekday}</p>
              <p>{dateParts.year}</p>
            </div>
          </div>
          <div className="mt-5 space-y-4 rounded-2xl border border-separator bg-default/40 p-3">
            <div>
              <p className="text-xs font-medium tracking-wider text-muted uppercase">
                {m["tools.icalEventGenerator.startTime"]()}
              </p>
              <p className="mt-1 text-sm font-medium">
                {form.allDay
                  ? m["tools.icalEventGenerator.ui.schedule.allDay"]()
                  : form.startTime}
              </p>
              <p className="text-xs text-muted">{form.startDate}</p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wider text-muted uppercase">
                {m["tools.icalEventGenerator.endTime"]()}
              </p>
              <p className="mt-1 text-sm font-medium">
                {form.allDay
                  ? m["tools.icalEventGenerator.ui.schedule.allDay"]()
                  : form.endTime}
              </p>
              <p className="text-xs text-muted">{form.endDate}</p>
            </div>
          </div>
        </Card>

        <Card className="rounded-3xl border border-separator bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <p className="text-xs font-medium tracking-widest text-muted uppercase">
                {m["tools.icalEventGenerator.name"]()}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-balance wrap-break-word sm:text-3xl">
                {form.summary.trim() ||
                  m["tools.icalEventGenerator.ui.details.summaryPlaceholder"]()}
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-muted sm:text-base">
                {form.notes.trim() ||
                  m["tools.icalEventGenerator.description"]()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onPress={() => reset(true)}>
                {m["tools.icalEventGenerator.sample"]()}
              </Button>
              <Button variant="ghost" onPress={() => reset()}>
                {m["common.actions.reset"]()}
              </Button>
            </div>
          </div>
          {form.location.trim() || form.url.trim() ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {form.location.trim() ? (
                <span className="max-w-full truncate rounded-full border border-separator bg-default/40 px-3 py-1.5 text-sm">
                  {m["common.icalLocation"]()}: {form.location}
                </span>
              ) : null}
              {form.url.trim() ? (
                <span className="max-w-full truncate rounded-full border border-separator bg-default/40 px-3 py-1.5 text-sm">
                  {m["tools.icalEventGenerator.ui.details.url"]()}: {form.url}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {[
              [m["tools.pdfSplitter.outputMode"](), outputModeLabel],
              [
                m["tools.icalEventGenerator.ui.recurrence.frequency"](),
                frequencyLabel,
              ],
              [m["shared.dateTools.zone"](), form.timeZone],
            ].map(([label, value]) => (
              <div
                key={label}
                className="min-w-0 rounded-2xl border border-separator bg-default/40 p-3"
              >
                <p className="truncate text-xs font-medium tracking-wider text-muted uppercase">
                  {label}
                </p>
                <p className="mt-2 truncate text-sm font-medium" title={value}>
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-separator pt-4">
            <p className="text-sm leading-6 text-muted">
              {m["tools.icalEventGenerator.privacy"]()}
            </p>
            <Checkbox
              className="mt-3"
              isSelected={remember}
              onChange={(selected) => {
                setRemember(selected === true);
                if (!selected) {
                  try {
                    localStorage.removeItem(ICAL_STORAGE);
                  } catch {
                    setStorageError(true);
                  }
                }
              }}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span>{m["tools.icalEventGenerator.remember"]()}</span>
              </Checkbox.Content>
            </Checkbox>
            {storageError ? (
              <p role="alert" className="mt-2 text-sm text-danger">
                {m["tools.icalEventGenerator.errorStorageFailed"]()}
              </p>
            ) : null}
          </div>
        </Card>
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="grid min-w-0 gap-6">
          <ToolPanelCard>
            <Card.Header className="flex-row items-start justify-between gap-4 border-b border-separator">
              <div className="space-y-1">
                <Card.Title>
                  {m["tools.icalEventGenerator.ui.details.title"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.icalEventGenerator.ui.details.description"]()}
                </Card.Description>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  try {
                    edit("uid", newIcalUid());
                  } catch {
                    setError(
                      m["tools.icalEventGenerator.errorGenerationFailed"](),
                    );
                  }
                }}
              >
                {m["tools.icalEventGenerator.regenerate"]()}
              </Button>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              {input(
                "summary",
                m["common.icalSummary"](),
                "text",
                undefined,
                undefined,
                `${m["tools.icalEventGenerator.ui.details.summaryPlaceholder"]()}…`,
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {input("location", m["common.icalLocation"]())}
                {input(
                  "url",
                  m["tools.icalEventGenerator.ui.details.url"](),
                  "url",
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor={`${id}-notes`}>
                  {m["tools.icalEventGenerator.notes"]()}
                </label>
                <TextArea
                  id={`${id}-notes`}
                  value={form.notes}
                  autoComplete="off"
                  className="min-h-32 w-full resize-y"
                  placeholder={`${m["tools.icalEventGenerator.ui.details.notesPlaceholder"]()}…`}
                  onChange={(event) => edit("notes", event.target.value)}
                />
              </div>
              {input("uid", m["tools.icalEventGenerator.ui.details.uid"]())}
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["tools.icalEventGenerator.ui.schedule.title"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.icalEventGenerator.ui.schedule.description"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              <div className="flex flex-col gap-3 rounded-xl border border-separator bg-default/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {m["tools.icalEventGenerator.ui.schedule.allDay"]()}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {m["tools.icalEventGenerator.ui.schedule.allDayHint"]()}
                  </p>
                </div>
                <Toggle
                  label={m["tools.icalEventGenerator.ui.schedule.allDay"]()}
                  checked={form.allDay}
                  onChange={(value) => edit("allDay", value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {input("startDate", m["common.icalStartDate"](), "date")}
                {input("endDate", m["common.icalEndDate"](), "date")}
              </div>
              {!form.allDay ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {input(
                    "startTime",
                    m["tools.icalEventGenerator.startTime"](),
                    "time",
                  )}
                  {input(
                    "endTime",
                    m["tools.icalEventGenerator.endTime"](),
                    "time",
                  )}
                </div>
              ) : null}
              <Choice
                label={m["shared.dateTools.zone"]()}
                value={form.timeZone}
                choices={zones.map((zone) => [zone, zone])}
                onChange={(value) => edit("timeZone", value)}
                searchable
                name="timeZone"
              />
              <Choice
                label={m["tools.pdfSplitter.outputMode"]()}
                value={form.outputMode}
                choices={[
                  [
                    "utc",
                    m["tools.icalEventGenerator.ui.schedule.outputUtc"](),
                  ],
                  [
                    "tzid",
                    m["tools.icalEventGenerator.ui.schedule.outputTzid"](),
                  ],
                ]}
                onChange={(value) =>
                  edit("outputMode", value as IcalOptions["outputMode"])
                }
              />
              {!form.allDay ? (
                <Choice
                  label={m["tools.icalEventGenerator.dst"]()}
                  value={form.disambiguation}
                  choices={[
                    ["reject", m["tools.icalEventGenerator.reject"]()],
                    ["compatible", m["tools.icalEventGenerator.compatible"]()],
                    ["earlier", m["tools.icalEventGenerator.earlier"]()],
                    ["later", m["tools.icalEventGenerator.later"]()],
                  ]}
                  onChange={(value) =>
                    edit(
                      "disambiguation",
                      value as IcalOptions["disambiguation"],
                    )
                  }
                />
              ) : null}
              {form.outputMode === "tzid" ? (
                <p className="text-sm leading-6 text-muted">
                  {m["tools.icalEventGenerator.zoneNote"]()}
                </p>
              ) : null}
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["tools.icalEventGenerator.ui.recurrence.title"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.icalEventGenerator.ui.recurrence.description"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              <Choice
                label={m["tools.icalEventGenerator.ui.recurrence.frequency"]()}
                value={form.frequency}
                choices={frequencyChoices}
                onChange={(value) =>
                  edit("frequency", value as IcalOptions["frequency"])
                }
              />
              {form.frequency !== "none" ? (
                <div className="space-y-4 rounded-xl border border-separator bg-default/30 p-4">
                  {input(
                    "interval",
                    m["tools.icalEventGenerator.ui.recurrence.interval"](),
                    "number",
                    1,
                    2147483647,
                  )}
                  {form.frequency === "weekly" ? (
                    <fieldset>
                      <legend className="mb-2 text-sm font-medium">
                        {m["tools.icalEventGenerator.weekdays"]()}
                      </legend>
                      <div className="flex flex-wrap gap-3">
                        {WEEKDAYS.map((day, index) => (
                          <Checkbox
                            key={day}
                            isSelected={form.weekdays.includes(day)}
                            onChange={(enabled) => {
                              const weekdays = enabled
                                ? [...form.weekdays, day]
                                : form.weekdays.filter(
                                    (value) => value !== day,
                                  );
                              edit(
                                "weekdays",
                                weekdays.length ? weekdays : ["MO"],
                              );
                            }}
                          >
                            <Checkbox.Content>
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                              <span>
                                {new Intl.DateTimeFormat(locale, {
                                  weekday: "short",
                                  timeZone: "UTC",
                                }).format(
                                  new Date(Date.UTC(2026, 0, 5 + index)),
                                )}
                              </span>
                            </Checkbox.Content>
                          </Checkbox>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  {form.frequency === "monthly" || form.frequency === "yearly"
                    ? input(
                        "monthDay",
                        m["tools.icalEventGenerator.monthDay"](),
                        "number",
                        1,
                        31,
                      )
                    : null}
                  {form.frequency === "yearly"
                    ? input(
                        "month",
                        m["shared.cronTools.month"](),
                        "number",
                        1,
                        12,
                      )
                    : null}
                  <Choice
                    label={m["tools.icalEventGenerator.ui.recurrence.ends"]()}
                    value={form.endMode}
                    choices={endChoices}
                    onChange={(value) =>
                      edit("endMode", value as IcalOptions["endMode"])
                    }
                  />
                  {form.endMode === "count"
                    ? input(
                        "count",
                        m[
                          "tools.icalEventGenerator.ui.recurrence.occurrences"
                        ](),
                        "number",
                        1,
                        2147483647,
                      )
                    : null}
                  {form.endMode === "until" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {input(
                        "untilDate",
                        m["tools.icalEventGenerator.ui.recurrence.untilDate"](),
                        "date",
                      )}
                      {!form.allDay
                        ? input(
                            "untilTime",
                            m[
                              "tools.icalEventGenerator.ui.recurrence.untilTime"
                            ](),
                            "time",
                          )
                        : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="flex-row items-start justify-between gap-4 border-b border-separator">
              <div className="space-y-1">
                <Card.Title>
                  {m["tools.icalEventGenerator.ui.reminders.title"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.icalEventGenerator.ui.reminders.description"]()}
                </Card.Description>
              </div>
              <Button
                size="sm"
                variant="ghost"
                isDisabled={form.reminders.length >= 1000}
                onPress={() => {
                  try {
                    const reminder = {
                      id: newIcalUid(),
                      amount: 15,
                      unit: "minutes" as const,
                    };
                    clear();
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            reminders: [...current.reminders, reminder],
                            remindersEnabled: true,
                          }
                        : current,
                    );
                  } catch {
                    setError(
                      m["tools.icalEventGenerator.errorGenerationFailed"](),
                    );
                  }
                }}
              >
                {m["tools.icalEventGenerator.addReminder"]()}
              </Button>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              <div className="flex flex-col gap-3 rounded-xl border border-separator bg-default/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {m["tools.icalEventGenerator.reminders"]()}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {m["tools.icalEventGenerator.ui.reminders.description"]()}
                  </p>
                </div>
                <Toggle
                  label={m["tools.icalEventGenerator.reminders"]()}
                  checked={form.remindersEnabled}
                  onChange={(value) => edit("remindersEnabled", value)}
                />
              </div>
              {form.remindersEnabled
                ? form.reminders.map((reminder, index) => (
                    <div
                      key={reminder.id}
                      className="grid items-end gap-3 rounded-xl border border-separator bg-default/30 p-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]"
                    >
                      <div className="space-y-2">
                        <label
                          className="text-sm font-medium"
                          htmlFor={`${id}-reminder-${index}`}
                        >
                          {m[
                            "tools.icalEventGenerator.ui.reminders.leadTime"
                          ]()}
                        </label>
                        <Input
                          id={`${id}-reminder-${index}`}
                          className="min-h-11 w-full"
                          type="number"
                          min={1}
                          max={2147483647}
                          value={reminder.amount}
                          onChange={(event) =>
                            edit(
                              "reminders",
                              form.reminders.map((value, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...value,
                                      amount: Number(event.target.value),
                                    }
                                  : value,
                              ),
                            )
                          }
                        />
                      </div>
                      <Choice
                        label={m["common.unixunit"]()}
                        value={reminder.unit}
                        choices={unitChoices}
                        onChange={(value) =>
                          edit(
                            "reminders",
                            form.reminders.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    unit: value as typeof item.unit,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      <Button
                        className="min-h-11"
                        variant="ghost"
                        onPress={() => {
                          const reminders = form.reminders.filter(
                            (_, itemIndex) => itemIndex !== index,
                          );
                          edit(
                            "reminders",
                            reminders.length
                              ? reminders
                              : [
                                  {
                                    id: newIcalUid(),
                                    amount: 15,
                                    unit: "minutes",
                                  },
                                ],
                          );
                        }}
                      >
                        {m["shared.gifAnimation.remove"]()}
                      </Button>
                    </div>
                  ))
                : null}
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>

        <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <ToolPanelCard>
            <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Card.Title>
                  {m["tools.icalEventGenerator.ui.output.title"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.icalEventGenerator.ui.output.description"]()}
                </Card.Description>
                {result ? (
                  <p className="truncate font-mono text-xs text-muted">
                    {result.filename}
                  </p>
                ) : null}
              </div>
              <ToolPanelActionGroup className="shrink-0 sm:justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={!resultUrl || busy}
                  onPress={download}
                >
                  {m["tools.icalEventGenerator.ui.actions.download"]()}
                </Button>
              </ToolPanelActionGroup>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  [m["tools.pdfSplitter.outputMode"](), outputModeLabel],
                  [m["shared.dateTools.zone"](), form.timeZone],
                  [m["tools.icalEventGenerator.ui.details.uid"](), form.uid],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="min-w-0 rounded-xl border border-separator bg-default/30 px-3 py-2"
                  >
                    <p className="truncate text-xs font-medium tracking-wider text-muted uppercase">
                      {label}
                    </p>
                    <p
                      className="mt-1 truncate text-xs font-semibold"
                      title={value}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              {error ? (
                <div
                  role="alert"
                  className="grid min-h-72 place-items-center rounded-2xl border border-danger/30 bg-danger/5 p-6 text-center text-sm text-danger"
                >
                  {error}
                </div>
              ) : busy || !result ? (
                <div
                  role="status"
                  aria-label={m["tools.icalEventGenerator.busy"]()}
                  className="space-y-3"
                >
                  <Skeleton className="h-11 rounded-xl" />
                  <Skeleton className="h-80 rounded-2xl" />
                </div>
              ) : (
                <>
                  {result.warnings.map((warning) => (
                    <p key={warning} className="text-sm leading-6 text-warning">
                      {warningMessages[warning as keyof typeof warningMessages](
                        {},
                      )}
                    </p>
                  ))}
                  <CodeBlock
                    code={result.content}
                    title="iCalendar"
                    language="ICS"
                    className="rounded-none border-x-0 border-b-0"
                    copyLabel={m["tools.icalEventGenerator.ui.actions.copy"]()}
                    copiedLabel={m["common.actions.copied"]()}
                    errorLabel={m["tools.icalEventGenerator.errorCopyFailed"]()}
                    maxHeightClassName="max-h-[32rem] min-h-72"
                  >
                    {result.content
                      .slice(0, 200000)
                      .split("\r\n")
                      .map((line, index) => {
                        const colon = line.indexOf(":");
                        return (
                          // biome-ignore lint/suspicious/noArrayIndexKey: immutable source display lines have no editable component state.
                          <span key={`${index}-${line.slice(0, 20)}`}>
                            <span className="text-primary">
                              {colon < 0 ? "" : line.slice(0, colon + 1)}
                            </span>
                            {colon < 0 ? line : line.slice(colon + 1)}
                            {"\n"}
                          </span>
                        );
                      })}
                  </CodeBlock>
                  {result.content.length > 200000 ? (
                    <p className="text-sm text-muted">
                      {m["tools.icalEventGenerator.preview"]()}
                    </p>
                  ) : null}
                </>
              )}
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>
      </div>

      <ToolArticle>
        <h2>{m["tools.icalEventGenerator.ui.article.title"]()}</h2>
        <p>{m["tools.icalEventGenerator.ui.article.intro"]()}</p>
        <h3>{m["tools.icalEventGenerator.ui.article.why"]()}</h3>
        <ul>
          {[
            m["tools.icalEventGenerator.ui.article.why1"](),
            m["tools.icalEventGenerator.ui.article.why2"](),
            m["tools.icalEventGenerator.ui.article.why3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h3>{m["tools.icalEventGenerator.ui.article.workflow"]()}</h3>
        <ol>
          {[
            m["tools.icalEventGenerator.ui.article.workflow1"](),
            m["tools.icalEventGenerator.ui.article.workflow2"](),
            m["tools.icalEventGenerator.ui.article.workflow3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <h3>{m["tools.cronExpressionGenerator.article.notesTitle"]()}</h3>
        <ul>
          {[
            m["tools.icalEventGenerator.ui.article.note1"](),
            m["tools.icalEventGenerator.ui.article.note2"](),
            m["tools.icalEventGenerator.ui.article.note3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function IcalEventGenerator() {
  return (
    <ToolPage>
      <IcalEventGeneratorContent />
    </ToolPage>
  );
}
