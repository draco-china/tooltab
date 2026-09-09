import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Autocomplete,
  Button,
  Card,
  InputGroup,
  Label,
  ListBox,
  SearchField,
  useFilter,
} from "@heroui/react";
import { ArrowLeftRight } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
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
  snapshot,
  timeDifference,
  zones,
} from "@workspace/tools/time/date-time";

const STORAGE_KEY = "tools:time-diff-calculator";

function TimeDiffCalculatorContent() {
  const locale = getLocale();
  const [start, setStart] = useState("2026-01-01 00:00:00.000");
  const [end, setEnd] = useState("2026-01-01 01:00:00.000");
  const [startZone, setStartZone] = useState("UTC");
  const [endZone, setEndZone] = useState("UTC");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "null",
      ) as {
        start?: string;
        end?: string;
        startZone?: string;
        endZone?: string;
      } | null;
      const available = zones();
      const localZone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const fallbackZone = available.includes(localZone) ? localZone : "UTC";
      const safeStartZone = available.includes(stored?.startZone ?? "")
        ? (stored?.startZone as string)
        : fallbackZone;
      const safeEndZone = available.includes(stored?.endZone ?? "")
        ? (stored?.endZone as string)
        : fallbackZone;
      const now = BigInt(Date.now());
      setStartZone(safeStartZone);
      setEndZone(safeEndZone);
      setStart(stored?.start ?? snapshot(now, safeStartZone).dateTime);
      setEnd(stored?.end ?? snapshot(now + 3_600_000n, safeEndZone).dateTime);
    } catch {
      const now = BigInt(Date.now());
      setStart(snapshot(now, "UTC").dateTime);
      setEnd(snapshot(now + 3_600_000n, "UTC").dateTime);
    } finally {
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (restored)
      safeLocalStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ start, end, startZone, endZone }),
      );
  }, [end, endZone, restored, start, startZone]);

  let result: ReturnType<typeof timeDifference> | null = null;
  let startInvalid = false;
  let endInvalid = false;
  try {
    result = timeDifference(start, startZone, end, endZone);
  } catch {
    try {
      timeDifference(start, startZone, start, startZone);
    } catch {
      startInvalid = Boolean(start.trim());
    }
    try {
      timeDifference(end, endZone, end, endZone);
    } catch {
      endInvalid = Boolean(end.trim());
    }
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center">
          <TimeCard
            title={m["shared.dateTools.start"]({}, { locale })}
            value={start}
            zone={startZone}
            offset={result?.start.offset}
            invalid={startInvalid}
            onValueChange={setStart}
            onZoneChange={setStartZone}
            onNow={() =>
              setStart(snapshot(BigInt(Date.now()), startZone).dateTime)
            }
          />
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onPress={() => {
                setStart(end);
                setEnd(start);
                setStartZone(endZone);
                setEndZone(startZone);
              }}
            >
              <ArrowLeftRight aria-hidden className="size-4" />
              {m["shared.dateTools.swap"]({}, { locale })}
            </Button>
          </div>
          <TimeCard
            title={m["shared.dateTools.end"]({}, { locale })}
            value={end}
            zone={endZone}
            offset={result?.end.offset}
            invalid={endInvalid}
            onValueChange={setEnd}
            onZoneChange={setEndZone}
            onNow={() => setEnd(snapshot(BigInt(Date.now()), endZone).dateTime)}
          />
        </div>
        <ResultsCard result={result} />
      </div>
      <Article />
    </div>
  );
}

