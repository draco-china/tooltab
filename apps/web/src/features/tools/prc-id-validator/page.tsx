import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Card,
  Chip,
  CloseButton,
  InputGroup,
  Skeleton,
} from "@heroui/react";
import { ArrowRight, BadgeCheck, FileText, TriangleAlert } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { prcId, type Validation } from "@workspace/tools/validation/prc-id";

const VALIDATION_DELAY_MS = 200;

type Analysis = {
  validation: Validation;
  hasFormatIssue: boolean;
  isPartial: boolean;
};

function PrcIdValidatorContent() {
  const locale = getLocale();
  const [residentId, setResidentId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!residentId) return;
    const timeout = window.setTimeout(() => {
      try {
        setAnalysis(analyzeResidentId(residentId, formatToday(new Date())));
        setError("");
      } catch {
        setAnalysis(null);
        setError(m["tools.prcIdValidator.invalidLength"]({}, { locale }));
      } finally {
        setIsPending(false);
      }
    }, VALIDATION_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [locale, residentId]);

  function updateResidentId(value: string) {
    const normalized = normalizeResidentId(value);
    setResidentId(normalized);
    setAnalysis(null);
    setError("");
    setIsPending(Boolean(normalized));
  }

  const feedback = analysis ? getFeedbackMessage(analysis) : null;

  return (
    <div className="grid gap-8" data-tool="prc-id-validator">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.prcIdValidator.residentIdNumber"]()}
            </Card.Title>
            <Card.Description>
              {m["common.identityPrcDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <InputGroup fullWidth variant="primary">
              <InputGroup.Prefix>
                <FileText aria-hidden className="size-4 text-muted" />
              </InputGroup.Prefix>
              <InputGroup.Input
                aria-label={m["tools.prcIdValidator.residentIdNumber"]()}
                type="text"
                name="resident-id"
                dir="ltr"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={residentId}
                aria-invalid={
                  analysis && (analysis.hasFormatIssue || !analysis.isPartial)
                    ? !analysis.validation.valid
                    : undefined
                }
                placeholder={m["tools.prcIdValidator.placeholder"]()}
                className="font-mono text-base"
                onChange={(event) =>
                  updateResidentId(event.currentTarget.value)
                }
              />
              {residentId ? (
                <InputGroup.Suffix>
                  <CloseButton
                    aria-label={m["tools.prcIdValidator.localClearLabel"]()}
                    onPress={() => updateResidentId("")}
                  />
                </InputGroup.Suffix>
              ) : null}
            </InputGroup>

            {error ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["shared.jsonSchemaTools.invalid"]()}
                  </Alert.Title>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : analysis && shouldShowAlert(analysis, feedback) ? (
              <div aria-live="polite">
                <Alert
                  status={analysis.validation.valid ? "success" : "danger"}
                  role={analysis.validation.valid ? "status" : "alert"}
                >
                  <Alert.Indicator>
                    {analysis.validation.valid ? (
                      <BadgeCheck aria-hidden className="size-4" />
                    ) : (
                      <TriangleAlert aria-hidden className="size-4" />
                    )}
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Title>
                      {analysis.validation.valid
                        ? m["shared.jsonSchemaTools.valid"]()
                        : m["shared.jsonSchemaTools.invalid"]()}
                    </Alert.Title>
                    <Alert.Description>{feedback}</Alert.Description>
                  </Alert.Content>
                </Alert>
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ResultsCard
          analysis={analysis}
          feedback={feedback ?? error}
          isPending={isPending}
        />
      </div>

      <PrcArticle />
    </div>
  );
}

function ResultsCard({
  analysis,
  feedback,
  isPending,
}: {
  analysis: Analysis | null;
  feedback: string | null;
  isPending: boolean;
}) {
  const result = analysis?.validation ?? null;
  const description =
    analysis && !analysis.isPartial && feedback
      ? feedback
      : m["common.identityPrcDescription"]();
  const isComplete = analysis ? !analysis.isPartial : false;

  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.bicSwiftValidator.result"]()}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4" aria-live="polite">
        {isPending ? (
          <ResultsSkeleton />
        ) : result && analysis ? (
          <>
            <SectionSurface className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <PanelLabel>{m["tools.audioRecorder.status"]()}</PanelLabel>
                  <div className="flex flex-wrap gap-2">
                    <Chip size="sm" variant="secondary">
                      {result.normalized.length}/18
                    </Chip>
                    {isComplete ? (
                      <Chip
                        color={result.valid ? "success" : "danger"}
                        size="sm"
                      >
                        {result.valid
                          ? m["shared.jsonSchemaTools.valid"]()
                          : m["shared.jsonSchemaTools.invalid"]()}
                      </Chip>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2">
                  <PanelLabel>{m["tools.prcIdValidator.region"]()}</PanelLabel>
                  <HierarchyTrail
                    fallback={m["tools.bicSwiftValidator.notAvailable"]()}
                    items={[
                      {
                        label: m["tools.prcIdValidator.province"](),
                        value: detailString(result, "province"),
                      },
                      {
                        label: m["tools.ipInfoLookup.city"](),
                        value: detailString(result, "city"),
                      },
                      {
                        label: m["tools.prcIdValidator.district"](),
                        value: detailString(result, "district"),
                      },
                    ]}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 xl:border-l xl:border-border xl:pl-6">
                <div className="rounded-xl border border-border bg-default/20 p-3">
                  <PanelLabel>
                    {m["tools.prcIdValidator.normalized"]()}
                  </PanelLabel>
                  <div className="mt-2 flex min-w-0 items-center gap-2">
                    <span className="min-w-0 font-mono text-sm break-all">
                      {result.normalized ||
                        m["tools.bicSwiftValidator.notAvailable"]()}
                    </span>
                    {result.normalized ? (
                      <ToolCopyButton
                        value={result.normalized}
                        ariaLabel={`${m["common.actions.copy"]()}: ${m["tools.prcIdValidator.normalized"]()}`}
                        copiedLabel={m["common.actions.copied"]()}
                        copyLabel={m["common.actions.copy"]()}
                        size="icon-sm"
                        variant="ghost"
                      />
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 rounded-xl border border-border bg-default/20 p-3 sm:grid-cols-2 xl:grid-cols-1">
                  <InfoMetric
                    label={m["tools.prcIdValidator.regionCode"]()}
                    value={
                      <span className="font-mono">
                        {detailString(result, "regionCode") ??
                          m["tools.bicSwiftValidator.notAvailable"]()}
                      </span>
                    }
                  />
                  <InfoMetric
                    label={m["tools.prcIdValidator.regionStatus"]()}
                    value={
                      <Chip size="sm" variant="secondary">
                        {hasKnownRegion(result)
                          ? m["tools.prcIdValidator.known"]()
                          : m["common.identityUnknown"]()}
                      </Chip>
                    }
                  />
                </div>
              </div>
            </SectionSurface>

            <SectionSurface className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="grid gap-4">
                <div>
                  <PanelLabel>{m["common.identityBirthDate"]()}</PanelLabel>
                  <p className="mt-2 font-mono text-xl leading-tight font-semibold">
                    {birthSummary(result)}
                  </p>
                </div>
                <div className="grid gap-4 rounded-xl border border-border bg-default/20 p-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,0.85fr)]">
                  <InfoMetric
                    label="YYYY"
                    value={formatBirthPart(
                      detailString(result, "birthYear"),
                      "YYYY",
                    )}
                  />
                  <InfoMetric
                    label="MM"
                    value={formatBirthPart(
                      detailString(result, "birthMonth"),
                      "MM",
                    )}
                  />
                  <InfoMetric
                    label="DD"
                    value={formatBirthPart(
                      detailString(result, "birthDay"),
                      "DD",
                    )}
                  />
                  <InfoMetric
                    label={m["tools.prcIdValidator.age"]()}
                    value={
                      detailString(result, "age") ??
                      m["tools.bicSwiftValidator.notAvailable"]()
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 rounded-xl border border-border bg-default/20 p-3 sm:grid-cols-2">
                <InfoMetric
                  label={m["tools.prcIdValidator.gender"]()}
                  value={
                    <Chip size="sm" variant="secondary">
                      {genderLabel(result)}
                    </Chip>
                  }
                />
                <InfoMetric
                  label={m["tools.prcIdValidator.sequenceCode"]()}
                  value={
                    <span className="font-mono">
                      {detailString(result, "sequence") ??
                        m["tools.bicSwiftValidator.notAvailable"]()}
                    </span>
                  }
                />
                <InfoMetric
                  label={m["common.identifierchecksum"]()}
                  value={
                    <Chip
                      color={
                        isComplete
                          ? result.checks.checksum
                            ? "success"
                            : "danger"
                          : "default"
                      }
                      size="sm"
                      variant={isComplete ? "primary" : "secondary"}
                    >
                      {isComplete
                        ? result.checks.checksum
                          ? m["common.identifierpass"]()
                          : m["tools.creditCardValidator.fail"]()
                        : m["common.identityUnknown"]()}
                    </Chip>
                  }
                />
                <InfoMetric
                  label={m["tools.isbnValidator.checkDigit"]()}
                  value={
                    <div className="grid gap-1">
                      <p>
                        {m["tools.ibanValidator.expected"]()}:{" "}
                        {detailString(result, "expected") ??
                          m["tools.bicSwiftValidator.notAvailable"]()}
                      </p>
                      <p>
                        {m["tools.ibanValidator.actual"]()}:{" "}
                        {detailString(result, "actual") ??
                          m["tools.bicSwiftValidator.notAvailable"]()}
                      </p>
                    </div>
                  }
                />
              </div>
            </SectionSurface>
          </>
        ) : (
          <div className="flex min-h-64 flex-1 items-center justify-center text-muted">
            <div className="rounded-full bg-default p-3">
              <FileText aria-hidden className="size-5" />
            </div>
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid min-h-64 content-center gap-4" role="status">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}

function SectionSurface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-default/10 p-4 ${className}`}
    >
      {children}
    </section>
  );
}

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-wide text-muted uppercase">
      {children}
    </p>
  );
}

function InfoMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid content-start gap-2">
      <PanelLabel>{label}</PanelLabel>
      <div className="text-sm leading-6 break-all">{value}</div>
    </div>
  );
}

function HierarchyTrail({
  fallback,
  items,
}: {
  fallback: string;
  items: Array<{ label: string; value: string | null }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-default/20 p-3">
      <div className="flex flex-wrap items-center gap-3">
        {items.map((item, index) => (
          <Fragment key={item.label}>
            {index > 0 ? (
              <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
            ) : null}
            <div className="min-w-0">
              <PanelLabel>{item.label}</PanelLabel>
              <p
                className={
                  item.value
                    ? "text-sm leading-6 font-medium"
                    : "text-sm leading-6 text-muted"
                }
              >
                {item.value ?? fallback}
              </p>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function PrcArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.prcIdValidator.articleWhatTitle"]()}</h2>
      <p>{m["tools.prcIdValidator.articleWhatBody"]()}</p>
      <h3>{m["tools.prcIdValidator.articleValidationTitle"]()}</h3>
      <ul>
        <li>
          {m["tools.prcIdValidator.articleValidationOnePrefix"]()}
          {m["tools.prcIdValidator.articleValidationOneLowerCode"]() ? (
            <code>
              {m["tools.prcIdValidator.articleValidationOneLowerCode"]()}
            </code>
          ) : null}
          {m["tools.prcIdValidator.articleValidationOneMiddle"]()}
          <code>
            {m["tools.prcIdValidator.articleValidationOneUpperCode"]()}
          </code>
        </li>
        <li>
          {m["tools.prcIdValidator.articleValidationTwoBeforeCode"]()}
          <code>
            {m["tools.prcIdValidator.articleValidationOneUpperCode"]()}
          </code>
        </li>
        <li>{m["tools.prcIdValidator.articleValidationThree"]()}</li>
        <li>{m["tools.prcIdValidator.articleValidationFour"]()}</li>
      </ul>
      <h3>{m["tools.prcIdValidator.articleResultTitle"]()}</h3>
      <ul>
        <li>{m["tools.prcIdValidator.articleResultOne"]()}</li>
        <li>{m["tools.prcIdValidator.articleResultTwo"]()}</li>
        <li>{m["tools.prcIdValidator.articleResultThree"]()}</li>
      </ul>
      <h3>{m["shared.jsonQuery.example"]()}</h3>
      <p>
        <code>{m["tools.prcIdValidator.articleExampleCode"]()}</code>
        {m["tools.prcIdValidator.articleExampleLeadAfterCode"]()}
      </p>
      <ul>
        <li>
          <code>{m["tools.prcIdValidator.articleExampleRegionCode"]()}</code>
          {m["tools.prcIdValidator.articleExampleRegionAfterCode"]()}
        </li>
        <li>
          <code>{m["tools.prcIdValidator.articleExampleBirthCode"]()}</code>
          {m["tools.prcIdValidator.articleExampleBirthBeforeDate"]()}
          <code>{m["tools.prcIdValidator.articleExampleBirthDate"]()}</code>
        </li>
        <li>
          <code>{m["tools.prcIdValidator.articleExampleSequenceCode"]()}</code>
          {m["tools.prcIdValidator.articleExampleSequenceAfterCode"]()}
        </li>
        <li>
          <code>{m["tools.prcIdValidator.articleExampleCheckCode"]()}</code>
          {m["tools.prcIdValidator.articleExampleCheckAfterCode"]()}
        </li>
      </ul>
      <h3>{m["tools.prcIdValidator.articleImportantTitle"]()}</h3>
      <p>{m["tools.prcIdValidator.articleImportantBody"]()}</p>
      <p>{m["tools.prcIdValidator.articleRegionBody"]()}</p>
    </ToolArticle>
  );
}

function analyzeResidentId(input: string, today: string): Analysis {
  const validation = prcId(input, today);
  const normalized = validation.normalized;
  const hasFormatIssue =
    /[^0-9X]/u.test(normalized) ||
    (normalized.includes("X") && normalized.indexOf("X") !== 17);
  return {
    validation,
    hasFormatIssue,
    isPartial: normalized.length < 18 && !hasFormatIssue,
  };
}

function getFeedbackMessage(analysis: Analysis) {
  const { validation } = analysis;
  if (validation.valid) return m["shared.jsonSchemaTools.valid"]();
  if (analysis.isPartial) return null;
  if (validation.normalized.length > 18)
    return m["tools.prcIdValidator.invalidLength"]();
  if (analysis.hasFormatIssue || !validation.checks.format) {
    return m["tools.prcIdValidator.invalidFormat"]();
  }
  if (!validation.checks.length)
    return m["tools.prcIdValidator.invalidLength"]();
  if (!validation.checks.region)
    return m["tools.prcIdValidator.invalidRegion"]();
  if (!validation.checks.birthdate)
    return m["tools.prcIdValidator.invalidBirthdate"]();
  if (!validation.checks.checksum)
    return m["tools.prcIdValidator.invalidChecksum"]();
  return m["shared.jsonSchemaTools.invalid"]();
}

function shouldShowAlert(analysis: Analysis, feedback: string | null) {
  return Boolean(
    feedback &&
      (analysis.validation.valid ||
        analysis.hasFormatIssue ||
        !analysis.isPartial),
  );
}

function normalizeResidentId(input: string) {
  return input.replace(/[\s-]/gu, "").toUpperCase();
}

function detailString(result: Validation, key: string) {
  const value = result.details[key];
  return value === null || value === undefined ? null : String(value);
}

function hasKnownRegion(result: Validation) {
  return ["province", "city", "district"].some(
    (key) => detailString(result, key) !== null,
  );
}

function genderLabel(result: Validation) {
  const gender = detailString(result, "gender");
  if (gender === "male") return m["common.identityMale"]();
  if (gender === "female") return m["common.identityFemale"]();
  return m["common.identityUnknown"]();
}

function formatBirthPart(value: string | null, placeholder: string) {
  if (!value) return placeholder;
  return `${value}${placeholder.slice(value.length)}`;
}

function birthSummary(result: Validation) {
  return [
    formatBirthPart(detailString(result, "birthYear"), "YYYY"),
    formatBirthPart(detailString(result, "birthMonth"), "MM"),
    formatBirthPart(detailString(result, "birthDay"), "DD"),
  ].join("-");
}

function formatToday(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function PrcIdValidator() {
  return (
    <ToolPage>
      <PrcIdValidatorContent />
    </ToolPage>
  );
}
