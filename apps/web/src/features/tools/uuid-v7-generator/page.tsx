import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
} from "@heroui/react";
import { Download, RefreshCcw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import type { MessageFunction } from "@/lib/message-keys";
import { m } from "@/paraglide/messages.js";
import {
  generateUuidV7,
  MAX_UUID_TIMESTAMP,
  UuidV7Error,
} from "@workspace/tools/uuid/generate";

const errorMessages = {
  uuid_v7_invalid_count: m["shared.uuidGenerator.v7InvalidCount"],
  uuid_invalid_count: m["shared.uuidGenerator.invalidCount"],
  uuid_invalid_timestamp: m["shared.uuidGenerator.invalidTimestamp"],
  uuid_crypto_unavailable: m["shared.uuidGenerator.cryptoUnavailable"],
  uuid_random_overflow: m["shared.uuidGenerator.randomOverflow"],
} as const;

function UuidV7GeneratorContent() {
  const id = useId();
  const [mode, setMode] = useState("single");
  const [clock, setClock] = useState("now");
  const [count, setCount] = useState("10");
  const [timestamp, setTimestamp] = useState("");
  const [result, setResult] = useState<ReturnType<
    typeof generateUuidV7
  > | null>(null);
  const [error, setError] = useState<keyof typeof errorMessages | null>(null);
  const download = useRef<string | null>(null);
  const clear = useCallback(() => {
    setResult(null);
    setError(null);
    if (download.current) URL.revokeObjectURL(download.current);
    download.current = null;
  }, []);
  const run = useCallback((amount: number, time: number) => {
    try {
      setResult(generateUuidV7(amount, time));
      setError(null);
    } catch (e) {
      setResult(null);
      setError(
        `uuid_${e instanceof UuidV7Error ? e.code : "crypto_unavailable"}` as keyof typeof errorMessages,
      );
    }
  }, []);
  useEffect(() => {
    const now = Date.now();
    setTimestamp(String(now));
    run(1, now);
    return () => {
      if (download.current) URL.revokeObjectURL(download.current);
    };
  }, [run]);
  function generate() {
    clear();
    if (
      mode === "batch" &&
      (!/^\d+$/.test(count) || Number(count) < 2 || Number(count) > 100)
    ) {
      setError("uuid_v7_invalid_count");
      return;
    }
    if (clock === "custom" && !/^\d+$/.test(timestamp)) {
      setError("uuid_invalid_timestamp");
      return;
    }
    run(
      mode === "single" ? 1 : Number(count),
      clock === "now" ? Date.now() : Number(timestamp),
    );
  }
  const output = result?.values.join("\n") ?? "";
  const milliseconds = Number(timestamp);
  const dateValue =
    timestamp &&
    Number.isInteger(milliseconds) &&
    milliseconds >= 0 &&
    milliseconds <= MAX_UUID_TIMESTAMP
      ? new Date(milliseconds).toISOString()
      : "";
  const dateInput =
    dateValue && !dateValue.startsWith("+") ? dateValue.slice(0, -1) : "";
  function save() {
    if (download.current) URL.revokeObjectURL(download.current);
    const url = URL.createObjectURL(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
    );
    download.current = url;
    const a = document.createElement("a");
    a.href = url;
    a.download = "uuid-v7.txt";
    a.click();
  }
  function selection(
    name: string,
    value: string,
    options: {
      value: string;
      message: MessageFunction;
    }[],
    change: (v: string) => void,
  ) {
    return (
      <div className="space-y-2">
        <Select
          variant="secondary"
          selectedKey={value}
          onSelectionChange={(key) => {
            if (key == null) return;
            clear();
            change(String(key));
          }}
        >
          <Label>
            {(name === "mode"
              ? m["shared.uuidGenerator.v7Mode"]
              : m["shared.uuidGenerator.clock"])({})}
          </Label>
          <Select.Trigger id={`${id}-${name}`} className="min-h-11">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Section>
                {options.map((option) => (
                  <ListBox.Item
                    key={option.value}
                    id={option.value}
                    textValue={String(option.value)}
                  >
                    {option.message({})}
                  </ListBox.Item>
                ))}
              </ListBox.Section>
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
    );
  }
  return (
    <div className="grid gap-8">
      <div className="grid items-stretch gap-6 xl:grid-cols-2" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.uuidGenerator.v7OptionsTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["shared.uuidGenerator.v7OptionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {selection(
                "mode",
                mode,
                [
                  {
                    value: "single",
                    message: m["shared.uuidGenerator.single"],
                  },
                  { value: "batch", message: m["shared.uuidGenerator.batch"] },
                ],
                setMode,
              )}
              {selection(
                "clock",
                clock,
                [
                  { value: "now", message: m["shared.uuidGenerator.now"] },
                  {
                    value: "custom",
                    message: m["shared.uuidGenerator.custom"],
                  },
                ],
                setClock,
              )}
            </div>
            {mode === "batch" ? (
              <div className="grid gap-2">
                <Label htmlFor={`${id}-count`}>
                  {m["tools.uuidV7Generator.v7Count"]()}
                </Label>
                <Input
                  id={`${id}-count`}
                  type="number"
                  min={2}
                  max={100}
                  step={1}
                  value={count}
                  aria-invalid={error === "uuid_v7_invalid_count"}
                  aria-describedby={
                    error === "uuid_v7_invalid_count"
                      ? `${id}-error`
                      : undefined
                  }
                  onChange={(event) => {
                    clear();
                    setCount(event.target.value);
                  }}
                />
              </div>
            ) : null}
            {clock === "custom" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-ms`}>
                    {m["tools.uuidV7Generator.milliseconds"]()}
                  </Label>
                  <Input
                    id={`${id}-ms`}
                    dir="ltr"
                    inputMode="numeric"
                    value={timestamp}
                    aria-invalid={error === "uuid_invalid_timestamp"}
                    aria-describedby={
                      error === "uuid_invalid_timestamp"
                        ? `${id}-error`
                        : undefined
                    }
                    onChange={(event) => {
                      clear();
                      setTimestamp(event.target.value);
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-date`}>
                    {m["tools.uuidV7Generator.datetime"]()}
                  </Label>
                  <Input
                    id={`${id}-date`}
                    type="datetime-local"
                    step="0.001"
                    value={dateInput}
                    onChange={(event) => {
                      clear();
                      setTimestamp(
                        event.target.value
                          ? String(Date.parse(`${event.target.value}Z`))
                          : "",
                      );
                    }}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="sm:col-span-2 sm:justify-self-start"
                  onPress={() => {
                    clear();
                    setTimestamp(String(Date.now()));
                  }}
                >
                  {m["tools.uuidV7Generator.setNow"]()}
                </Button>
              </div>
            ) : null}
            {error ? (
              <Alert id={`${id}-error`} role="alert" status="danger">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>
                    {errorMessages[error]({})}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.uuidGenerator.v7ResultsTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["shared.uuidGenerator.v7ResultsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextArea
              id={`${id}-output`}
              aria-label={m["shared.uuidGenerator.output"]()}
              dir="ltr"
              readOnly
              rows={14}
              value={output}
              className="min-h-80 resize-y font-mono text-sm"
            />
            <p aria-live="polite" className="text-sm text-muted">
              {result
                ? m["tools.uuidV7Generator.v7Summary"]({
                    count: result.values.length,
                    timestamp: result.timestamp,
                  })
                : ""}
            </p>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="gap-2">
            <ToolCopyButton
              value={output}
              copyLabel={m["shared.uuidGenerator.copy"]()}
              copiedLabel={m["common.actions.copied"]()}
              errorLabel={m["shared.uuidGenerator.copyError"]()}
              variant="ghost"
            />
            <Button
              variant="ghost"
              size="sm"
              isDisabled={!output}
              onPress={save}
            >
              <Download aria-hidden className="size-4" />
              {m["shared.uuidGenerator.download"]()}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="sm:ms-auto"
              onPress={generate}
            >
              <RefreshCcw aria-hidden className="size-4" />
              {m["shared.uuidGenerator.generate"]()}
            </Button>
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["shared.uuidGenerator.v7FormatTitle"]()}</h2>
        <p>{m["tools.uuidV7Generator.v7Note"]()}</p>
        <h2>{m["shared.uuidGenerator.v7PrivacyTitle"]()}</h2>
        <p>{m["tools.uuidV7Generator.v7Privacy"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function UuidV7Generator() {
  return (
    <ToolPage>
      <UuidV7GeneratorContent />
    </ToolPage>
  );
}
