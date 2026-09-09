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
import { RefreshCcw, X } from "lucide-react";
import { useDeferredValue, useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  decodeHtmlText,
  encodeHtmlText,
  type HtmlFormat,
  type HtmlRange,
  TextCodecError,
} from "@workspace/tools/encoding/html";

type Source = { side: "plain" | "encoded"; value: string };

const STORAGE_KEYS = {
  plainText: "tools:html-entity-encoder-decoder:plain-text",
  format: "tools:html-entity-encoder-decoder:format",
  range: "tools:html-entity-encoder-decoder:range",
} as const;
const DEFAULT_TEXT = '<div class="hello">Hello & World</div>';
const DEFAULT_FORMAT: HtmlFormat = "named";
const DEFAULT_RANGE: HtmlRange = "minimal";
const FORMATS = new Set<HtmlFormat>(["named", "decimal", "hex"]);
const RANGES = new Set<HtmlRange>(["minimal", "non-ascii", "all-special"]);

function errorMessage(error: unknown) {
  if (!(error instanceof TextCodecError))
    return m["tools.htmlEntityEncoderDecoder.invalidOptionError"]();
  if (error.code === "too_large")
    return m["tools.htmlEntityEncoderDecoder.tooLargeError"]();
  if (error.code === "invalid_unicode")
    return m["tools.htmlEntityEncoderDecoder.invalidUnicodeError"]();
  return m["tools.htmlEntityEncoderDecoder.invalidOptionError"]();
}