function TimeCard({
  title,
  value,
  zone,
  offset,
  invalid,
  onValueChange,
  onZoneChange,
  onNow,
}: {
  title: string;
  value: string;
  zone: string;
  offset?: string;
  invalid: boolean;
  onValueChange: (value: string) => void;
  onZoneChange: (value: string) => void;
  onNow: () => void;
}) {
  const id = useId();
  const locale = getLocale();
  const { contains } = useFilter({ sensitivity: "base" });
  const options = useMemo(() => zones(), []);
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{title}</Card.Title>
        <Card.Description>
          {m["tools.durationCalculator.formatHint"]({}, { locale })}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-date`}>
            {m["tools.durationCalculator.dateTimeLabel"]({}, { locale })}
          </Label>
          <InputGroup variant="secondary" fullWidth>
            <InputGroup.Input
              id={`${id}-date`}
              value={value}
              placeholder={m["tools.durationCalculator.dateTimePlaceholder"](
                {},
                { locale },
              )}
              aria-invalid={invalid}
              className="font-mono"
              onChange={(event) => onValueChange(event.currentTarget.value)}
            />
            <InputGroup.Suffix>
              <Button size="sm" variant="ghost" onPress={onNow}>
                {m["shared.cronTools.now"]({}, { locale })}
              </Button>
            </InputGroup.Suffix>
          </InputGroup>
          {invalid ? (
            <p className="text-sm text-danger">
              {m["tools.durationCalculator.invalidDateTimeLabel"](
                {},
                { locale },
              )}
            </p>
          ) : null}
        </div>
        <Autocomplete
          selectedKey={zone}
          onSelectionChange={(key) => key != null && onZoneChange(String(key))}
          fullWidth
          variant="secondary"
        >
          <Label>{m["shared.dateTools.zone"]({}, { locale })}</Label>
          <Autocomplete.Trigger>
            <Autocomplete.Value />
            <Autocomplete.Indicator />
          </Autocomplete.Trigger>
          <Autocomplete.Popover className="max-h-80">
            <Autocomplete.Filter filter={contains}>
              <SearchField
                aria-label={m["shared.dateTools.zone"]({}, { locale })}
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input
                    placeholder={m["shared.dateTools.zone"]({}, { locale })}
                  />
                </SearchField.Group>
              </SearchField>
              <ListBox className="max-h-64 overflow-y-auto">
                {options.map((item) => (
                  <ListBox.Item key={item} id={item} textValue={item}>
                    {item}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Autocomplete.Filter>
          </Autocomplete.Popover>
        </Autocomplete>
        <p className="text-sm text-muted">
          {m["tools.durationCalculator.offsetLabel"]({}, { locale })}:{" "}
          <span className="font-mono">UTC{offset ?? "—"}</span>
        </p>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultsCard({
  result,
}: {
  result: ReturnType<typeof timeDifference> | null;
}) {
  const locale = getLocale();
  const rows = [
    [
      m["tools.timeDiffCalculator.signedDurationLabel"]({}, { locale }),
      result?.signedDuration,
    ],
    [
      m["shared.dateTools.absoluteduration"]({}, { locale }),
      result?.absoluteDuration,
    ],
    [m["shared.dateTools.isoduration"]({}, { locale }), result?.isoDuration],
    [
      m["shared.dateTools.totalmilliseconds"]({}, { locale }),
      result?.totalMilliseconds,
    ],
    [
      m["tools.timeDiffCalculator.totalSecondsLabel"]({}, { locale }),
      result?.totalSeconds,
    ],
    [m["shared.dateTools.totalminutes"]({}, { locale }), result?.totalMinutes],
    [m["shared.dateTools.totalhours"]({}, { locale }), result?.totalHours],
    [m["shared.dateTools.totaldays"]({}, { locale }), result?.totalDays],
  ] as const;
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["common.passresultstitle"]({}, { locale })}</Card.Title>
      </Card.Header>
      <ToolPanelCardContent className="gap-0 py-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-2 border-t border-separator py-3 first:border-0 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center"
          >
            <span className="text-sm text-muted">{label}</span>
            <code className="min-w-0 text-sm break-all">{value ?? "—"}</code>
            <ToolCopyButton
              value={value ?? ""}
              copyLabel={m["common.actions.copy"]({}, { locale })}
              copiedLabel={m["common.actions.copied"]({}, { locale })}
              disabled={!value}
            />
          </div>
        ))}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function Article() {
  const locale = getLocale();
  return (
    <ToolArticle>
      <h2>
        {m["tools.timeDiffCalculator.article.purposeTitle"]({}, { locale })}
      </h2>
      <p>{m["tools.timeDiffCalculator.articlePurpose"]({}, { locale })}</p>
      <h2>{m["tools.timeDiffCalculator.article.usesTitle"]({}, { locale })}</h2>
      <ul>
        <li>{m["tools.timeDiffCalculator.articleUses0"]({}, { locale })}</li>
        <li>{m["tools.timeDiffCalculator.articleUses1"]({}, { locale })}</li>
        <li>{m["tools.timeDiffCalculator.articleUses2"]({}, { locale })}</li>
      </ul>
      <h2>{m["tools.durationCalculator.article.howTitle"]({}, { locale })}</h2>
      <ul>
        <li>{m["tools.timeDiffCalculator.articleHow0"]({}, { locale })}</li>
        <li>{m["tools.timeDiffCalculator.articleHow1"]({}, { locale })}</li>
        <li>{m["tools.timeDiffCalculator.article.how2"]({}, { locale })}</li>
      </ul>
    </ToolArticle>
  );
}

export function TimeDiffCalculator() {
  const locale = getLocale();
  return (
    <ToolPage
      instructions={m["tools.timeDiffCalculator.usage"]({}, { locale })}
    >
      <TimeDiffCalculatorContent />
    </ToolPage>
  );
}

export default TimeDiffCalculator;
