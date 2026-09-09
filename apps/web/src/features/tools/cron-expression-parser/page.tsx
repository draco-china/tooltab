import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  Skeleton,
  TextField,
} from "@heroui/react";
import { Clock3, RefreshCcw, TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import { getLocale } from "@/paraglide/runtime.js";
import { inspectCron } from "../cron-tools/logic";
import { PRESETS } from "@workspace/tools/time/cron";

const fieldMessages = {
  second: m["tools.cronExpressionParser.unitSecond"],
  minute: m["common.unitMinute"],
  hour: m["common.unitHour"],
  dayOfMonth: m["tools.cronExpressionParser.breakdownFieldsDayOfMonth"],
  month: m["common.icalMonth"],
  dayOfWeek: m["tools.cronExpressionParser.dayofweek"],
};

type CronResult = ReturnType<typeof inspectCron>;
type Calculation =
  | { status: "empty" }
  | { status: "ready"; result: CronResult }
  | { status: "error" };

const PARSER_STORAGE_KEY = "tools:cron-expression-parser:expression";
const DEFAULT_PARSER_EXPRESSION = "*/5 * * * *";
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

function formatRelative(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.round((Date.parse(iso) - nowMs) / 1000));
  if (seconds < 5) return m["tools.cronExpressionParser.relativeNow"]();
  if (seconds < 60)
    return m["tools.cronExpressionParser.relativeInSeconds"]({
      count: seconds,
    });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return m["tools.cronExpressionParser.relativeInMinutes"]({
      count: minutes,
    });
  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return m["tools.cronExpressionParser.relativeInHours"]({ count: hours });
  return m["tools.cronExpressionParser.relativeInDays"]({
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

function ParserArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.cronExpressionParser.articleTitle"]()}</h2>
      <p>{m["tools.cronExpressionParser.articleBody"]()}</p>
      <h3>{m["tools.cronExpressionParser.article.useTitle"]()}</h3>
      <ul>
        {[
          m["tools.cronExpressionParser.articleUse0"](),
          m["tools.cronExpressionParser.articleUse1"](),
          m["tools.cronExpressionParser.articleUse2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>{m["tools.cronExpressionParser.articleFormatTitle"]()}</h3>
      <p>{m["tools.cronExpressionParser.articleFormatBody"]()}</p>
      <h3>{m["tools.cronExpressionParser.articleResultTitle"]()}</h3>
      <p>{m["tools.cronExpressionParser.articleResultBody"]()}</p>
      <h3>{m["tools.cronExpressionGenerator.article.notesTitle"]()}</h3>
      <ul>
        <li>
          {locale() === "zh-CN" ? (
            <>
              星期字段通常使用 <code>0</code> 或 <code>7</code>
              表示星期日，也接受 <code>MON</code> 或 <code>FRI</code> 等名称。
            </>
          ) : (
            <>
              Day-of-week values commonly use <code>0</code> or <code>7</code>{" "}
              for Sunday, and names such as <code>MON</code> or <code>FRI</code>{" "}
              are also accepted.
            </>
          )}
        </li>
        <li>
          {locale() === "zh-CN" ? (
            <>
              使用 <code>JAN</code> 或 <code>DEC</code>
              等月份名称，可以让生产调度更容易审阅。
            </>
          ) : (
            <>
              Month names such as <code>JAN</code> or <code>DEC</code> can make
              production schedules easier to review.
            </>
          )}
        </li>
        <li>
          {locale() === "zh-CN" ? (
            <>
              如果你的调度器使用不同的 Cron 方言，请在该调度器自己的文档中确认{" "}
              <code>?</code>、<code>L</code>、<code>W</code> 或 <code>#</code>{" "}
              等特殊标记。
            </>
          ) : (
            <>
              If your scheduler uses a different cron dialect, confirm special
              tokens such as <code>?</code>, <code>L</code>, <code>W</code>, or{" "}
              <code>#</code> in that scheduler&apos;s own documentation.
            </>
          )}
        </li>
      </ul>
    </ToolArticle>
  );
}

function CronParserContent() {
  const inputId = useId();
  const [expression, setExpression] = useState(DEFAULT_PARSER_EXPRESSION);
  const [nowMs, setNowMs] = useState(Date.now);
  const [hydrated, setHydrated] = useState(false);
  const deferredExpression = useDeferredValue(expression);
  const calculation = useMemo(
    () => calculate(deferredExpression, 10, nowMs),
    [deferredExpression, nowMs],
  );
  const isLoading = expression !== deferredExpression;
  const result = calculation.status === "ready" ? calculation.result : null;

  useEffect(() => {
    const stored = safeLocalStorage.getItem(PARSER_STORAGE_KEY);
    if (stored !== null) setExpression(stored);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) safeLocalStorage.setItem(PARSER_STORAGE_KEY, expression);
  }, [expression, hydrated]);
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="grid gap-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.cronExpressionGenerator.outputTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.cronExpressionParser.inputDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <TextField
              className="gap-2"
              isInvalid={!isLoading && calculation.status === "error"}
            >
              <Label htmlFor={inputId}>
                {m["tools.cronExpressionParser.expression"]()}
              </Label>
              <Input
                id={inputId}
                value={expression}
                placeholder={m["tools.cronExpressionParser.inputPlaceholder"]()}
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                className="min-h-11 font-mono text-sm"
                onChange={(event) => setExpression(event.target.value)}
              />
              <p className="text-sm text-muted">
                {calculation.status === "empty"
                  ? m["tools.cronExpressionParser.inputEmpty"]()
                  : calculation.status === "error"
                    ? m["tools.cronExpressionParser.inputInvalid"]()
                    : m["tools.cronExpressionParser.inputValid"]()}
              </p>
            </TextField>
            <div className="flex flex-wrap gap-2">
              <ToolCopyButton
                value={expression}
                copyLabel={m["shared.cronTools.copy"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={!result || isLoading}
              />
              <Button
                variant="outline"
                size="sm"
                onPress={() => setExpression(DEFAULT_PARSER_EXPRESSION)}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.actions.reset"]()}
              </Button>
            </div>
            <div className="space-y-3 border-t border-border pt-5">
              <div>
                <h2 className="text-sm font-medium">
                  {m["tools.cronExpressionGenerator.presetsTitle"]()}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {m["tools.cronExpressionParser.presetsDescription"]()}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map(
                  (id) => (
                    <Button
                      key={id}
                      variant="secondary"
                      size="sm"
                      className="justify-between font-mono"
                      onPress={() => setExpression(PRESETS[id])}
                    >
                      <span className="truncate font-sans">
                        {
                          {
                            everyMinute:
                              m["shared.cronTools.presetEveryMinute"](),
                            everyFiveMinutes:
                              m["shared.cronTools.presetEveryFiveMinutes"](),
                            everyFifteenMinutes:
                              m["shared.cronTools.presetEveryFifteenMinutes"](),
                            everyThirtyMinutes:
                              m[
                                "tools.cronExpressionParser.presetEveryThirtyMinutes"
                              ](),
                            hourly: m["shared.cronTools.presetHourly"](),
                            dailyMidnight:
                              m["shared.cronTools.presetDailyMidnight"](),
                            dailyNoon: m["shared.cronTools.presetDailyNoon"](),
                            weeklySunday:
                              m[
                                "tools.cronExpressionParser.presetWeeklySunday"
                              ](),
                            weeklyMondayMorning:
                              m[
                                "tools.cronExpressionParser.presetsItemsWeeklyMondayMorning"
                              ](),
                            monthlyFirstDay:
                              m[
                                "tools.cronExpressionParser.presetMonthlyFirstDay"
                              ](),
                            weekdaysMorning:
                              m[
                                "tools.cronExpressionGenerator.presetsItemsWeekdayMorning"
                              ](),
                          }[id]
                        }
                      </span>
                      <span className="text-xs text-muted">{PRESETS[id]}</span>
                    </Button>
                  ),
                )}
              </div>
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <div className="flex w-full flex-wrap items-start justify-between gap-3">
              <div>
                <Card.Title>
                  {m["tools.cronExpressionParser.scheduleTitle"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.cronExpressionParser.scheduleDescription"]()}
                </Card.Description>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${
                  result ? "bg-default" : "bg-danger/10 text-danger"
                }`}
              >
                {result
                  ? m["tools.cronExpressionParser.inputValid"]()
                  : m["tools.cronExpressionParser.inputInvalid"]()}
              </span>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            {isLoading ? (
              <ResultsSkeleton
                label={m["tools.cronExpressionParser.scheduleTitle"]()}
              />
            ) : calculation.status === "empty" ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
                <Clock3 aria-hidden className="size-6 text-muted" />
                <h3 className="font-medium">
                  {m["tools.cronExpressionParser.scheduleEmptyTitle"]()}
                </h3>
                <p className="text-sm text-muted">
                  {m["tools.cronExpressionParser.scheduleEmptyDescription"]()}
                </p>
              </div>
            ) : calculation.status === "error" ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.cronExpressionParser.inputInvalid"]()}
                  </Alert.Title>
                </Alert.Content>
              </Alert>
            ) : result ? (
              <>
                <section className="space-y-2">
                  <p className="text-sm text-muted">
                    {m["common.icalSummary"]()}
                  </p>
                  <p className="text-lg font-medium text-balance">
                    {result.description ??
                      m["tools.cronExpressionParser.inputValid"]()}
                  </p>
                  <p className="text-sm text-muted">
                    {m["tools.cronExpressionParser.inputTimezoneNote"](
                      { timeZone: result.timeZone },
                      { locale: locale() },
                    )}
                  </p>
                </section>
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-medium">
                      {m["tools.cronExpressionParser.breakdownTitle"]()}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {m["tools.cronExpressionParser.breakdownDescription"]()}
                    </p>
                  </div>
                  <CronTable
                    headings={[
                      m["tools.cronExpressionParser.breakdownField"](),
                      m["tools.cronExpressionParser.breakdownValue"](),
                      m["tools.cronExpressionParser.breakdownAllowedRange"](),
                    ]}
                    rows={result.fields.map((field) => [
                      fieldMessages[
                        field.id as keyof typeof fieldMessages
                      ]?.() ?? field.id,
                      field.value,
                      field.range,
                    ])}
                  />
                </section>
                <section className="space-y-3">
                  <h2 className="text-sm font-medium">
                    {m["tools.cronExpressionParser.scheduleTitle"]()}
                  </h2>
                  <CronTable
                    headings={[
                      "#",
                      m["tools.cronExpressionParser.scheduleDateTimeLabel"](),
                      m[
                        "tools.cronExpressionGenerator.nextRunsRelativeHeader"
                      ](),
                    ]}
                    rows={result.runs.map((run, index) => [
                      index + 1,
                      formatDate(run.iso, true),
                      formatRelative(run.iso, nowMs),
                    ])}
                  />
                </section>
              </>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <ParserArticle />
    </div>
  );
}

export default function CronParser() {
  return (
    <ToolPage>
      <CronParserContent />
    </ToolPage>
  );
}
