import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Button, Card, TextArea, TextField } from "@heroui/react";
import { ScanSearch } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/base/empty";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { parseUserAgent } from "@workspace/tools/network/user-agent";
import { Output } from "./output";

const errorMessages = {
  dev_error_too_large: m["tools.userAgentParser.devErrorTooLarge"],
  dev_error_invalid_input: m["tools.userAgentParser.devErrorInvalidInput"],
  dev_error_timeout: m["tools.userAgentParser.devErrorTimeout"],
  dev_error_worker_failed: m["tools.userAgentParser.devErrorWorkerFailed"],
  dev_error_conversion_failed:
    m["tools.userAgentParser.devErrorConversionFailed"],
  dev_error_output_too_large: m["tools.userAgentParser.devErrorOutputTooLarge"],
  dev_error_invalid_unicode: m["tools.userAgentParser.devErrorInvalidUnicode"],
} as const;

function errorKey(error: unknown) {
  const key = `dev_error_${error instanceof Error ? error.message : "conversion_failed"}`;
  return Object.hasOwn(errorMessages, key)
    ? (key as keyof typeof errorMessages)
    : "dev_error_conversion_failed";
}
function UserAgentParserContent() {
  const [input, setInput] = useState("");
  const state = useMemo(() => {
    try {
      return { value: parseUserAgent(input), error: null };
    } catch (e) {
      return { value: null, error: errorKey(e) };
    }
  }, [input]);
  const parsed = state.value;
  const sections = [
    ["browser", m["common.uaBrowser"]],
    ["os", m["tools.userAgentParser.os"]],
    ["engine", m["tools.userAgentParser.engine"]],
    ["device", m["tools.userAgentParser.device"]],
    ["cpu", m["tools.userAgentParser.cpu"]],
  ] as const;
  const fields = {
    name: m["common.uaFieldName"],
    version: m["tools.userAgentParser.fieldVersion"],
    major: m["tools.userAgentParser.fieldMajor"],
    type: m["common.uaFieldType"],
    vendor: m["tools.userAgentParser.fieldVendor"],
    model: m["tools.userAgentParser.fieldModel"],
    architecture: m["tools.userAgentParser.fieldArchitecture"],
  } as const;
  return (
    <div
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
      data-tool-panels
    >
      <ToolPanelCard>
        <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Card.Title>{m["tools.userAgentParser.devInput"]()}</Card.Title>
            <Card.Description>
              {m["tools.userAgentParser.note"]()}
            </Card.Description>
          </div>
          <ToolPanelActionGroup className="shrink-0 sm:justify-end">
            <Button
              className="min-h-11"
              variant="outline"
              onPress={() => setInput(navigator.userAgent)}
            >
              {m["tools.userAgentParser.devCurrent"]()}
            </Button>
            <Button
              className="min-h-11"
              variant="ghost"
              isDisabled={!input}
              onPress={() => setInput("")}
            >
              {m["tools.userAgentParser.devClear"]()}
            </Button>
          </ToolPanelActionGroup>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          <TextField
            fullWidth
            aria-label={m["tools.userAgentParser.devInput"]()}
          >
            <TextArea
              aria-label={m["tools.userAgentParser.devInput"]()}
              value={input}
              className="min-h-64 w-full resize-y font-mono"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setInput(e.target.value)}
            />
          </TextField>
          {state.error ? (
            <p role="alert" className="text-sm text-danger">
              {errorMessages[state.error]({})}
            </p>
          ) : null}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>{m["common.devOutput"]()}</Card.Title>
          <Card.Description>
            {m["tools.userAgentParser.outputDescription"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          {parsed ? (
            <>
              <div className="grid divide-y divide-separator sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0">
                {sections.map(([key, label]) => (
                  <section
                    key={key}
                    className="grid content-start gap-3 border-b border-separator py-4 first:pt-0 last:border-b-0"
                  >
                    <h3 className="font-medium">{label({})}</h3>
                    <dl className="grid gap-2 text-sm">
                      {Object.entries(parsed[key]).map(([k, v]) => (
                        <div
                          key={k}
                          className="flex flex-wrap justify-between gap-2"
                        >
                          <dt className="text-muted">
                            {fields[k as keyof typeof fields]({})}
                          </dt>
                          <dd className="text-end break-all">
                            {v ?? m["tools.userAgentParser.devUnknown"]()}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
              <Output
                value={JSON.stringify(parsed, null, 2)}
                filename="user-agent.json"
                language="json"
              />
            </>
          ) : (
            <Empty className="min-h-64 border-0 p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScanSearch aria-hidden />
                </EmptyMedia>
                <EmptyDescription>
                  {m["tools.userAgentParser.empty"]()}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>
    </div>
  );
}

export function UserAgentParser() {
  return (
    <ToolPage>
      <UserAgentParserContent />
    </ToolPage>
  );
}
