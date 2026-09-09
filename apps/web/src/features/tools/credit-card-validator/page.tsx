import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Chip, Input, TextField } from "@heroui/react";
import { BadgeCheck, CreditCard, TriangleAlert } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
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
import {
  type CreditCardAnalysis,
  validateCard,
} from "@workspace/tools/validation/card";
function CreditCardValidatorPageContent() {
  const [cardNumber, setCardNumber] = useState("");
  const analysis = useMemo(() => {
    if (!cardNumber) return null;
    try {
      return validateCard(cardNumber);
    } catch {
      return null;
    }
  }, [cardNumber]);
  const feedback = analysis ? cardFeedback(analysis) : null;

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-layout="stacked" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.creditCardValidator.cardNumber"]()}
            </Card.Title>
            <Card.Description>
              {m["shared.checksumValidators.carddescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextField
              aria-label={m["tools.creditCardValidator.cardNumber"]()}
              isInvalid={analysis ? !analysis.valid : false}
            >
              <Input
                aria-label={m["tools.creditCardValidator.cardNumber"]()}
                type="text"
                name="card-number"
                dir="ltr"
                inputMode="numeric"
                autoComplete="cc-number"
                spellCheck={false}
                value={cardNumber}
                aria-invalid={analysis ? !analysis.valid : undefined}
                placeholder={m["tools.creditCardValidator.placeholder"]()}
                className="font-mono text-base"
                onChange={(event) => {
                  setCardNumber(formatCardInput(event.currentTarget.value));
                }}
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
                        ? m["tools.creditCardValidator.valid"]()
                        : m["tools.creditCardValidator.invalid"]()}
                    </Alert.Title>
                    <Alert.Description>{feedback}</Alert.Description>
                  </Alert.Content>
                </Alert>
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <CreditCardResults analysis={analysis} feedback={feedback} />
      </div>

      <CreditCardArticle />
    </div>
  );
}

function formatCardInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  if (!digits) return "";
  return String(validateCard(digits).details.formatted || digits);
}

function cardFeedback(analysis: CreditCardAnalysis) {
  if (analysis.valid) return m["tools.creditCardValidator.valid"]();
  if (!analysis.checks.checksum)
    return m["tools.creditCardValidator.invalidLuhn"]();
  if (!analysis.checks.length)
    return m["tools.creditCardValidator.invalidLength"]();
  return m["tools.creditCardValidator.invalid"]();
}

