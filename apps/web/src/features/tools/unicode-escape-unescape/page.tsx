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
import { RefreshCcw, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  escapeUnicode,
  TextCodecError,
  UNICODE_FORMATS,
  type UnicodeFormat,
  unescapeUnicode,
} from "@workspace/tools/encoding/unicode";

const DEFAULT_TEXT = "Hello 你好 🎉";
const DEFAULT_FORMAT: UnicodeFormat = "utf16";
const STORAGE_PREFIX = "tools:unicode-escape-unescape";
type Source = { side: "plain" | "encoded"; value: string };

function formatLabel(option: UnicodeFormat) {
  switch (option) {
    case "utf16":
      return m["common.textcodecUtf16"]();
    case "braced":
      return m["tools.unicodeEscapeUnescape.formatsBraced"]({
        XXXXX: "{XXXXX}",
      });
    case "html-hex":
      return m["common.textcodecHtmlHex"]();
    case "html-decimal":
      return m["common.textcodecHtmlDecimal"]();
    case "uplus":
      return m["tools.unicodeEscapeUnescape.formatsUplus"]();
    case "bytes":
      return m["common.textcodecBytes"]();
    case "percent":
      return m["common.textcodecPercent"]();
    case "python":
      return m["common.textcodecPython"]();
    case "hex":
      return m["tools.unicodeEscapeUnescape.formatsHex"]();
  }
}

