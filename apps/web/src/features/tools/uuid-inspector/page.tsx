import { generateUuidV4 } from "@workspace/tools/uuid/generate";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, InputGroup, Label } from "@heroui/react";
import { Eraser, FlaskConical, RefreshCcw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import {
  convertUuid,
  inspectUuid,
  UUID_FORMATS,
  UUID_SAMPLE,
  type UuidFormat,
  UuidInspectionError,
} from "@workspace/tools/uuid/inspect";

const versionMessages = {
  1: m["shared.uuidInspector.uuidiVersion1"],
  2: m["shared.uuidInspector.uuidiVersion2"],
  3: m["shared.uuidInspector.uuidiVersion3"],
  4: m["shared.uuidInspector.uuidiVersion4"],
  5: m["shared.uuidInspector.uuidiVersion5"],
  6: m["shared.uuidInspector.uuidiVersion6"],
  7: m["shared.uuidInspector.uuidiVersion7"],
  8: m["shared.uuidInspector.uuidiVersion8"],
} as const;

const variantMessages = {
  ncs: m["shared.uuidInspector.uuidiNcs"],
  rfc: m["shared.uuidInspector.uuidiRfc"],
  microsoft: m["shared.uuidInspector.uuidiMicrosoft"],
  future: m["shared.uuidInspector.uuidiFuture"],
} as const;

const specialMessages = {
  nil: m["shared.uuidInspector.uuidiNil"],
  max: m["shared.uuidInspector.uuidiMax"],
} as const;

const formatDescriptions = {
  uuid_description: m["shared.uuidInspector.uuidiUuidDescription"],
  base64_description: m["shared.uuidInspector.uuidiBase64Description"],
  hex_description: m["shared.uuidInspector.uuidiHexDescription"],
  decimal_description: m["shared.uuidInspector.uuidiDecimalDescription"],
  octal_description: m["shared.uuidInspector.uuidiOctalDescription"],
  binary_description: m["shared.uuidInspector.uuidiBinaryDescription"],
} as const;

const formatMessages = {
  uuid: m["shared.uuidInspector.uuidiUuid"],
  base64: m["common.uuidiBase64"],
  hex: m["shared.uuidInspector.uuidiHex"],
  decimal: m["shared.uuidInspector.uuidiDecimal"],
  octal: m["shared.uuidInspector.uuidiOctal"],
  binary: m["shared.uuidInspector.uuidiBinary"],
} as const;

const rowMessages = {
  version: m["shared.uuidInspector.uuidiVersion"],
  variant: m["common.uuidiVariant"],
  bytes: m["shared.uuidInspector.uuidiBytes"],
  format_check: m["shared.uuidInspector.uuidiFormatCheck"],
  version_check: m["shared.uuidInspector.uuidiVersionCheck"],
  variant_check: m["shared.uuidInspector.uuidiVariantCheck"],
  segments: m["shared.uuidInspector.uuidiSegments"],
  unix: m["shared.uuidInspector.uuidiUnix"],
  utc: m["shared.uuidInspector.uuidiUtc"],
  ticks: m["shared.uuidInspector.uuidiTicks"],
  node: m["shared.uuidInspector.uuidiNode"],
  sequence: m["shared.uuidInspector.uuidiSequence"],
  algorithm: m["shared.uuidInspector.uuidiAlgorithm"],
} as const;

const errorMessages = {
  uuidi_invalid_uuid: m["shared.uuidInspector.uuidiInvalidUuid"],
  uuidi_invalid_base64: m["shared.uuidInspector.uuidiInvalidBase64"],
  uuidi_invalid_hex: m["shared.uuidInspector.uuidiInvalidHex"],
  uuidi_invalid_decimal: m["shared.uuidInspector.uuidiInvalidDecimal"],
  uuidi_invalid_octal: m["shared.uuidInspector.uuidiInvalidOctal"],
  uuidi_invalid_binary: m["shared.uuidInspector.uuidiInvalidBinary"],
  uuidi_crypto_error: m["shared.uuidInspector.uuidiCryptoError"],
} as const;

function Inspector({ mode }: { mode: "validator" | "decoder" | "converter" }) {
  const id = useId();
  const [source, setSource] = useState({
    text: mode === "validator" ? "" : UUID_SAMPLE,
    format: "uuid" as UuidFormat,
  });
  const [notice, setNotice] = useState<keyof typeof errorMessages | null>(null);
  useEffect(() => {
    if (mode === "validator") return;
    const stored = safeLocalStorage.getItem(
      `tools:${mode === "decoder" ? "uuid-decoder" : "uuid-base64-hex-decimal-octal-binary-converter"}:uuid`,
    );
    if (stored) setSource({ text: stored, format: "uuid" });
  }, [mode]);
  useEffect(() => {
    if (mode !== "validator" && source.format === "uuid" && source.text)
      safeLocalStorage.setItem(
        `tools:${mode === "decoder" ? "uuid-decoder" : "uuid-base64-hex-decimal-octal-binary-converter"}:uuid`,
        source.text,
      );
  }, [mode, source]);
  function change(text: string, format: UuidFormat = "uuid") {
    setSource({ text, format });
    setNotice(null);
  }
  let result: ReturnType<typeof inspectUuid> | null = null;
  let error: keyof typeof errorMessages | null = null;
  if (source.text) {
    try {
      result =
        mode === "converter"
          ? inspectUuid(convertUuid(source.text, source.format).uuid)
          : inspectUuid(source.text, mode === "validator");
    } catch (e) {
      error =
        `uuidi_${e instanceof UuidInspectionError ? e.code : "invalid_uuid"}` as keyof typeof errorMessages;
    }
  }
  const valid = Boolean(result && (mode !== "validator" || result.valid));
  const row = (key: keyof typeof rowMessages, value: string) => (
    <div className="space-y-1" key={key}>
      <dt className="text-sm text-muted-foreground">{rowMessages[key]({})}</dt>
      <dd dir="ltr" className="font-mono text-sm break-all">
        {value}
      </dd>
    </div>
  );
  const formats =
    mode === "validator" ? (["uuid", "hex"] as const) : UUID_FORMATS;
  const status = notice
    ? errorMessages[notice]({})
    : !source.text
      ? m["common.uuidiEmpty"]()
      : mode === "validator" && result
        ? (result.valid
            ? m["shared.uuidInspector.uuidiValid"]
            : m["shared.uuidInspector.uuidiInvalid"])({})
        : "";
  if (mode === "converter") {
    return (
      <div className="grid gap-8">
        <ToolPanelActionGroup
          className="justify-start sm:justify-end"
          role="toolbar"
          aria-label={m["shared.uuidInspector.uuidiConverterName"]()}
        >
          <Button
            type="button"
            size="sm"
            variant="primary"
            onPress={() => {
              try {
                change(generateUuidV4()[0] ?? "");
              } catch {
                change("");
                setNotice("uuidi_crypto_error");
              }
            }}
          >
            <RefreshCcw aria-hidden className="size-4" />
            {m["common.uuidiGenerate"]()}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onPress={() => change(UUID_SAMPLE)}
          >
            <FlaskConical aria-hidden className="size-4" />
            {m["common.uuidiSample"]()}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onPress={() => change("")}
          >
            <Eraser aria-hidden className="size-4" />
            {m["common.uuidiClear"]()}
          </Button>
        </ToolPanelActionGroup>

        {error || notice ? (
          <Alert id={`${id}-error`} role="alert" status="danger">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>
                {errorMessages[(error ?? notice) as keyof typeof errorMessages](
                  {},
                )}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        <div
          className="grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3"
          data-tool-panels
        >
          {UUID_FORMATS.map((format) => {
            const label = formatMessages[format]({});
            const value =
              source.format === format
                ? source.text
                : (result?.representations[format] ?? "");
            return (
              <ToolPanelCard key={format}>
                <Card.Header className="border-b border-separator">
                  <Card.Title>{label}</Card.Title>
                  <Card.Description>
                    {formatDescriptions[`${format}_description`]({})}
                  </Card.Description>
                </Card.Header>
                <ToolPanelCardContent className="justify-center py-4">
                  <InputGroup variant="secondary" fullWidth>
                    <InputGroup.Input
                      aria-label={label}
                      dir="ltr"
                      className="font-mono"
                      value={value}
                      aria-invalid={source.format === format && Boolean(error)}
                      aria-describedby={
                        source.format === format && error
                          ? `${id}-error`
                          : undefined
                      }
                      onChange={(event) => change(event.target.value, format)}
                    />
                    <InputGroup.Suffix>
                      <ToolCopyButton
                        value={result?.representations[format] ?? ""}
                        copyLabel={m["common.uuidiCopy"]({ format: label })}
                        copiedLabel={m["common.actions.copied"]()}
                        errorLabel={m["shared.uuidInspector.uuidiCopyError"]()}
                        ariaLabel={m["common.uuidiCopy"]({ format: label })}
                        size="icon-sm"
                        variant="ghost"
                        disabled={!valid}
                      />
                    </InputGroup.Suffix>
                  </InputGroup>
                </ToolPanelCardContent>
              </ToolPanelCard>
            );
          })}
        </div>

        <ToolArticle>
          <p>{m["shared.uuidInspector.uuidiFormatsNote"]()}</p>
        </ToolArticle>
      </div>
    );
  }
  return (
    <div className="grid gap-8">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <Card.Title>
                {m["shared.uuidInspector.uuidiSourceTitle"]()}
              </Card.Title>
              <Card.Description>
                {(mode === "decoder"
                  ? m["shared.uuidInspector.uuidiDecoderInstructions"]
                  : m["shared.uuidInspector.uuidiValidatorInstructions"])({})}
              </Card.Description>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onPress={() => change(UUID_SAMPLE)}
            >
              <FlaskConical aria-hidden className="size-4" />
              {m["common.uuidiSample"]()}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-input`}>{m["common.uuidiInput"]()}</Label>
              <InputGroup variant="secondary" fullWidth>
                <InputGroup.Input
                  id={`${id}-input`}
                  aria-label={m["common.uuidiInput"]()}
                  dir="ltr"
                  value={source.text}
                  aria-invalid={
                    Boolean(error) ||
                    Boolean(result && !result.valid && mode === "validator")
                  }
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(event) => change(event.target.value)}
                />
                {source.text ? (
                  <InputGroup.Suffix>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      aria-label={m["common.uuidiClear"]()}
                      onPress={() => change("")}
                    >
                      <Eraser aria-hidden className="size-4" />
                    </Button>
                  </InputGroup.Suffix>
                ) : null}
              </InputGroup>
            </div>
            {error || notice ? (
              <Alert id={`${id}-error`} role="alert" status="danger">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>
                    {errorMessages[
                      (error ?? notice) as keyof typeof errorMessages
                    ]({})}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.uuidInspector.uuidiResultsTitle"]()}
            </Card.Title>
            <Card.Description>{status}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-6 py-4">
            {result ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {formats.map((format) => {
                  const label = formatMessages[format]({});
                  const value = result.representations[format];
                  return (
                    <div className="grid min-w-0 gap-2" key={format}>
                      <Label htmlFor={`${id}-${format}`}>{label}</Label>
                      <InputGroup variant="secondary" fullWidth>
                        <InputGroup.Input
                          id={`${id}-${format}`}
                          aria-label={label}
                          dir="ltr"
                          className="font-mono"
                          readOnly
                          value={value}
                        />
                        <InputGroup.Suffix>
                          <ToolCopyButton
                            value={result?.representations[format] ?? ""}
                            copyLabel={m["common.uuidiCopy"]({ format: label })}
                            copiedLabel={m["common.actions.copied"]()}
                            errorLabel={m[
                              "shared.uuidInspector.uuidiCopyError"
                            ]()}
                            ariaLabel={m["common.uuidiCopy"]({ format: label })}
                            size="icon-sm"
                            variant="ghost"
                            disabled={!valid}
                          />
                        </InputGroup.Suffix>
                      </InputGroup>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-40 place-items-center text-center text-sm text-muted">
                {m["common.uuidiEmpty"]()}
              </div>
            )}
            {result ? (
              <dl className="grid gap-x-6 sm:grid-cols-2">
                {row(
                  "version",
                  result.special
                    ? specialMessages[
                        result.special as keyof typeof specialMessages
                      ]({})
                    : result.version >= 1 && result.version <= 8
                      ? versionMessages[
                          result.version as keyof typeof versionMessages
                        ]({})
                      : String(result.version),
                )}
                {row(
                  "variant",
                  variantMessages[
                    result.variant as keyof typeof variantMessages
                  ]({}),
                )}
                {row("bytes", "16")}
                {row("format_check", m["common.uuidiPass"]())}
                {row(
                  "version_check",
                  (result.supportedVersion
                    ? m["common.uuidiPass"]
                    : m["shared.uuidInspector.uuidiFail"])({}),
                )}
                {row(
                  "variant_check",
                  (result.supportedVariant
                    ? m["common.uuidiPass"]
                    : m["shared.uuidInspector.uuidiFail"])({}),
                )}
                {row("segments", result.segments.join(" / "))}
              </dl>
            ) : null}
            {result && mode === "decoder" ? (
              <div className="grid gap-4">
                {result.time ? (
                  <dl className="grid gap-x-6 sm:grid-cols-2">
                    {row("unix", result.time.unixMilliseconds)}
                    {row("utc", result.time.utc)}
                    {result.time.subMillisecondTicks !== undefined &&
                      row("ticks", String(result.time.subMillisecondTicks))}
                  </dl>
                ) : null}
                {result.node ? (
                  <>
                    <dl className="grid gap-x-6 sm:grid-cols-2">
                      {row("node", result.node.identifier)}
                      {row("sequence", String(result.node.clockSequence))}
                    </dl>
                    <p className="text-sm text-muted">
                      {(result.node.multicast
                        ? m["shared.uuidInspector.uuidiMulticast"]
                        : m["shared.uuidInspector.uuidiMac"])({})}
                    </p>
                  </>
                ) : null}
                {result.algorithm ? (
                  <dl>{row("algorithm", result.algorithm)}</dl>
                ) : null}
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <ToolArticle>
        <p>{m["shared.uuidInspector.uuidiPrivacy"]()}</p>
      </ToolArticle>
    </div>
  );
}
function UuidValidatorContent() {
  return <Inspector mode="validator" />;
}
function UuidDecoderContent() {
  return <Inspector mode="decoder" />;
}
function UuidConverterContent() {
  return <Inspector mode="converter" />;
}

export function UuidConverter() {
  return (
    <ToolPage>
      <UuidConverterContent />
    </ToolPage>
  );
}

export function UuidDecoder() {
  return (
    <ToolPage>
      <UuidDecoderContent />
    </ToolPage>
  );
}

export default function UuidValidator() {
  return (
    <ToolPage>
      <UuidValidatorContent />
    </ToolPage>
  );
}
