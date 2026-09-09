import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Autocomplete,
  Button,
  Card,
  InputGroup,
  Label,
  ListBox,
  SearchField,
  Select,
  TextField,
  useFilter,
} from "@heroui/react";
import { Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import {
  calculateDuration,
  DateToolError,
  durationIso,
  durationParts,
  parseDuration,
  resolveTime,
  snapshot,
  zones,
} from "@workspace/tools/time/date-time";

function Field({
  label,
  value,
  change,
  type = "text",
  action,
}: {
  label: string;
  value: string;
  change: (s: string) => void;
  type?: string;
  action?: ReactNode;
}) {
  const id = useId();
  return (
    <TextField className="gap-2">
      <Label>{label}</Label>
      <InputGroup variant="secondary" fullWidth className="min-h-11">
        <InputGroup.Input
          id={id}
          type={type}
          className="font-mono"
          value={value}
          onChange={(event) => change(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {action ? <InputGroup.Suffix>{action}</InputGroup.Suffix> : null}
      </InputGroup>
    </TextField>
  );
}
function Choice({
  label,
  value,
  change,
  options,
  searchable = false,
  name,
}: {
  label: string;
  value: string;
  change: (s: string) => void;
  options: {
    value: string;
    label: string;
  }[];
  searchable?: boolean;
  name?: string;
}) {
  const id = useId();
  const { contains } = useFilter({ sensitivity: "base" });
  if (searchable)
    return (
      <div className="min-w-0 space-y-2">
        <Autocomplete
          id={id}
          name={name}
          variant="secondary"
          selectedKey={value}
          onSelectionChange={(key) => {
            if (key != null) change(String(key));
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
                {options.map((o) => (
                  <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
                    {o.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Autocomplete.Filter>
          </Autocomplete.Popover>
        </Autocomplete>
      </div>
    );
  return (
    <div className="min-w-0 space-y-2">
      <Select
        variant="secondary"
        selectedKey={value}
        onSelectionChange={(key) => {
          if (key != null) change(String(key));
        }}
      >
        <Label>{label}</Label>
        <Select.Trigger id={id} className="min-h-11 w-full">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Section>
              {options.map((o) => (
                <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
                  {o.label}
                </ListBox.Item>
              ))}
            </ListBox.Section>
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
function DurationCalculatorContent() {
  const [base, setBase] = useState("2026-01-01 00:00:00.000");
  const [zone, setZone] = useState("UTC");
  const [iso, setIso] = useState("P1DT2H3M4.005S");
  const [parts, setParts] = useState(durationParts(93784005n));
  const [source, setSource] = useState<"iso" | "parts">("iso");
  const [restored, setRestored] = useState(false);
  const zoneOptions = useMemo(
    () => zones().map((value) => ({ value, label: value })),
    [],
  );

  useEffect(() => {
    const fallbackZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const storedZone =
      safeLocalStorage.getItem("tools:duration-calculator:zone") ??
      fallbackZone;
    const safeZone = zones().includes(storedZone) ? storedZone : "UTC";
    setZone(safeZone);
    setBase(
      safeLocalStorage.getItem("tools:duration-calculator:base") ??
        snapshot(BigInt(Date.now()), safeZone).dateTime,
    );
    const storedIso = safeLocalStorage.getItem("tools:duration-calculator:iso");
    if (storedIso) {
      try {
        const value = parseDuration(storedIso);
        setIso(storedIso);
        setParts(durationParts(value));
      } catch {}
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    safeLocalStorage.setItem("tools:duration-calculator:base", base);
    safeLocalStorage.setItem("tools:duration-calculator:zone", zone);
    safeLocalStorage.setItem("tools:duration-calculator:iso", iso);
  }, [base, iso, restored, zone]);

  let result: ReturnType<typeof calculateDuration> | null = null,
    error: unknown,
    offset = "";
  try {
    result = calculateDuration(base, zone, source === "iso" ? iso : parts);
    offset = resolveTime(base, zone).offset;
  } catch (e) {
    error = e;
  }
  const invalidDate =
    error instanceof DateToolError &&
    ["invalid_date", "invalid_zone", "ambiguous_date"].includes(error.code);
  const invalidDuration =
    error instanceof DateToolError &&
    ["invalid_duration", "out_of_range"].includes(error.code);
  const partFields = [
    ["days", m["shared.dateTools.days"]()],
    ["hours", m["shared.dateTools.hours"]()],
    ["minutes", m["shared.dateTools.minutes"]()],
    ["seconds", m["shared.dateTools.seconds"]()],
    ["milliseconds", m["shared.dateTools.milliseconds"]()],
  ] as const;
  const setPart = (key: keyof typeof parts, value: string) => {
    const next = { ...parts, [key]: value };
    setParts(next);
    setSource("parts");
    try {
      setIso(durationIso(parseDuration(next)));
    } catch {}
  };
  const ResultCard = ({
    title,
    operator,
    value,
  }: {
    title: string;
    operator: string;
    value: ReturnType<typeof snapshot> | null;
  }) => (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{title}</Card.Title>
        <Card.Description>
          {m["tools.durationCalculator.baseTimeLabel"]()} {operator}{" "}
          {m["tools.audioRecorder.duration"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        {[
          [
            m["tools.durationCalculator.dateTimeLabel"](),
            value?.dateTime ?? "",
          ],
          [m["tools.durationCalculator.iso8601Label"](), value?.iso8601 ?? ""],
          [
            m["tools.durationCalculator.unixMillisecondsLabel"](),
            value?.unixMilliseconds ?? "",
          ],
          [
            m["tools.durationCalculator.unixSecondsLabel"](),
            value?.unixSeconds ?? "",
          ],
        ].map(([label, field]) => (
          <div
            className="grid gap-2 border-t border-separator pt-4 first:border-t-0 first:pt-0"
            key={label}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{label}</span>
              <ToolCopyButton
                value={field}
                copyLabel={m["common.actions.copy"]()}
                copiedLabel={m["common.actions.copied"]()}
                variant="ghost"
              />
            </div>
            <code className="block overflow-x-auto rounded-lg bg-default/60 px-3 py-2 text-sm">
              {field || "—"}
            </code>
          </div>
        ))}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
  return (
    <div className="grid gap-10">
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="grid gap-6">
          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["tools.durationCalculator.baseTimeLabel"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.durationCalculator.formatHint"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              <Choice
                label={m["shared.dateTools.zone"]()}
                value={zone}
                change={setZone}
                options={zoneOptions}
                searchable
                name="baseTimeZone"
              />
              <p className="text-sm text-muted-foreground">
                {m["tools.durationCalculator.offsetLabel"]()}: {offset || "—"}
              </p>
              <Field
                label={m["tools.durationCalculator.dateTimeLabel"]()}
                value={base}
                change={setBase}
                action={
                  <>
                    <ToolCopyButton
                      value={base}
                      copyLabel={m["common.actions.copy"]()}
                      copiedLabel={m["common.actions.copied"]()}
                      size="icon-sm"
                      variant="ghost"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      isIconOnly
                      aria-label={m["shared.cronTools.now"]()}
                      onPress={() =>
                        setBase(snapshot(BigInt(Date.now()), zone).dateTime)
                      }
                    >
                      <Clock3 aria-hidden className="size-4" />
                    </Button>
                  </>
                }
              />
              <p className="text-sm text-muted-foreground">
                {m["tools.durationCalculator.formatHint"]()}
              </p>
              {invalidDate ? (
                <p role="alert" className="text-sm text-destructive">
                  {m["tools.durationCalculator.invalidDateTimeLabel"]()}
                </p>
              ) : null}
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>{m["tools.audioRecorder.duration"]()}</Card.Title>
              <Card.Description>
                {m["tools.durationCalculator.durationHint"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              <Field
                label={m["shared.dateTools.isoduration"]()}
                value={iso}
                change={(value) => {
                  setIso(value);
                  setSource("iso");
                  try {
                    setParts(durationParts(parseDuration(value)));
                  } catch {}
                }}
                action={
                  <ToolCopyButton
                    value={result?.duration ?? ""}
                    copyLabel={m["common.actions.copy"]()}
                    copiedLabel={m["common.actions.copied"]()}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              />
              {invalidDuration ? (
                <p role="alert" className="text-sm text-destructive">
                  {m["tools.durationCalculator.invalidDurationLabel"]()}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {partFields.map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    value={parts[key]}
                    type="number"
                    change={(value) => setPart(key, value)}
                  />
                ))}
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>

        <section className="grid gap-3 xl:sticky xl:top-6">
          <h2 className="text-xl font-semibold">
            {m["common.passresultstitle"]()}
          </h2>
          <div className="grid gap-6">
            <ResultCard
              title={m["tools.businessDaysCalculator.addLabel"]()}
              operator="+"
              value={result?.add ?? null}
            />
            <ResultCard
              title={m["tools.businessDaysCalculator.subtractLabel"]()}
              operator="−"
              value={result?.subtract ?? null}
            />
          </div>
        </section>
      </div>
      <ToolArticle>
        <h2>{m["tools.durationCalculator.articleWhatTitle"]()}</h2>
        <p>{m["tools.durationCalculator.articleWhatBody"]()}</p>
        <h2>{m["tools.durationCalculator.articleExamplesTitle"]()}</h2>
        <ul>
          {[
            m["tools.durationCalculator.articleExamples0"](),
            m["tools.durationCalculator.articleExamples1"](),
            m["tools.durationCalculator.articleExamples2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.durationCalculator.article.howTitle"]()}</h2>
        <ul>
          {[
            m["tools.durationCalculator.articleHow0"](),
            m["tools.durationCalculator.articleHow1"](),
            m["tools.durationCalculator.articleHow2"](),
            m["tools.durationCalculator.articleHow3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export function DurationCalculator() {
  return (
    <ToolPage>
      <DurationCalculatorContent />
    </ToolPage>
  );
}