function inlineCode(text: string) {
  return text
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") ? (
        <code key={part}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

function HtmlEntityEncoderDecoderContent() {
  const formatId = useId();
  const rangeId = useId();
  const [format, setFormat] = useState<HtmlFormat>(DEFAULT_FORMAT);
  const [range, setRange] = useState<HtmlRange>(DEFAULT_RANGE);
  const [source, setSource] = useState<Source>({
    side: "plain",
    value: DEFAULT_TEXT,
  });
  const deferredValue = useDeferredValue(source.value);
  const deferredFormat = useDeferredValue(format);
  const deferredRange = useDeferredValue(range);

  useEffect(() => {
    try {
      const storedText = localStorage.getItem(STORAGE_KEYS.plainText);
      const storedFormat = localStorage.getItem(STORAGE_KEYS.format);
      const storedRange = localStorage.getItem(STORAGE_KEYS.range);
      const nextFormat = FORMATS.has(storedFormat as HtmlFormat)
        ? (storedFormat as HtmlFormat)
        : DEFAULT_FORMAT;
      const nextRange = RANGES.has(storedRange as HtmlRange)
        ? (storedRange as HtmlRange)
        : DEFAULT_RANGE;
      setFormat(nextFormat);
      setRange(nextRange);
      setSource({ side: "plain", value: storedText ?? DEFAULT_TEXT });
    } catch {
      // Storage is optional; the converter remains fully functional without it.
    }
  }, []);

  let output = "";
  let error = "";
  try {
    output =
      source.side === "plain"
        ? encodeHtmlText(deferredValue, deferredFormat, deferredRange)
        : decodeHtmlText(deferredValue);
  } catch (cause) {
    error = errorMessage(cause);
  }
  const plainText = source.side === "plain" ? source.value : output;
  const encodedText = source.side === "encoded" ? source.value : output;

  useEffect(() => {
    if (error) return;
    try {
      localStorage.setItem(STORAGE_KEYS.plainText, plainText);
      localStorage.setItem(STORAGE_KEYS.format, format);
      localStorage.setItem(STORAGE_KEYS.range, range);
    } catch {
      // Storage is optional; no user-facing failure is needed.
    }
  }, [error, format, plainText, range]);

  function reset() {
    setFormat(DEFAULT_FORMAT);
    setRange(DEFAULT_RANGE);
    setSource({ side: "plain", value: DEFAULT_TEXT });
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-6">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.htmlEntityEncoderDecoder.optionsLabel"]()}
            </Card.Title>
          </Card.Header>
          <ToolPanelCardContent className="grid gap-4 py-4 sm:grid-cols-2">
            <Select
              variant="secondary"
              selectedKey={format}
              onSelectionChange={(key) => {
                const next = String(key) as HtmlFormat;
                if (!FORMATS.has(next)) return;
                setSource({ side: "plain", value: plainText });
                setFormat(next);
              }}
            >
              <Label>{m["common.archiveformat"]()}</Label>
              <Select.Trigger id={formatId} className="w-full">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item
                    id="named"
                    textValue={m[
                      "tools.htmlEntityEncoderDecoder.formatNamedLabel"
                    ]()}
                  >
                    {m["tools.htmlEntityEncoderDecoder.formatNamedLabel"]()}
                  </ListBox.Item>
                  <ListBox.Item
                    id="decimal"
                    textValue={m[
                      "tools.htmlEntityEncoderDecoder.formatDecimalLabel"
                    ]()}
                  >
                    {m["tools.htmlEntityEncoderDecoder.formatDecimalLabel"]()}
                  </ListBox.Item>
                  <ListBox.Item
                    id="hex"
                    textValue={m[
                      "tools.htmlEntityEncoderDecoder.formatHexLabel"
                    ]()}
                  >
                    {m["tools.htmlEntityEncoderDecoder.formatHexLabel"]()}
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>

            <Select
              variant="secondary"
              selectedKey={range}
              onSelectionChange={(key) => {
                const next = String(key) as HtmlRange;
                if (!RANGES.has(next)) return;
                setSource({ side: "plain", value: plainText });
                setRange(next);
              }}
            >
              <Label>{m["shared.cronTools.range"]()}</Label>
              <Select.Trigger id={rangeId} className="w-full">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item
                    id="minimal"
                    textValue={m[
                      "tools.htmlEntityEncoderDecoder.rangeMinimalLabel"
                    ]()}
                  >
                    {m["tools.htmlEntityEncoderDecoder.rangeMinimalLabel"]()}
                  </ListBox.Item>
                  <ListBox.Item
                    id="non-ascii"
                    textValue={m[
                      "tools.htmlEntityEncoderDecoder.rangeNonAsciiLabel"
                    ]()}
                  >
                    {m["tools.htmlEntityEncoderDecoder.rangeNonAsciiLabel"]()}
                  </ListBox.Item>
                  <ListBox.Item
                    id="all-special"
                    textValue={m[
                      "tools.htmlEntityEncoderDecoder.rangeAllSpecialLabel"
                    ]()}
                  >
                    {m["tools.htmlEntityEncoderDecoder.rangeAllSpecialLabel"]()}
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <ToolPanelCard>
            <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <Card.Title>
                {m["tools.htmlEntityEncoderDecoder.plainTextLabel"]()}
              </Card.Title>
              <div className="flex flex-wrap justify-end gap-2">
                <ToolCopyButton
                  value={plainText}
                  copyLabel={m["shared.base64.copyPlainTextLabel"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  variant="ghost"
                />
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={m[
                    "tools.htmlEntityEncoderDecoder.clearPlainTextLabel"
                  ]()}
                  isDisabled={!plainText}
                  onPress={() => setSource({ side: "plain", value: "" })}
                >
                  <X aria-hidden className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onPress={reset}>
                  <RefreshCcw aria-hidden className="size-4" />
                  {m["common.textcodecSample"]()}
                </Button>
              </div>
            </Card.Header>
            <ToolPanelCardContent className="py-4">
              <TextArea
                aria-label={m[
                  "tools.htmlEntityEncoderDecoder.plainTextLabel"
                ]()}
                aria-invalid={source.side === "plain" && Boolean(error)}
                autoComplete="off"
                dir="ltr"
                name="plain-text"
                rows={10}
                value={plainText}
                placeholder={m["shared.baseEncoding.base16InputPlaceholder"]()}
                className="min-h-64 resize-y font-mono text-sm"
                onChange={(event) =>
                  setSource({ side: "plain", value: event.currentTarget.value })
                }
              />
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <Card.Title>
                {m["tools.htmlEntityEncoderDecoder.encodedTextLabel"]()}
              </Card.Title>
              <div className="flex flex-wrap justify-end gap-2">
                <ToolCopyButton
                  value={encodedText}
                  copyLabel={m["common.urlCopyEncoded"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  variant="ghost"
                />
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={m[
                    "tools.htmlEntityEncoderDecoder.clearEncodedTextLabel"
                  ]()}
                  isDisabled={!encodedText}
                  onPress={() => setSource({ side: "encoded", value: "" })}
                >
                  <X aria-hidden className="size-4" />
                </Button>
              </div>
            </Card.Header>
            <ToolPanelCardContent className="py-4">
              <TextArea
                aria-label={m[
                  "tools.htmlEntityEncoderDecoder.encodedTextLabel"
                ]()}
                aria-invalid={source.side === "encoded" && Boolean(error)}
                autoComplete="off"
                dir="ltr"
                name="encoded-text"
                rows={10}
                value={encodedText}
                placeholder={m[
                  "tools.htmlEntityEncoderDecoder.encodedTextPlaceholder"
                ]()}
                spellCheck={false}
                className="min-h-64 resize-y font-mono text-sm"
                onChange={(event) =>
                  setSource({
                    side: "encoded",
                    value: event.currentTarget.value,
                  })
                }
              />
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>

        {error ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {m["tools.htmlEntityEncoderDecoder.errorTitle"]()}
              </Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
      </div>

      <ToolArticle>
        <h2>{m["shared.barcodeTools.generatorArticleWhatTitle"]()}</h2>
        <ul>
          {[
            m["tools.htmlEntityEncoderDecoder.article.what0"](),
            m["tools.htmlEntityEncoderDecoder.article.what1"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.htmlEntityEncoderDecoder.article.whenTitle"]()}</h2>
        <ul>
          {[
            m["tools.htmlEntityEncoderDecoder.article.when0"](),
            m["tools.htmlEntityEncoderDecoder.article.when1"](),
            m["tools.htmlEntityEncoderDecoder.article.when2"](),
          ].map((item) => (
            <li key={item}>{inlineCode(item)}</li>
          ))}
        </ul>
        <h2>{m["tools.htmlEntityEncoderDecoder.article.notesTitle"]()}</h2>
        <ul>
          {[
            m["tools.htmlEntityEncoderDecoder.article.notes0"](),
            m["tools.htmlEntityEncoderDecoder.article.notes1"](),
            m["tools.htmlEntityEncoderDecoder.article.notes2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function HtmlEntityEncoderDecoder() {
  return (
    <ToolPage instructions={m["tools.htmlEntityEncoderDecoder.usage"]()}>
      <HtmlEntityEncoderDecoderContent />
    </ToolPage>
  );
}
