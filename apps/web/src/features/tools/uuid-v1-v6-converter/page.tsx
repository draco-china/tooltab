import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Input } from "@heroui/react";
import { ArrowLeftRight, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  convertUuid,
  type UuidConversionResult,
  type UuidParseError,
} from "@workspace/tools/uuid/convert";

type SourceVersion = "v1" | "v6";
const DEFAULT_V1 = "c1ed67f0-34bd-11f0-b3fe-02d71e841f4f";
const STORAGE_KEYS = {
  source: "tools:uuid-v1-v6-converter:source",
  value: "tools:uuid-v1-v6-converter:value",
} as const;

function errorText(
  source: SourceVersion,
  error: Exclude<UuidParseError, "empty">,
) {
  return source === "v1"
    ? {
        format: m["tools.uuidV1V6Converter.invalidV1Format"](),
        variant: m["tools.uuidV1V6Converter.invalidV1Variant"](),
        version: m["tools.uuidV1V6Converter.invalidV1Version"](),
      }[error]
    : {
        format: m["tools.uuidV1V6Converter.invalidV6Format"](),
        variant: m["tools.uuidV1V6Converter.invalidV1Variant"](),
        version: m["tools.uuidV1V6Converter.invalidV6Version"](),
      }[error];
}

function fieldValues(
  source: SourceVersion,
  sourceValue: string,
  result: UuidConversionResult,
) {
  const empty = {
    v1Copy: "",
    v1: source === "v1" ? sourceValue : "",
    v6Copy: "",
    v6: source === "v6" ? sourceValue : "",
  };
  if (result.kind !== "valid") return empty;
  return source === "v1"
    ? {
        v1Copy: result.input,
        v1: sourceValue,
        v6Copy: result.output,
        v6: result.output,
      }
    : {
        v1Copy: result.output,
        v1: result.output,
        v6Copy: result.input,
        v6: sourceValue,
      };
}

function UuidTimeConverterContent() {
  const [source, setSource] = useState<SourceVersion>("v1");
  const [sourceValue, setSourceValue] = useState(DEFAULT_V1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedSource = safeLocalStorage.getItem(STORAGE_KEYS.source);
    const storedValue = safeLocalStorage.getItem(STORAGE_KEYS.value);
    if (storedSource === "v1" || storedSource === "v6") setSource(storedSource);
    if (storedValue !== null) setSourceValue(storedValue);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    safeLocalStorage.setItem(STORAGE_KEYS.source, source);
    safeLocalStorage.setItem(STORAGE_KEYS.value, sourceValue);
  }, [ready, source, sourceValue]);

  const result = convertUuid(
    source === "v1" ? "v1-to-v6" : "v6-to-v1",
    sourceValue,
  );
  const values = fieldValues(source, sourceValue, result);
  const error =
    result.kind === "invalid" ? errorText(source, result.error) : null;
  const change = (nextSource: SourceVersion, value: string) => {
    setSource(nextSource);
    setSourceValue(value);
  };

  return (
    <div className="grid gap-10">
      <div className="flex flex-col gap-4" data-tool-panels>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start">
          <UuidFieldCard
            version="v1"
            value={values.v1}
            copyValue={values.v1Copy}
            error={source === "v1" ? error : null}
            onChange={(value) => change("v1", value)}
          />
          <div
            className="hidden size-12 items-center justify-center rounded-lg border border-border bg-default text-muted lg:flex"
            aria-hidden
          >
            <ArrowLeftRight className="size-5" />
          </div>
          <UuidFieldCard
            version="v6"
            value={values.v6}
            copyValue={values.v6Copy}
            error={source === "v6" ? error : null}
            onChange={(value) => change("v6", value)}
          />
        </div>
        <div>
          <p className="text-sm text-muted">
            {m["tools.uuidV1V6Converter.emptyHint"]()}
          </p>
        </div>
      </div>
      <ConverterArticle />
    </div>
  );
}

function UuidFieldCard({
  version,
  value,
  copyValue,
  error,
  onChange,
}: {
  version: SourceVersion;
  value: string;
  copyValue: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const isV1 = version === "v1";
  const title = isV1
    ? m["tools.uuidV1V6Converter.v1Title"]()
    : m["tools.uuidV1V6Converter.v6Title"]();
  const label = isV1 ? m["common.uuidtV1Input"]() : m["common.uuidtV6Input"]();
  return (
    <ToolPanelCard>
      <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <Card.Title>{title}</Card.Title>
          <Card.Description>
            {isV1
              ? m["tools.uuidV1V6Converter.v1Description"]()
              : m["tools.uuidV1V6Converter.v6Description"]()}
          </Card.Description>
        </div>
        {isV1 ? (
          <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
            <Button size="sm" variant="outline" onPress={() => onChange("")}>
              <Trash2 aria-hidden className="size-4" />
              {m["common.uuidiClear"]()}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onPress={() => onChange(DEFAULT_V1)}
            >
              <RefreshCw aria-hidden className="size-4" />
              {m["common.uuidiSample"]()}
            </Button>
          </div>
        ) : null}
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        <div className="grid gap-2">
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
          <Input
            id={id}
            name={`uuid-${version}`}
            aria-label={label}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-12 font-mono text-sm md:text-base"
            value={value}
            placeholder={
              isV1
                ? m["tools.uuidV1V6Converter.v1Placeholder"]()
                : m["tools.uuidV1V6Converter.v6Placeholder"]()
            }
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </div>
        {error ? (
          <Alert id={`${id}-error`} status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="justify-end">
        <ToolCopyButton
          value={copyValue}
          copyLabel={
            isV1 ? m["common.uuidtCopyV1"]() : m["common.uuidtCopyV6"]()
          }
          copiedLabel={m["common.actions.copied"]()}
          disabled={!copyValue}
          variant="ghost"
        />
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function ConverterArticle() {
  return (
    <ToolArticle>
      <p>{m["tools.uuidV1V6Converter.articleSummary"]()}</p>
      <p>{m["tools.uuidV1V6Converter.articlePurpose"]()}</p>
      <h2>{m["tools.archiveViewer.article.whenTitle"]()}</h2>
      <ul>
        <li>{m["tools.uuidV1V6Converter.articleWhenOne"]()}</li>
        <li>{m["tools.uuidV1V6Converter.articleWhenTwo"]()}</li>
        <li>{m["tools.uuidV1V6Converter.articleWhenThree"]()}</li>
      </ul>
      <h2>{m["tools.uuidV1V6Converter.articleFormatTitle"]()}</h2>
      <p>{m["tools.uuidV1V6Converter.articleFormatBody"]()}</p>
      <h2>{m["tools.uuidV1V6Converter.articlePrivacyTitle"]()}</h2>
      <p>{m["tools.uuidV1V6Converter.articlePrivacyBody"]()}</p>
    </ToolArticle>
  );
}

export function UuidTimeConverter() {
  return (
    <ToolPage instructions={m["tools.uuidV1V6Converter.usage"]()}>
      <UuidTimeConverterContent />
    </ToolPage>
  );
}

export default UuidTimeConverter;
