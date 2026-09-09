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
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import { convertZone, snapshot, zones } from "@workspace/tools/time/date-time";

const STORAGE_KEY = "tools:time-zone-converter";
type Side = "from" | "to";

function TimeZoneConverterContent() {
  const [input, setInput] = useState("2026-01-01 12:00:00.000");
  const [fromZone, setFromZone] = useState("UTC");
  const [toZone, setToZone] = useState("America/New_York");
  const [lastEdited, setLastEdited] = useState<Side>("from");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "null",
      ) as {
        input?: string;
        fromZone?: string;
        toZone?: string;
        lastEdited?: Side;
      } | null;
      const supported = zones();
      const localZone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const from = supported.includes(stored?.fromZone ?? "")
        ? (stored?.fromZone as string)
        : supported.includes(localZone)
          ? localZone
          : "UTC";
      const to = supported.includes(stored?.toZone ?? "")
        ? (stored?.toZone as string)
        : from === "UTC"
          ? "America/New_York"
          : "UTC";
      setFromZone(from);
      setToZone(to);
      setLastEdited(stored?.lastEdited === "to" ? "to" : "from");
      setInput(stored?.input ?? snapshot(BigInt(Date.now()), from).dateTime);
    } catch {
      setInput(snapshot(BigInt(Date.now()), "UTC").dateTime);
    } finally {
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (restored)
      safeLocalStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ input, fromZone, toZone, lastEdited }),
      );
  }, [fromZone, input, lastEdited, restored, toZone]);

  let result: ReturnType<typeof convertZone> | null = null;
  let invalid = false;
  try {
    result =
      lastEdited === "from"
        ? convertZone(input, fromZone, toZone)
        : convertZone(input, toZone, fromZone);
  } catch {
    invalid = Boolean(input.trim());
  }
  const from = lastEdited === "from" ? result?.from : result?.to;
  const to = lastEdited === "from" ? result?.to : result?.from;
  const setNow = (side: Side) => {
    setInput(
      snapshot(BigInt(Date.now()), side === "from" ? fromZone : toZone)
        .dateTime,
    );
    setLastEdited(side);
  };

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center">
          <ZoneCard
            title={m["common.unitfrom"]()}
            value={lastEdited === "from" ? input : (from?.dateTime ?? "")}
            zone={fromZone}
            offset={from?.offset}
            invalid={lastEdited === "from" && invalid}
            onValueChange={(value) => {
              setInput(value);
              setLastEdited("from");
            }}
            onZoneChange={setFromZone}
            onNow={() => setNow("from")}
          />
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onPress={() => {
                setFromZone(toZone);
                setToZone(fromZone);
                setLastEdited(lastEdited === "from" ? "to" : "from");
              }}
            >
              <ArrowLeftRight aria-hidden className="size-4" />
              {m["shared.dateTools.swap"]()}
            </Button>
          </div>
          <ZoneCard
            title={m["common.unitto"]()}
            value={lastEdited === "to" ? input : (to?.dateTime ?? "")}
            zone={toZone}
            offset={to?.offset}
            invalid={lastEdited === "to" && invalid}
            onValueChange={(value) => {
              setInput(value);
              setLastEdited("to");
            }}
            onZoneChange={setToZone}
            onNow={() => setNow("to")}
          />
        </div>
        <DetailsCard
          details={
            result ? (lastEdited === "from" ? result.to : result.from) : null
          }
        />
      </div>
      <Article />
    </div>
  );
}

function ZoneCard({
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
  const { contains } = useFilter({ sensitivity: "base" });
  const options = useMemo(() => zones(), []);
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{title}</Card.Title>
        <Card.Description>
          {m["tools.durationCalculator.formatHint"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-date`}>
            {m["tools.durationCalculator.dateTimeLabel"]()}
          </Label>
          <InputGroup variant="secondary" fullWidth>
            <InputGroup.Input
              id={`${id}-date`}
              value={value}
              placeholder={m["tools.durationCalculator.dateTimePlaceholder"]()}
              aria-invalid={invalid}
              className="font-mono"
              onChange={(event) => onValueChange(event.currentTarget.value)}
            />
            <InputGroup.Suffix>
              <Button size="sm" variant="ghost" onPress={onNow}>
                {m["shared.dateTools.now"]()}
              </Button>
            </InputGroup.Suffix>
          </InputGroup>
          {invalid ? (
            <p className="text-sm text-danger">
              {m["tools.durationCalculator.invalidDateTimeLabel"]()}
            </p>
          ) : null}
        </div>
        <Autocomplete
          selectedKey={zone}
          onSelectionChange={(key) => key != null && onZoneChange(String(key))}
          fullWidth
          variant="secondary"
        >
          <Label>{m["shared.dateTools.zone"]()}</Label>
          <Autocomplete.Trigger>
            <Autocomplete.Value />
            <Autocomplete.Indicator />
          </Autocomplete.Trigger>
          <Autocomplete.Popover className="max-h-80">
            <Autocomplete.Filter filter={contains}>
              <SearchField aria-label={m["shared.dateTools.zone"]()}>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input
                    placeholder={m["shared.dateTools.zone"]()}
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
          {m["tools.durationCalculator.offsetLabel"]()}:{" "}
          <span className="font-mono">UTC{offset ?? "—"}</span>
        </p>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function DetailsCard({
  details,
}: {
  details: ReturnType<typeof snapshot> | null;
}) {
  const rows = [
    [m["tools.durationCalculator.iso8601Label"](), details?.iso8601],
    [m["common.icalUtc"](), details?.utc],
    [
      m["tools.durationCalculator.unixMillisecondsLabel"](),
      details?.unixMilliseconds,
    ],
    [m["tools.durationCalculator.unixSecondsLabel"](), details?.unixSeconds],
  ] as const;
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.dataUriToFileConverter.detailsTitle"]()}
        </Card.Title>
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
              copyLabel={m["common.actions.copy"]()}
              copiedLabel={m["common.actions.copied"]()}
              disabled={!value}
            />
          </div>
        ))}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function Article() {
  return (
    <ToolArticle>
      <h2>{m["tools.timeDiffCalculator.article.purposeTitle"]()}</h2>
      <p>{m["tools.timeZoneConverter.articlePurpose"]()}</p>
      <h2>{m["tools.timeDiffCalculator.article.usesTitle"]()}</h2>
      <ul>
        {[
          m["tools.timeZoneConverter.articleUses0"](),
          m["tools.timeZoneConverter.articleUses1"](),
          m["tools.timeZoneConverter.articleUses2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>{m["tools.timeZoneConverter.articleHowTitle"]()}</h2>
      <ul>
        {[
          m["tools.timeZoneConverter.articleHow0"](),
          m["tools.timeZoneConverter.articleHow1"](),
          m["tools.timeDiffCalculator.article.how2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </ToolArticle>
  );
}

export default function TimeZoneConverter() {
  return (
    <ToolPage instructions={m["tools.timeZoneConverter.usage"]()}>
      <TimeZoneConverterContent />
    </ToolPage>
  );
}
