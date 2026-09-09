import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
} from "@heroui/react";
import { Download, RefreshCcw } from "lucide-react";
import { startTransition, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  EPOCH,
  generate,
  KsuidError,
  localSeconds,
  localText,
  MAX_TIME,
  unixSeconds,
} from "@workspace/tools/id/ksuid";

type Mode = "now" | "custom";

function KsuidToolContent() {
  const locale = getLocale();
  const countId = useId();
  const dateId = useId();
  const unixId = useId();
  const initialSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);
  const [count, setCount] = useState("5");
  const [mode, setMode] = useState<Mode>("now");
  const [customUnix, setCustomUnix] = useState(String(initialSeconds));
  const [customDate, setCustomDate] = useState(localText(initialSeconds));
  const [version, setVersion] = useState(0);
  const parsed = parseCustom(customUnix);
  const timestampError = mode === "custom" ? parsed.error : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: version explicitly requests a fresh secure-random batch
  const generation = useMemo(() => {
    if (mode === "custom" && parsed.value === null) {
      return { result: null, error: "" };
    }
    try {
      return {
        result: generate(
          Number(count),
          mode === "custom"
            ? (parsed.value ?? Number.NaN)
            : Math.floor(Date.now() / 1000),
        ),
        error: "",
      };
    } catch (error) {
      return {
        result: null,
        error:
          error instanceof KsuidError && error.code === "count"
            ? m["tools.ksuidGenerator.errorsCount"]()
            : m["tools.ksuidGenerator.errorsRandom"](),
      };
    }
  }, [locale, count, mode, parsed.value, version]);
  const output = generation.result?.ids.join("\n") ?? "";
  const generatedAt = generation.result
    ? m["tools.ksuidGenerator.generatedAtLabel"]({
        seconds: new Intl.NumberFormat(locale).format(
          generation.result.timestamp,
        ),
      })
    : "";

  function setCurrentTime() {
    const seconds = Math.floor(Date.now() / 1000);
    setCustomUnix(String(seconds));
    setCustomDate(localText(seconds));
    setVersion((value) => value + 1);
  }

  function download() {
    if (!generation.result) return;
    const url = URL.createObjectURL(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
    );
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ksuid-${generation.result.count}-${generation.result.timestamp}.txt`;
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="grid gap-8">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.aesTools.encryptoptionscardtitle"]()}
            </Card.Title>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <div className="grid gap-2">
              <Label htmlFor={countId}>
                {m["tools.cuid2Generator.countLabel"]()}
              </Label>
              <Input
                id={countId}
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(event) => setCount(event.target.value)}
              />
            </div>
            <Select
              variant="secondary"
              selectedKey={mode}
              onSelectionChange={(key) => {
                if (key === "now" || key === "custom") setMode(key);
              }}
            >
              <Label>{m["tools.ksuidGenerator.timestampModeLabel"]()}</Label>
              <Select.Trigger className="min-h-11 w-full">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox
                  aria-label={m["tools.ksuidGenerator.timestampModeLabel"]()}
                >
                  <ListBox.Item
                    id="now"
                    textValue={m["tools.ksuidGenerator.timestampNowLabel"]()}
                  >
                    {m["tools.ksuidGenerator.timestampNowLabel"]()}
                  </ListBox.Item>
                  <ListBox.Item
                    id="custom"
                    textValue={m["common.ksuidCustom"]()}
                  >
                    {m["common.ksuidCustom"]()}
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
            {mode === "custom" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={dateId}>
                    {m["tools.ksuidGenerator.customDateTimeLabel"]()}
                  </Label>
                  <Input
                    id={dateId}
                    type="datetime-local"
                    step="1"
                    value={customDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCustomDate(value);
                      try {
                        setCustomUnix(String(localSeconds(value)));
                      } catch {
                        setCustomUnix("");
                      }
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={unixId}>
                    {m["tools.ksuidGenerator.customUnixSecondsLabel"]()}
                  </Label>
                  <Input
                    id={unixId}
                    inputMode="numeric"
                    value={customUnix}
                    aria-invalid={Boolean(timestampError)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCustomUnix(value);
                      const next = parseCustom(value);
                      setCustomDate(
                        next.value === null ? "" : localText(next.value),
                      );
                    }}
                  />
                </div>
              </div>
            ) : null}
            {timestampError ? (
              <p role="alert" className="text-sm text-danger">
                {timestampError}
              </p>
            ) : null}
            <p className="text-sm text-muted">
              {m["tools.ksuidGenerator.epochLabel"]()}
            </p>
            {mode === "custom" ? (
              <Button size="sm" variant="outline" onPress={setCurrentTime}>
                {m["tools.ksuidGenerator.setNow"]()}
              </Button>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
            <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
            <ToolPanelActionGroup className="shrink-0 sm:justify-end">
              <Button
                size="sm"
                variant="ghost"
                onPress={() =>
                  startTransition(() => setVersion((value) => value + 1))
                }
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.ksuidRegenerate"]()}
              </Button>
              <ToolCopyButton
                value={output}
                copyLabel={m["common.actions.copyResult"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={!output}
                variant="ghost"
              />
              <Button size="sm" isDisabled={!output} onPress={download}>
                <Download aria-hidden className="size-4" />
                {m["common.actions.download"]()}
              </Button>
            </ToolPanelActionGroup>
          </Card.Header>
          <ToolPanelCardContent className="gap-3 py-4">
            <TextArea
              aria-label={m["common.passresultstitle"]()}
              value={output}
              readOnly
              rows={10}
              placeholder={m["tools.ksuidGenerator.resultsPlaceholder"]()}
              className="min-h-72 font-mono"
            />
            {generatedAt ? (
              <p className="text-sm text-muted">{generatedAt}</p>
            ) : null}
            {generation.error ? (
              <p role="alert" className="text-sm text-danger">
                {generation.error}
              </p>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <p>{m["tools.ksuidGenerator.articleIntro"]()}</p>
        <h2>{m["tools.ksuidGenerator.articleWhyTitle"]()}</h2>
        <p>{m["tools.ksuidGenerator.articleWhyBody"]()}</p>
        <h2>{m["tools.ksuidGenerator.articleTimeTitle"]()}</h2>
        <p>{m["tools.ksuidGenerator.articleTimeBody"]()}</p>
        <h2>{m["tools.ksuidGenerator.articleExportTitle"]()}</h2>
        <p>{m["tools.ksuidGenerator.articleExportBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function parseCustom(value: string) {
  if (!value.trim())
    return { value: null, error: m["tools.ksuidGenerator.timestampInvalid"]() };
  const numeric = Number(value);
  if (!Number.isFinite(numeric))
    return { value: null, error: m["tools.ksuidGenerator.timestampInvalid"]() };
  const seconds = Math.floor(numeric);
  if (seconds < EPOCH || seconds > MAX_TIME) {
    return {
      value: null,
      error: m["tools.ksuidGenerator.timestampOutOfRange"]({
        min: String(EPOCH),
        max: String(MAX_TIME),
      }),
    };
  }
  return { value: unixSeconds(seconds), error: "" };
}

export default function KsuidTool() {
  return (
    <ToolPage>
      <KsuidToolContent />
    </ToolPage>
  );
}