function UnicodeEscapeUnescapeContent() {
  const plainId = useId();
  const encodedId = useId();
  const [source, setSource] = useState<Source>({
    side: "plain",
    value: DEFAULT_TEXT,
  });
  const [format, setFormat] = useState<UnicodeFormat>(DEFAULT_FORMAT);
  const [hydrated, setHydrated] = useState(false);

  let output = "";
  let error = "";
  try {
    output =
      source.side === "plain"
        ? escapeUnicode(source.value, format)
        : unescapeUnicode(source.value);
  } catch (cause) {
    const code =
      cause instanceof TextCodecError ? cause.code : "invalid_escape";
    error = {
      invalid_escape: m["tools.unicodeEscapeUnescape.invalidEscape"](),
      too_large: m["tools.unicodeEscapeUnescape.inputTooLarge"](),
      invalid_unicode: m["tools.unicodeEscapeUnescape.invalidUnicode"](),
      invalid_option: m["tools.unicodeEscapeUnescape.invalidOption"](),
    }[code];
  }

  const plainText = source.side === "plain" ? source.value : output;
  const escapedText = source.side === "encoded" ? source.value : output;

  useEffect(() => {
    try {
      const storedPlain = localStorage.getItem(`${STORAGE_PREFIX}:plain-text`);
      const storedFormat = localStorage.getItem(`${STORAGE_PREFIX}:format`);
      const nextFormat = UNICODE_FORMATS.includes(storedFormat as UnicodeFormat)
        ? (storedFormat as UnicodeFormat)
        : DEFAULT_FORMAT;
      setFormat(nextFormat);
      setSource({ side: "plain", value: storedPlain ?? DEFAULT_TEXT });
    } catch {
      setFormat(DEFAULT_FORMAT);
      setSource({ side: "plain", value: DEFAULT_TEXT });
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || error) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}:plain-text`, plainText);
      localStorage.setItem(`${STORAGE_PREFIX}:format`, format);
    } catch {
      // Storage availability does not affect conversion.
    }
  }, [error, format, hydrated, plainText]);

  function reset() {
    setFormat(DEFAULT_FORMAT);
    setSource({ side: "plain", value: DEFAULT_TEXT });
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          variant="secondary"
          selectedKey={format}
          onSelectionChange={(key) => {
            if (key != null) setFormat(String(key) as UnicodeFormat);
          }}
          className="w-full sm:max-w-sm"
        >
          <Label>{m["tools.unicodeEscapeUnescape.escapeFormatLabel"]()}</Label>
          <Select.Trigger className="min-h-11 w-full">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {UNICODE_FORMATS.map((option) => (
                <ListBox.Item
                  key={option}
                  id={option}
                  textValue={formatLabel(option)}
                >
                  {formatLabel(option)}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <div className="grid items-stretch gap-6 lg:grid-cols-2" data-tool-panels>
        <CodecPanel
          id={plainId}
          label={m["tools.htmlEntityEncoderDecoder.plainTextLabel"]()}
          description={m["tools.unicodeEscapeUnescape.plainTextDescription"]()}
          placeholder={m["tools.unicodeEscapeUnescape.plainTextPlaceholder"]()}
          value={plainText}
          invalid={source.side === "plain" && Boolean(error)}
          copyLabel={m["shared.base64.copyPlainTextLabel"]()}
          copiedLabel={m["common.actions.copied"]()}
          onChange={(value) => setSource({ side: "plain", value })}
          footerAction={
            <Button type="button" variant="ghost" size="sm" onPress={reset}>
              <RefreshCcw aria-hidden className="size-4" />
              {m["common.textcodecSample"]()}
            </Button>
          }
        />
        <CodecPanel
          id={encodedId}
          label={m["tools.unicodeEscapeUnescape.escapedTextLabel"]()}
          description={m[
            "tools.unicodeEscapeUnescape.escapedTextDescription"
          ]()}
          placeholder={m[
            "tools.unicodeEscapeUnescape.escapedTextPlaceholder"
          ]()}
          value={escapedText}
          invalid={source.side === "encoded" && Boolean(error)}
          copyLabel={m["tools.unicodeEscapeUnescape.copyEscapedTextLabel"]()}
          copiedLabel={m["common.actions.copied"]()}
          onChange={(value) => setSource({ side: "encoded", value })}
        />
      </div>

      <ToolArticle>
        <h2>{m["tools.unicodeEscapeUnescape.articleWhatTitle"]()}</h2>
        <p>{m["tools.unicodeEscapeUnescape.articleWhatBody"]()}</p>
        <h2>{m["tools.unicodeEscapeUnescape.articleFormatsTitle"]()}</h2>
        <ul>
          {UNICODE_FORMATS.map((option) => (
            <li key={option}>
              <code>{formatLabel(option)}</code>
            </li>
          ))}
        </ul>
        <h2>{m["shared.argon2Tools.verifierArticleWhenTitle"]()}</h2>
        <ul>
          <li>{m["tools.unicodeEscapeUnescape.articleWhenItems0"]()}</li>
          <li>{m["tools.unicodeEscapeUnescape.articleWhenItems1"]()}</li>
          <li>{m["tools.unicodeEscapeUnescape.articleWhenItems2"]()}</li>
          <li>{m["tools.unicodeEscapeUnescape.articleWhenItems3"]()}</li>
        </ul>
        <h2>{m["shared.asciiArt.article.howTitle"]()}</h2>
        <p>{m["tools.unicodeEscapeUnescape.articleHowBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function CodecPanel({
  id,
  label,
  description,
  placeholder,
  value,
  invalid,
  copyLabel,
  copiedLabel,
  onChange,
  footerAction,
}: {
  id: string;
  label: string;
  description: string;
  placeholder: string;
  value: string;
  invalid: boolean;
  copyLabel: string;
  copiedLabel: string;
  onChange: (value: string) => void;
  footerAction?: ReactNode;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-1">
          <Card.Title>{label}</Card.Title>
          <Card.Description>{description}</Card.Description>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <ToolCopyButton
            value={value}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
            disabled={invalid || !value}
            variant="ghost"
          />
          {footerAction}
        </div>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <TextArea
          id={id}
          name={id}
          aria-label={label}
          aria-invalid={invalid || undefined}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="min-h-64 resize-y font-mono text-sm"
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

export default function UnicodeEscapeUnescape() {
  return (
    <ToolPage instructions={m["tools.unicodeEscapeUnescape.usage"]()}>
      <UnicodeEscapeUnescapeContent />
    </ToolPage>
  );
}
