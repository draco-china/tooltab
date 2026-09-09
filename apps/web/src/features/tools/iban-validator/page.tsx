import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Accordion, Alert, Card, Chip, Input, TextField } from "@heroui/react";
import { BadgeCheck, FileText, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/base/empty";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { ibanCountries, validateIban } from "@workspace/tools/validation/iban";

type Analysis = ReturnType<typeof validateIban>;

function IbanValidatorPageContent() {
  const [iban, setIban] = useState("");
  const [canLocalizeRegions, setCanLocalizeRegions] = useState(false);
  useEffect(() => setCanLocalizeRegions(true), []);
  const analysis = useMemo(() => {
    if (!iban) return null;
    try {
      return validateIban(iban);
    } catch {
      return null;
    }
  }, [iban]);
  const feedback = analysis ? getFeedback(analysis) : null;

  return (
    <div className="grid gap-8">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <InputCard
          analysis={analysis}
          feedback={feedback}
          iban={iban}
          onChange={(value) => setIban(formatIban(value))}
        />
        <ResultsCard analysis={analysis} />
      </div>
      <CoverageAccordion canLocalizeRegions={canLocalizeRegions} />
      <IbanArticle />
    </div>
  );
}

function InputCard({
  analysis,
  feedback,
  iban,
  onChange,
}: {
  analysis: Analysis | null;
  feedback: string | null;
  iban: string;
  onChange: (value: string) => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.ibanValidator.iban"]()}</Card.Title>
        <Card.Description>
          {m["tools.ibanValidator.inputDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        <TextField
          aria-label={m["tools.ibanValidator.iban"]()}
          isInvalid={analysis ? !analysis.valid : false}
        >
          <Input
            aria-label={m["tools.ibanValidator.iban"]()}
            name="iban"
            dir="ltr"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={iban}
            aria-invalid={analysis ? !analysis.valid : undefined}
            placeholder={m["tools.ibanValidator.placeholder"]()}
            className="font-mono text-base"
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </TextField>
        {analysis && feedback ? (
          <div aria-live="polite">
            <Alert
              status={analysis.valid ? "success" : "danger"}
              role={analysis.valid ? "status" : "alert"}
            >
              <Alert.Indicator>
                {analysis.valid ? (
                  <BadgeCheck aria-hidden className="size-4" />
                ) : (
                  <TriangleAlert aria-hidden className="size-4" />
                )}
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Title>
                  {analysis.valid
                    ? m["tools.ibanValidator.valid"]()
                    : m["tools.ibanValidator.invalid"]()}
                </Alert.Title>
                <Alert.Description>{feedback}</Alert.Description>
              </Alert.Content>
            </Alert>
          </div>
        ) : null}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultsCard({ analysis }: { analysis: Analysis | null }) {
  const locale = getLocale();
  const countryCode = detailString(analysis, "country");
  const isCountryValid = analysis?.checks.country === true;
  const formatted = detailString(analysis, "formatted");
  const bban = detailString(analysis, "bban");
  const expectedLength = detailNumber(analysis, "expectedLength");
  const actualLength = detailNumber(analysis, "actualLength") ?? 0;
  const checkDigits = detailString(analysis, "checkDigits");
  const expectedCheckDigits = detailString(analysis, "expectedCheckDigits");
  const formatCountry = useMemo(() => createCountryFormatter(locale), [locale]);

  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.bicSwiftValidator.result"]()}</Card.Title>
        <Card.Description>
          {m["tools.ibanValidator.resultsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        {analysis ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile label={m["tools.audioRecorder.status"]()}>
                <Chip color={analysis.valid ? "success" : "danger"} size="sm">
                  {analysis.valid
                    ? m["tools.ibanValidator.valid"]()
                    : m["tools.ibanValidator.invalid"]()}
                </Chip>
              </MetricTile>
              <MetricTile label={m["common.identityCountry"]()}>
                {formatCountry(countryCode, isCountryValid) ??
                  m["tools.bicSwiftValidator.notAvailable"]()}
              </MetricTile>
              <MetricTile label={m["tools.ibanValidator.registry"]()}>
                <Chip
                  variant={isCountryValid ? "secondary" : "tertiary"}
                  size="sm"
                >
                  {isCountryValid
                    ? m["tools.bicSwiftValidator.supported"]()
                    : m["common.identityUnknown"]()}
                </Chip>
              </MetricTile>
              <MetricTile label={m["common.identifierchecksum"]()}>
                <Chip
                  color={analysis.checks.checksum ? "success" : "danger"}
                  size="sm"
                >
                  {analysis.checks.checksum
                    ? m["common.identifierpass"]()
                    : m["tools.creditCardValidator.fail"]()}
                </Chip>
              </MetricTile>
            </section>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <CopyableMetric
                label={m["tools.ibanValidator.normalized"]()}
                value={analysis.normalized}
              />
              <CopyableMetric
                label={m["tools.ibanValidator.formatted"]()}
                value={formatted}
              />
              <CopyableMetric
                label={m["common.identifierbban"]()}
                value={bban}
              />
            </section>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricTile label={m["shared.checksumValidators.length"]()}>
                <div className="grid gap-1">
                  <p>
                    {m["tools.ibanValidator.expected"]()}:{" "}
                    {expectedLength ?? m["common.identityUnknown"]()}
                  </p>
                  <p>
                    {m["tools.ibanValidator.actual"]()}: {actualLength}
                  </p>
                </div>
              </MetricTile>
              <MetricTile label={m["common.identifierchecksum"]()}>
                <Chip
                  color={analysis.checks.checksum ? "success" : "danger"}
                  size="sm"
                >
                  {analysis.checks.checksum
                    ? m["common.identifierpass"]()
                    : m["tools.creditCardValidator.fail"]()}
                </Chip>
              </MetricTile>
              <MetricTile label={m["tools.ibanValidator.checkDigits"]()}>
                <div className="grid gap-1">
                  <p>
                    {m["tools.ibanValidator.expected"]()}:{" "}
                    {expectedCheckDigits ??
                      m["tools.bicSwiftValidator.notAvailable"]()}
                  </p>
                  <p>
                    {m["tools.ibanValidator.actual"]()}:{" "}
                    {checkDigits ?? m["tools.bicSwiftValidator.notAvailable"]()}
                  </p>
                </div>
              </MetricTile>
            </section>
          </>
        ) : (
          <Empty className="min-h-64 border border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText aria-hidden />
              </EmptyMedia>
              <EmptyDescription>
                {m["tools.ibanValidator.emptyDescription"]()}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function MetricTile({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-default/20 p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </p>
      <div className="mt-2 text-sm leading-6 break-all">{children}</div>
    </div>
  );
}

function CopyableMetric({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <MetricTile label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm break-all">
          {value ?? m["tools.bicSwiftValidator.notAvailable"]()}
        </span>
        {value ? (
          <ToolCopyButton
            value={value}
            copyLabel={m["common.actions.copyResult"]()}
            copiedLabel={m["common.actions.copied"]()}
          />
        ) : null}
      </div>
    </MetricTile>
  );
}

function CoverageAccordion({
  canLocalizeRegions,
}: {
  canLocalizeRegions: boolean;
}) {
  const locale = getLocale();
  const formatCountry = useMemo(
    () =>
      canLocalizeRegions
        ? createCountryFormatter(locale)
        : (code: string) => code,
    [canLocalizeRegions, locale],
  );

  return (
    <Accordion className="overflow-hidden rounded-2xl border border-border bg-surface shadow-surface">
      <Accordion.Item id="coverage">
        <Accordion.Heading>
          <Accordion.Trigger>
            <span className="grid min-w-0 flex-1 gap-1 text-start">
              <span className="font-medium text-foreground">
                {m["tools.ibanValidator.coverageTitle"]()} (
                {ibanCountries.length})
              </span>
              <span className="text-xs leading-5 font-normal text-muted">
                {m["tools.ibanValidator.coverageDescription"]()}
              </span>
            </span>
            <Accordion.Indicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body className="border-t border-separator py-5">
            <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {ibanCountries.map(({ code, length }) => (
                <li key={code} className="rounded-lg border border-border p-3">
                  <span className="font-medium">
                    {formatCountry(code, true)}
                  </span>
                  <span className="ms-2 text-muted">
                    {length} {m["tools.ibanValidator.coverageLengthSuffix"]()}
                  </span>
                </li>
              ))}
            </ul>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

function IbanArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.ibanValidator.article.whatTitle"]()}</h2>
      <p>{m["tools.ibanValidator.article.what"]()}</p>
      <h3>{m["tools.ibanValidator.article.structureTitle"]()}</h3>
      <p>{m["tools.ibanValidator.article.structure"]()}</p>
      <h3>{m["tools.ibanValidator.article.checksumTitle"]()}</h3>
      <p>{m["tools.ibanValidator.article.checksum"]()}</p>
      <ol>
        {[
          m["tools.ibanValidator.article.checksumSteps0"](),
          m["tools.ibanValidator.article.checksumSteps1"](),
          m["tools.ibanValidator.article.checksumSteps2"](),
        ].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p>{m["tools.ibanValidator.article.country"]()}</p>
    </ToolArticle>
  );
}

function getFeedback(analysis: Analysis) {
  if (analysis.valid) return m["tools.ibanValidator.clientValidDescription"]();
  if (!analysis.checks.country)
    return m["tools.bicSwiftValidator.invalidCountry"]();
  if (!analysis.checks.length) return m["tools.ibanValidator.invalidLength"]();
  if (!analysis.checks.format || !analysis.checks.structure)
    return m["tools.ibanValidator.invalidFormat"]();
  if (!analysis.checks.checksum)
    return m["tools.ibanValidator.invalidChecksum"]();
  return m["tools.ibanValidator.invalid"]();
}

function formatIban(value: string) {
  return (
    value
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join(" ") ?? ""
  );
}

function detailString(
  analysis: Analysis | null,
  key: keyof Analysis["details"],
) {
  const value = analysis?.details[key];
  return typeof value === "string" ? value : null;
}

function detailNumber(
  analysis: Analysis | null,
  key: keyof Analysis["details"],
) {
  const value = analysis?.details[key];
  return typeof value === "number" ? value : null;
}

function getDisplayNames(locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    return null;
  }
}

function createCountryFormatter(locale: string) {
  let displayNames: Array<Intl.DisplayNames | null> | undefined;

  return (code: string | null, valid: boolean) => {
    if (!code) return null;
    if (!valid) return code;

    displayNames ??= [getDisplayNames(locale), getDisplayNames("en")];
    for (const names of displayNames) {
      if (!names) continue;
      try {
        const name = names.of(code);
        if (name) return `${name} (${code})`;
      } catch {
        // Try the English fallback before returning the country code.
      }
    }
    return code;
  };
}

export function IbanValidatorPage() {
  return (
    <ToolPage instructions={m["tools.ibanValidator.usage"]()}>
      <IbanValidatorPageContent />
    </ToolPage>
  );
}
