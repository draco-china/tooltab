import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Chip, InputGroup } from "@heroui/react";
import { BadgeCheck, FileText, TriangleAlert } from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";
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
import {
  type BicValidation,
  normalizeBic,
  validateBic,
} from "@workspace/tools/validation/bic";

function BicSwiftValidatorPageContent() {
  const inputId = useId();
  const [bic, setBic] = useState("");
  const analysis = useMemo(() => (bic ? validateBic(bic) : null), [bic]);
  const feedback = analysis ? feedbackFor(analysis) : null;
  return (
    <div className="grid gap-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <PanelHeader
            title={m["tools.bicSwiftValidator.bic"]()}
            description={m["tools.bicSwiftValidator.inputDescription"]()}
          />
          <ToolPanelCardContent className="gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor={inputId}>
                {m["tools.bicSwiftValidator.bic"]()}
              </label>
              <InputGroup
                variant="secondary"
                fullWidth
                isInvalid={analysis ? !analysis.isValid : false}
              >
                <InputGroup.Prefix>
                  <FileText aria-hidden className="size-4 text-muted" />
                </InputGroup.Prefix>
                <InputGroup.Input
                  id={inputId}
                  name="bic"
                  dir="ltr"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  value={bic}
                  aria-invalid={analysis ? !analysis.isValid : undefined}
                  placeholder={m["tools.bicSwiftValidator.placeholder"]()}
                  className="font-mono text-base"
                  onChange={(event) =>
                    setBic(normalizeBic(event.currentTarget.value))
                  }
                />
              </InputGroup>
            </div>
            {analysis && feedback ? (
              <Alert
                status={analysis.isValid ? "success" : "danger"}
                role={analysis.isValid ? "status" : "alert"}
              >
                <Alert.Indicator>
                  {analysis.isValid ? (
                    <BadgeCheck aria-hidden className="size-4" />
                  ) : (
                    <TriangleAlert aria-hidden className="size-4" />
                  )}
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {analysis.isValid
                      ? m["tools.bicSwiftValidator.valid"]()
                      : m["tools.bicSwiftValidator.invalid"]()}
                  </Alert.Title>
                  <Alert.Description>{feedback}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
        <Results analysis={analysis} feedback={feedback} />
      </div>
      <ToolArticle>
        <h2>{m["tools.bicSwiftValidator.article.whatTitle"]()}</h2>
        <p>{m["tools.bicSwiftValidator.article.what"]()}</p>
        <h3>{m["tools.bicSwiftValidator.article.structureTitle"]()}</h3>
        <p>{m["tools.bicSwiftValidator.article.structure"]()}</p>
        <h3>{m["tools.bicSwiftValidator.article.rulesTitle"]()}</h3>
        <p>{m["tools.bicSwiftValidator.article.rules"]()}</p>
        <ol>
          <li>{m["tools.bicSwiftValidator.article.ruleOne"]()}</li>
          <li>{m["tools.bicSwiftValidator.article.ruleTwo"]()}</li>
          <li>{m["tools.bicSwiftValidator.article.ruleThree"]()}</li>
        </ol>
        <p>{m["tools.bicSwiftValidator.article.primaryOffice"]()}</p>
        <p>{m["tools.bicSwiftValidator.article.location"]()}</p>
      </ToolArticle>
    </div>
  );
}

function PanelHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
  );
}

function feedbackFor(value: BicValidation) {
  if (value.isValid) return m["tools.bicSwiftValidator.valid"]();
  if (!value.isLengthValid) return m["tools.bicSwiftValidator.invalidLength"]();
  if (!value.isCountryValid)
    return m["tools.bicSwiftValidator.invalidCountry"]();
  if (!value.isBankCodeValid) return m["tools.bicSwiftValidator.invalidBank"]();
  if (!value.isLocationCodeValid)
    return m["tools.bicSwiftValidator.invalidLocation"]();
  if (!value.isBranchCodeValid)
    return m["tools.bicSwiftValidator.invalidBranch"]();
  if (!value.isFormatValid) return m["tools.bicSwiftValidator.invalidFormat"]();
  return m["tools.bicSwiftValidator.invalid"]();
}