function CreditCardResults({
  analysis,
  feedback,
}: Readonly<{
  analysis: CreditCardAnalysis | null;
  feedback: string | null;
}>) {
  const brand = analysis?.details.brand;
  const formatted = analysis?.details.formatted;
  const expectedLengths = analysis?.details.expectedLengths;
  const cvcLength = analysis?.details.cvcLength;
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.bicSwiftValidator.result"]()}</Card.Title>
        <Card.Description>
          {feedback ?? m["tools.creditCardValidator.resultsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        {analysis ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label={m["tools.creditCardValidator.brand"]()}
                value={
                  <Chip size="sm" variant={brand ? "secondary" : "tertiary"}>
                    {brand
                      ? String(brand)
                      : m["tools.userAgentParser.devUnknown"]()}
                  </Chip>
                }
              />
              <MetricTile
                label={m["tools.creditCardValidator.formattedNumber"]()}
                value={
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm break-all">
                      {formatted ? String(formatted) : "-"}
                    </span>
                    {analysis.normalized ? (
                      <ToolCopyButton
                        key={analysis.normalized}
                        value={analysis.normalized}
                        copyLabel={m["common.actions.copyResult"]()}
                        copiedLabel={m["common.actions.copied"]()}
                      />
                    ) : null}
                  </div>
                }
              />
              <MetricTile
                label={m["tools.creditCardValidator.digits"]()}
                value={analysis.normalized.length || "-"}
              />
              <MetricTile
                label={m["tools.creditCardValidator.cvcLength"]()}
                value={
                  cvcLength
                    ? `${String(cvcLength)} ${m["tools.creditCardValidator.digitsLabel"]()}`
                    : "-"
                }
              />
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <CheckTile
                label={m["tools.creditCardValidator.luhnCheck"]()}
                isPassing={analysis.checks.checksum === true}
              />
              <CheckTile
                label={m["tools.creditCardValidator.lengthCheck"]()}
                isPassing={analysis.checks.length === true}
                note={
                  expectedLengths
                    ? m["tools.creditCardValidator.expectedLength"]({
                        lengths: String(expectedLengths),
                      })
                    : null
                }
              />
            </section>
          </>
        ) : (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CreditCard aria-hidden />
              </EmptyMedia>
              <EmptyDescription>
                {m["tools.creditCardValidator.emptyDescription"]()}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function MetricTile({
  label,
  value,
}: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="rounded-xl border border-border/70 bg-default/30 p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </p>
      <div className="mt-2 text-sm leading-6">{value}</div>
    </div>
  );
}

function CheckTile({
  label,
  isPassing,
  note = null,
}: Readonly<{
  label: string;
  isPassing: boolean;
  note?: string | null;
}>) {
  return (
    <MetricTile
      label={label}
      value={
        <div className="grid gap-2">
          <Chip size="sm" color={isPassing ? "success" : "danger"}>
            {isPassing
              ? m["shared.colorTools.pass"]()
              : m["tools.creditCardValidator.fail"]()}
          </Chip>
          {note ? <p className="text-xs text-muted">{note}</p> : null}
        </div>
      }
    />
  );
}

function CreditCardArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.creditCardValidator.article.whatTitle"]()}</h2>
      <p>{m["tools.creditCardValidator.article.what"]()}</p>
      <h3>{m["tools.creditCardValidator.article.luhnTitle"]()}</h3>
      <p>{m["tools.creditCardValidator.article.luhnIntro"]()}</p>
      <ol>
        <li>{m["tools.creditCardValidator.article.luhnStepOne"]()}</li>
        <li>{m["tools.creditCardValidator.article.luhnStepTwo"]()}</li>
        <li>{m["tools.creditCardValidator.article.luhnStepThree"]()}</li>
      </ol>
      <h3>{m["tools.creditCardValidator.article.brandsTitle"]()}</h3>
      <p>{m["tools.creditCardValidator.article.brands"]()}</p>
      <ul>
        <li>
          {m["tools.creditCardValidator.article.brands0Name"]()}:{" "}
          <code>
            {m["tools.creditCardValidator.article.brands0Patterns0"]()}
          </code>{" "}
          ·{" "}
          <code>{m["tools.creditCardValidator.article.brands0Lengths"]()}</code>
        </li>
        <li>
          {m["tools.creditCardValidator.article.brands1Name"]()}:{" "}
          <code>
            {m["tools.creditCardValidator.article.brands1Patterns0"]()}
          </code>
          ,{" "}
          <code>
            {m["tools.creditCardValidator.article.brands1Patterns1"]()}
          </code>{" "}
          ·{" "}
          <code>{m["tools.creditCardValidator.article.brands1Lengths"]()}</code>
        </li>
        <li>
          {m["tools.creditCardValidator.article.brands2Name"]()}:{" "}
          <code>
            {m["tools.creditCardValidator.article.brands2Patterns0"]()}
          </code>
          ,{" "}
          <code>
            {m["tools.creditCardValidator.article.brands2Patterns1"]()}
          </code>{" "}
          ·{" "}
          <code>{m["tools.creditCardValidator.article.brands2Lengths"]()}</code>
        </li>
        <li>
          {m["tools.creditCardValidator.article.brands3Name"]()}:{" "}
          <code>
            {m["tools.creditCardValidator.article.brands3Patterns0"]()}
          </code>
          ,{" "}
          <code>
            {m["tools.creditCardValidator.article.brands3Patterns1"]()}
          </code>
          ,{" "}
          <code>
            {m["tools.creditCardValidator.article.brands3Patterns2"]()}
          </code>
          ,{" "}
          <code>
            {m["tools.creditCardValidator.article.brands3Patterns3"]()}
          </code>{" "}
          ·{" "}
          <code>{m["tools.creditCardValidator.article.brands3Lengths"]()}</code>
        </li>
        <li>
          {m["tools.creditCardValidator.article.brands4Name"]()}:{" "}
          <code>
            {m["tools.creditCardValidator.article.brands4Patterns0"]()}
          </code>{" "}
          ·{" "}
          <code>{m["tools.creditCardValidator.article.brands4Lengths"]()}</code>
        </li>
        <li>
          {m["tools.creditCardValidator.article.brands5Name"]()}:{" "}
          <code>
            {m["tools.creditCardValidator.article.brands5Patterns0"]()}
          </code>{" "}
          ·{" "}
          <code>{m["tools.creditCardValidator.article.brands4Lengths"]()}</code>
        </li>
        <li>
          {m["tools.creditCardValidator.article.brands6Name"]()}:{" "}
          <code>
            {m["tools.creditCardValidator.article.brands6Patterns0"]()}
          </code>
          ,{" "}
          <code>
            {m["tools.creditCardValidator.article.brands6Patterns1"]()}
          </code>
          ,{" "}
          <code>
            {m["tools.creditCardValidator.article.brands6Patterns2"]()}
          </code>
          ,{" "}
          <code>
            {m["tools.creditCardValidator.article.brands6Patterns3"]()}
          </code>{" "}
          ·{" "}
          <code>{m["tools.creditCardValidator.article.brands6Lengths"]()}</code>
        </li>
      </ul>
    </ToolArticle>
  );
}

export default function CreditCardValidatorPage() {
  return (
    <ToolPage instructions={m["tools.creditCardValidator.usage"]()}>
      <CreditCardValidatorPageContent />
    </ToolPage>
  );
}
