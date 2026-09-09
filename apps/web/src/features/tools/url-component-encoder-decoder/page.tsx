import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Label,
  ListBox,
  Select,
  TextArea,
} from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  transformUrl,
  UrlCodecError,
  type UrlMode,
  type UrlOperation,
} from "@workspace/tools/encoding/url";

const errorMessages = {
  url_invalid_unicode: m["tools.urlComponentEncoderDecoder.invalidUnicode"],
  url_invalid_encoding: m["tools.urlComponentEncoderDecoder.invalidEncoding"],
  url_too_large: m["tools.urlComponentEncoderDecoder.tooLarge"],
} as const;

const example = "Hello 世界! a+b & c=d";
function UrlEncoderDecoderContent() {
  const id = useId();
  const [source, setSource] = useState({
    text: example,
    operation: "encode" as UrlOperation,
  });
  const [mode, setMode] = useState<UrlMode>("component");
  let output = "";
  let error: keyof typeof errorMessages | null = null;
  try {
    output = transformUrl(source.text, source.operation, mode);
  } catch (failure) {
    error =
      `url_${failure instanceof UrlCodecError ? failure.code : "invalid_encoding"}` as keyof typeof errorMessages;
  }
  const plain = source.operation === "encode" ? source.text : output;
  const encoded = source.operation === "decode" ? source.text : output;
  function change(text: string, operation: UrlOperation) {
    setSource({ text, operation });
  }
  return (
    <div className="grid gap-8">
      <div className="grid items-stretch gap-6 lg:grid-cols-2" data-tool-panels>
        {(["encode", "decode"] as const).map((operation) => {
          const value = operation === "encode" ? plain : encoded;
          const invalid = Boolean(error && source.operation === operation);
          const label = (
            operation === "encode"
              ? m["tools.urlComponentEncoderDecoder.plain"]
              : m["tools.urlComponentEncoderDecoder.encoded"]
          )({});
          const copyLabel = (
            operation === "encode"
              ? m["tools.urlComponentEncoderDecoder.copyPlain"]
              : m["common.urlCopyEncoded"]
          )({});
          return (
            <ToolPanelCard key={operation}>
              <Card.Header className="border-b border-separator">
                <Card.Title>{label}</Card.Title>
              </Card.Header>
              <ToolPanelCardContent className="gap-4 py-4">
                {operation === "encode" ? (
                  <Select
                    variant="secondary"
                    selectedKey={mode}
                    onSelectionChange={(key) => {
                      if (key == null) return;
                      setMode(String(key) as UrlMode);
                    }}
                    className="sm:max-w-56"
                  >
                    <Label>
                      {m["tools.urlComponentEncoderDecoder.mode"]()}
                    </Label>
                    <Select.Trigger id={`${id}-mode`}>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="component" textValue="component">
                          {m["tools.urlComponentEncoderDecoder.component"]()}
                        </ListBox.Item>
                        <ListBox.Item id="uri" textValue="uri">
                          {m["tools.urlComponentEncoderDecoder.uri"]()}
                        </ListBox.Item>
                      </ListBox>
                    </Select.Popover>
                  </Select>
                ) : null}
                <TextArea
                  id={`${id}-${operation}`}
                  aria-label={label}
                  dir="ltr"
                  className="min-h-64 flex-1 resize-y font-mono"
                  spellCheck={false}
                  value={value}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? `${id}-error` : undefined}
                  onChange={(event) => change(event.target.value, operation)}
                />
                {invalid && error ? (
                  <Alert id={`${id}-error`} status="danger" role="alert">
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
              <ToolPanelCardFooter className="justify-between gap-2">
                <ToolCopyButton
                  value={value}
                  copyLabel={copyLabel}
                  copiedLabel={m["common.actions.copied"]()}
                  errorLabel={m["tools.urlComponentEncoderDecoder.copyError"]()}
                  disabled={Boolean(error)}
                />
                {operation === "encode" ? (
                  <ToolPanelActionGroup className="justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => change(example, "encode")}
                    >
                      {m["tools.urlComponentEncoderDecoder.reset"]()}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => change("", "encode")}
                    >
                      {m["tools.urlComponentEncoderDecoder.clear"]()}
                    </Button>
                  </ToolPanelActionGroup>
                ) : null}
              </ToolPanelCardFooter>
            </ToolPanelCard>
          );
        })}
      </div>
      <ToolArticle>
        <p>{m["tools.urlComponentEncoderDecoder.explanation"]()}</p>
        <p>{m["tools.urlComponentEncoderDecoder.plusNote"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function UrlEncoderDecoder() {
  return (
    <ToolPage>
      <UrlEncoderDecoderContent />
    </ToolPage>
  );
}