function Results({
  analysis,
  feedback,
}: {
  analysis: BicValidation | null;
  feedback: string | null;
}) {
  const branch =
    analysis?.type === "bic-8" ? "XXX" : (analysis?.branchCode ?? null);
  const locationType = !analysis?.locationCode
    ? m["tools.userAgentParser.devUnknown"]()
    : analysis.isTestBic
      ? m["tools.bicSwiftValidator.test"]()
      : analysis.isPassiveParticipant
        ? m["tools.bicSwiftValidator.passive"]()
        : m["tools.bicSwiftValidator.standard"]();
  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["tools.bicSwiftValidator.result"]()}
        description={
          feedback ?? m["tools.bicSwiftValidator.resultDescription"]()
        }
      />
      <ToolPanelCardContent className="gap-4 py-4">
        {analysis ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Detail label={m["tools.audioRecorder.status"]()}>
                <Chip color={analysis.isValid ? "success" : "danger"} size="sm">
                  {analysis.isValid
                    ? m["tools.bicSwiftValidator.valid"]()
                    : m["tools.bicSwiftValidator.invalid"]()}
                </Chip>
              </Detail>
              <Detail label={m["tools.bicSwiftValidator.type"]()}>
                {analysis.type === "bic-8"
                  ? m["tools.bicSwiftValidator.bic8"]()
                  : analysis.type === "bic-11"
                    ? m["tools.bicSwiftValidator.bic11"]()
                    : m["tools.userAgentParser.devUnknown"]()}
              </Detail>
              <Detail label={m["common.identityCountry"]()}>
                {countryDisplay(analysis)}
              </Detail>
              <Detail label={m["tools.bicSwiftValidator.countryStatus"]()}>
                <Chip
                  variant={analysis.isCountryValid ? "secondary" : "tertiary"}
                  size="sm"
                >
                  {analysis.isCountryValid
                    ? m["tools.bicSwiftValidator.supported"]()
                    : m["tools.userAgentParser.devUnknown"]()}
                </Chip>
              </Detail>
            </section>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CopyDetail
                label={m["tools.bicSwiftValidator.normalized"]()}
                value={analysis.normalized}
              />
              <CopyDetail
                label={m["tools.bicSwiftValidator.bankCode"]()}
                value={analysis.bankCode}
              />
              <CopyDetail
                label={m["tools.bicSwiftValidator.locationCode"]()}
                value={analysis.locationCode}
              />
              <CopyDetail
                label={m["tools.bicSwiftValidator.branchCode"]()}
                value={branch}
                displayValue={
                  branch ?? m["tools.bicSwiftValidator.notAvailable"]()
                }
              />
            </section>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Detail label={m["shared.checksumValidators.length"]()}>
                {String(analysis.length)}
              </Detail>
              <Detail label={m["tools.bicSwiftValidator.locationType"]()}>
                <Chip
                  size="sm"
                  variant={
                    locationType === m["tools.bicSwiftValidator.standard"]()
                      ? "primary"
                      : locationType === m["tools.bicSwiftValidator.test"]()
                        ? "secondary"
                        : "tertiary"
                  }
                >
                  {locationType}
                </Chip>
              </Detail>
              <Detail label={m["tools.bicSwiftValidator.officeType"]()}>
                <Chip
                  size="sm"
                  variant={analysis.isPrimaryOffice ? "primary" : "secondary"}
                >
                  {analysis.isPrimaryOffice
                    ? m["tools.bicSwiftValidator.primaryOffice"]()
                    : m["tools.bicSwiftValidator.branchOffice"]()}
                </Chip>
              </Detail>
            </section>
          </>
        ) : (
          <Empty className="min-h-64 border-0 p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText aria-hidden className="size-5" />
              </EmptyMedia>
              <EmptyDescription>
                {m["tools.bicSwiftValidator.emptyDescription"]()}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-default/20 p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </p>
      <div className="mt-2 text-sm leading-6 break-all">{children}</div>
    </div>
  );
}

function CopyDetail({
  label,
  value,
  displayValue,
}: {
  label: string;
  value: string | null;
  displayValue?: string;
}) {
  return (
    <Detail label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm break-all">
          {displayValue ?? value ?? m["tools.bicSwiftValidator.notAvailable"]()}
        </span>
        {value ? (
          <ToolCopyButton
            value={value}
            copyLabel={m["common.actions.copy"]()}
            copiedLabel={m["common.actions.copied"]()}
            ariaLabel={`${m["common.actions.copy"]()}: ${label}`}
            size="icon-sm"
            variant="ghost"
          />
        ) : null}
      </div>
    </Detail>
  );
}

function countryDisplay(analysis: BicValidation) {
  const code = analysis.countryCode;
  if (!code) return m["tools.bicSwiftValidator.notAvailable"]();
  if (!analysis.isCountryValid) return code;
  try {
    const name = new Intl.DisplayNames([getLocale()], { type: "region" }).of(
      code,
    );
    return name ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

export default function BicSwiftValidatorPage() {
  return (
    <ToolPage instructions={m["tools.bicSwiftValidator.usage"]()}>
      <BicSwiftValidatorPageContent />
    </ToolPage>
  );
}
