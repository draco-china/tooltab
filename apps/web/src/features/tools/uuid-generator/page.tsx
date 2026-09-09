import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  InputGroup,
  Label,
  TextArea,
} from "@heroui/react";
import { Download, RefreshCcw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  generateUuidV4,
  UuidGenerationError,
  uuidSentinel,
} from "@workspace/tools/uuid/generate";

const formatMessages = {
  canonical: m["shared.uuidGenerator.canonical"],
  hex: m["shared.uuidGenerator.hex"],
  urn: m["shared.uuidGenerator.urn"],
} as const;

const errorMessages = {
  uuid_invalid_count: m["shared.uuidGenerator.invalidCount"],
  uuid_crypto_unavailable: m["shared.uuidGenerator.cryptoUnavailable"],
} as const;

function RandomUuid({ bulk = false }: { bulk?: boolean }) {
  const id = useId();
  const [count, setCount] = useState(bulk ? "10" : "1");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<keyof typeof errorMessages | null>(null);
  const download = useRef<string | null>(null);
  const release = useCallback(() => {
    if (download.current) URL.revokeObjectURL(download.current);
    download.current = null;
  }, []);
  const generate = useCallback(
    (amount: string) => {
      release();
      try {
        if (!/^\d+$/.test(amount))
          throw new UuidGenerationError("invalid_count");
        setOutput(generateUuidV4(Number(amount)).join("\n"));
        setError(null);
      } catch (failure) {
        setOutput("");
        setError(
          `uuid_${failure instanceof UuidGenerationError ? failure.code : "crypto_unavailable"}` as keyof typeof errorMessages,
        );
      }
    },
    [release],
  );
  useEffect(() => {
    generate(bulk ? "10" : "1");
    return release;
  }, [bulk, generate, release]);
  function save() {
    release();
    const url = URL.createObjectURL(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
    );
    download.current = url;
    const a = document.createElement("a");
    a.href = url;
    a.download = "uuid-v4.txt";
    a.click();
  }
  if (bulk) {
    return (
      <div className="grid gap-8">
        <div
          className="grid items-stretch gap-6 xl:grid-cols-2"
          data-tool-panels
        >
          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["shared.uuidGenerator.bulkOptionsTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["shared.uuidGenerator.bulkOptionsDescription"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor={`${id}-count`}>
                  {m["shared.uuidGenerator.count"]()}
                </Label>
                <Input
                  id={`${id}-count`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  step={1}
                  value={count}
                  aria-invalid={error === "uuid_invalid_count"}
                  aria-describedby={`${id}-count-hint${error ? ` ${id}-error` : ""}`}
                  onChange={(event) => {
                    setCount(event.target.value);
                    setOutput("");
                    setError(null);
                    release();
                  }}
                />
                <p id={`${id}-count-hint`} className="text-sm text-muted">
                  {m["shared.uuidGenerator.bulkCountHint"]()}
                </p>
              </div>
              {error ? (
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
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="flex-row items-start justify-between gap-4 border-b border-separator">
              <div className="grid min-w-0 gap-1">
                <Card.Title>
                  {m["shared.uuidGenerator.bulkResultsTitle"]()}
                </Card.Title>
                <Card.Description>
                  {m["shared.uuidGenerator.bulkResultsDescription"]()}
                </Card.Description>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                <ToolCopyButton
                  value={output}
                  copyLabel={m["shared.uuidGenerator.copy"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  errorLabel={m["shared.uuidGenerator.copyError"]()}
                  variant="ghost"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  isDisabled={!output}
                  onPress={save}
                >
                  <Download aria-hidden className="size-4" />
                  {m["shared.uuidGenerator.download"]()}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    generate(count);
                  }}
                >
                  <RefreshCcw aria-hidden className="size-4" />
                  {m["shared.uuidGenerator.generate"]()}
                </Button>
              </div>
            </Card.Header>
            <ToolPanelCardContent className="py-4">
              <TextArea
                id={`${id}-output`}
                aria-label={m["shared.uuidGenerator.output"]()}
                dir="ltr"
                readOnly
                rows={14}
                value={output}
                placeholder={m["shared.uuidGenerator.bulkResultsPlaceholder"]()}
                className="max-h-[min(32rem,60vh)] min-h-80 resize-y overflow-y-auto font-mono text-sm"
              />
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>

        <ToolArticle>
          <p>{m["shared.uuidGenerator.bulkArticleIntro"]()}</p>
          <h2>{m["shared.uuidGenerator.bulkArticleFormatTitle"]()}</h2>
          <p>{m["shared.uuidGenerator.bulkArticleFormatBody"]()}</p>
          <h2>{m["shared.uuidGenerator.bulkArticleSizeTitle"]()}</h2>
          <p>{m["shared.uuidGenerator.bulkArticleSizeBody"]()}</p>
          <h2>{m["shared.uuidGenerator.bulkArticleExportTitle"]()}</h2>
          <p>{m["shared.uuidGenerator.bulkArticleExportBody"]()}</p>
          <h2>{m["shared.uuidGenerator.bulkArticleCollisionTitle"]()}</h2>
          <p>{m["shared.uuidGenerator.bulkArticleCollisionBody"]()}</p>
        </ToolArticle>
      </div>
    );
  }
  return (
    <div className="grid gap-8">
      <ToolPanelCard>
        <Card.Header className="flex-row items-start justify-between gap-4 border-b border-separator">
          <div className="grid min-w-0 gap-1">
            <Card.Title>{m["shared.uuidGenerator.v4ResultTitle"]()}</Card.Title>
            <Card.Description>
              {m["shared.uuidGenerator.v4ResultDescription"]()}
            </Card.Description>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <ToolCopyButton
              value={output}
              copyLabel={m["shared.uuidGenerator.copy"]()}
              copiedLabel={m["common.actions.copied"]()}
              errorLabel={m["shared.uuidGenerator.copyError"]()}
              variant="ghost"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPress={() => generate(count)}
            >
              <RefreshCcw aria-hidden className="size-4" />
              {m["shared.uuidGenerator.generate"]()}
            </Button>
          </div>
        </Card.Header>
        <ToolPanelCardContent className="gap-5 py-4">
          {error ? (
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
          <div className="grid gap-2">
            <Label htmlFor={`${id}-output`}>UUID v4</Label>
            <TextArea
              id={`${id}-output`}
              aria-label={m["shared.uuidGenerator.output"]()}
              dir="ltr"
              readOnly
              rows={2}
              value={output}
              className="min-h-20 resize-none font-mono text-base font-semibold sm:text-lg"
            />
          </div>
          <section aria-labelledby={`${id}-details-title`}>
            <h3 id={`${id}-details-title`} className="text-sm font-semibold">
              {m["shared.uuidGenerator.v4FormatDetails"]()}
            </h3>
            <dl className="mt-3 divide-y divide-separator text-sm">
              <UuidDetail
                label={m["shared.uuidGenerator.v4VersionLabel"]()}
                value={m["shared.uuidGenerator.v4VersionValue"]()}
              />
              <UuidDetail
                label={m["shared.uuidGenerator.v4VariantLabel"]()}
                value={m["shared.uuidGenerator.v4VariantValue"]()}
              />
              <UuidDetail
                label={m["shared.uuidGenerator.v4RandomBitsLabel"]()}
                value={m["shared.uuidGenerator.v4RandomBitsValue"]()}
              />
            </dl>
          </section>
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <p>{m["shared.uuidGenerator.v4ArticleIntro"]()}</p>
        <h2>{m["shared.uuidGenerator.v4ArticleMeaningTitle"]()}</h2>
        <p>{m["shared.uuidGenerator.v4ArticleMeaningBody"]()}</p>
        <h2>{m["shared.uuidGenerator.v4ArticleUseTitle"]()}</h2>
        <p>{m["shared.uuidGenerator.v4ArticleUseBody"]()}</p>
        <h2>{m["shared.uuidGenerator.v4ArticlePrivacyTitle"]()}</h2>
        <p>{m["shared.uuidGenerator.v4ArticlePrivacyBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function UuidDetail({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}
function SentinelUuid({ kind }: { kind: "nil" | "max" }) {
  const id = useId();
  const values = uuidSentinel(kind);
  const isNil = kind === "nil";
  return (
    <div className="grid gap-8">
      <div
        className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,0.42fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {(isNil
                ? m["shared.uuidGenerator.nilPanelTitle"]
                : m["shared.uuidGenerator.maxPanelTitle"])({})}
            </Card.Title>
            <Card.Description>
              {m["shared.uuidGenerator.sentinelInstructions"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {(["canonical", "hex", "urn"] as const).map((form) => {
              const label = formatMessages[form]({});
              return (
                <div className="grid gap-2" key={form}>
                  <Label htmlFor={`${id}-${form}`}>{label}</Label>
                  <InputGroup variant="secondary" fullWidth>
                    <InputGroup.Input
                      id={`${id}-${form}`}
                      aria-label={label}
                      dir="ltr"
                      readOnly
                      className="font-mono"
                      value={values[form]}
                    />
                    <InputGroup.Suffix>
                      <ToolCopyButton
                        value={values[form]}
                        copyLabel={m["shared.uuidGenerator.copyForm"]({
                          form: label,
                        })}
                        copiedLabel={m["common.actions.copied"]()}
                        errorLabel={m["shared.uuidGenerator.copyError"]()}
                        ariaLabel={m["shared.uuidGenerator.copyForm"]({
                          form: label,
                        })}
                        size="icon-sm"
                        variant="ghost"
                      />
                    </InputGroup.Suffix>
                  </InputGroup>
                </div>
              );
            })}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.uuidGenerator.sentinelReferenceTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["shared.uuidGenerator.sentinelReferenceDescription"]({
                kind: isNil
                  ? m["shared.uuidGenerator.nilPanelTitle"]()
                  : m["shared.uuidGenerator.maxPanelTitle"](),
              })}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <dl className="divide-y divide-separator text-sm">
              <UuidDetail
                label={m["shared.uuidGenerator.sentinelBitsLabel"]()}
                value={
                  isNil
                    ? m["shared.uuidGenerator.nilBitsValue"]()
                    : m["shared.uuidGenerator.maxBitsValue"]()
                }
              />
              <UuidDetail
                label={m["shared.uuidGenerator.v4VersionLabel"]()}
                value={
                  isNil
                    ? m["shared.uuidGenerator.nilVersionValue"]()
                    : m["shared.uuidGenerator.maxVersionValue"]()
                }
              />
              <UuidDetail
                label={m["shared.uuidGenerator.v4VariantLabel"]()}
                value={
                  isNil
                    ? m["shared.uuidGenerator.nilVariantValue"]()
                    : m["shared.uuidGenerator.maxVariantValue"]()
                }
              />
              <UuidDetail
                label={m["shared.uuidGenerator.sentinelRegenerationLabel"]()}
                value={m["shared.uuidGenerator.sentinelRegenerationValue"]()}
              />
            </dl>
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>
          {(isNil
            ? m["shared.uuidGenerator.nilArticleTitle"]
            : m["shared.uuidGenerator.maxArticleTitle"])({})}
        </h2>
        <p>
          {(isNil
            ? m["shared.uuidGenerator.nilDetails"]
            : m["shared.uuidGenerator.maxDetails"])({})}
        </p>
      </ToolArticle>
    </div>
  );
}
function UuidV4GeneratorContent() {
  return <RandomUuid />;
}
function UuidV4BulkGeneratorContent() {
  return <RandomUuid bulk />;
}
function UuidNilGeneratorContent() {
  return <SentinelUuid kind="nil" />;
}
function UuidMaxGeneratorContent() {
  return <SentinelUuid kind="max" />;
}

export function UuidMaxGenerator() {
  return (
    <ToolPage>
      <UuidMaxGeneratorContent />
    </ToolPage>
  );
}

export function UuidNilGenerator() {
  return (
    <ToolPage>
      <UuidNilGeneratorContent />
    </ToolPage>
  );
}

export function UuidV4BulkGenerator() {
  return (
    <ToolPage>
      <UuidV4BulkGeneratorContent />
    </ToolPage>
  );
}

export default function UuidV4Generator() {
  return (
    <ToolPage>
      <UuidV4GeneratorContent />
    </ToolPage>
  );
}
