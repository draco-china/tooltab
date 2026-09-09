import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Chip, CloseButton, InputGroup } from "@heroui/react";
import { AtSign, BadgeCheck, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  type Validation,
  email as validateEmail,
} from "@workspace/tools/validation/email";

const VALIDATION_DELAY_MS = 250;

function check(result: Validation, key: string) {
  return result.checks[key] === true;
}

function detail(result: Validation | null, key: string) {
  return result?.details[key];
}

function feedbackMessage(result: Validation) {
  if (result.valid) return m["tools.emailValidator.valid"]();
  if (!check(result, "singleAt")) return m["tools.emailValidator.invalidAt"]();
  if (!check(result, "localLength"))
    return m["tools.emailValidator.invalidLocalLength"]();
  if (!check(result, "domainLength"))
    return m["tools.emailValidator.invalidDomainLength"]();
  if (!check(result, "length"))
    return m["tools.emailValidator.invalidLength"]();
  if (!check(result, "localCharacters") || !check(result, "localDots")) {
    return m["tools.emailValidator.invalidLocal"]();
  }
  if (
    !check(result, "domainCharacters") ||
    !check(result, "domainDots") ||
    !check(result, "labelCharacters") ||
    !check(result, "labelLength")
  ) {
    return m["tools.emailValidator.invalidDomain"]();
  }
  if (!check(result, "tld")) return m["tools.emailValidator.invalidTld"]();
  return m["tools.emailValidator.invalid"]();
}

function MetricTile({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-default/20 p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </p>
      <div className="mt-2 text-sm leading-6 break-all">{children}</div>
    </div>
  );
}

function CheckTile({
  label,
  available,
  passing,
}: {
  label: string;
  available: boolean;
  passing: boolean;
}) {
  return (
    <MetricTile label={label}>
      <Chip
        size="sm"
        color={available ? (passing ? "success" : "danger") : "default"}
        variant={available ? "primary" : "tertiary"}
      >
        {available
          ? passing
            ? m["common.identifierpass"]()
            : m["tools.creditCardValidator.fail"]()
          : m["tools.bicSwiftValidator.notAvailable"]()}
      </Chip>
    </MetricTile>
  );
}

function Results({
  result,
  feedback,
}: {
  result: Validation | null;
  feedback: string | null;
}) {
  const localPart = String(detail(result, "localPart") ?? "");
  const domain = String(detail(result, "domain") ?? "");
  const totalLength = Number(detail(result, "length") ?? 0);
  const localLength = Number(detail(result, "localLength") ?? 0);
  const domainLength = Number(detail(result, "domainLength") ?? 0);

  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.bicSwiftValidator.result"]()}</Card.Title>
        <Card.Description>
          {feedback ?? m["tools.emailValidator.description"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        {result ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile label={m["tools.audioRecorder.status"]()}>
                <Chip color={result.valid ? "success" : "danger"} size="sm">
                  {result.valid
                    ? m["tools.emailValidator.valid"]()
                    : m["tools.emailValidator.invalid"]()}
                </Chip>
              </MetricTile>
              <MetricTile label={m["tools.emailValidator.normalized"]()}>
                <span className="font-mono">
                  {result.normalized ||
                    m["tools.bicSwiftValidator.notAvailable"]()}
                </span>
              </MetricTile>
              <MetricTile label={m["tools.emailValidator.localPart"]()}>
                <span className="font-mono">
                  {localPart || m["tools.bicSwiftValidator.notAvailable"]()}
                </span>
              </MetricTile>
              <MetricTile label={m["common.identityDomain"]()}>
                <span className="font-mono">
                  {domain || m["tools.bicSwiftValidator.notAvailable"]()}
                </span>
              </MetricTile>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <MetricTile label={m["tools.emailValidator.emailLength"]()}>
                {totalLength > 0
                  ? totalLength
                  : m["tools.bicSwiftValidator.notAvailable"]()}
              </MetricTile>
              <MetricTile label={m["tools.emailValidator.localLength"]()}>
                {localLength > 0
                  ? localLength
                  : m["tools.bicSwiftValidator.notAvailable"]()}
              </MetricTile>
              <MetricTile label={m["tools.emailValidator.domainLength"]()}>
                {domainLength > 0
                  ? domainLength
                  : m["tools.bicSwiftValidator.notAvailable"]()}
              </MetricTile>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CheckTile
                label={m["tools.emailValidator.lengthCheck"]()}
                available={totalLength > 0}
                passing={check(result, "length")}
              />
              <CheckTile
                label={m["tools.emailValidator.localCheck"]()}
                available={localLength > 0}
                passing={
                  check(result, "localLength") &&
                  check(result, "localCharacters") &&
                  check(result, "localDots")
                }
              />
              <CheckTile
                label={m["tools.emailValidator.domainCheck"]()}
                available={domainLength > 0}
                passing={
                  check(result, "domainLength") &&
                  check(result, "domainCharacters") &&
                  check(result, "domainDots") &&
                  check(result, "labelLength") &&
                  check(result, "labelCharacters")
                }
              />
              <CheckTile
                label={m["tools.emailValidator.tldCheck"]()}
                available={domainLength > 0}
                passing={check(result, "tld")}
              />
            </section>
          </>
        ) : (
          <div className="flex min-h-64 flex-1 items-center justify-center text-muted">
            <div className="rounded-full bg-default p-3">
              <AtSign aria-hidden className="size-5" />
            </div>
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function EmailArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.emailValidator.articleWhatTitle"]()}</h2>
      <p>
        {m["tools.emailValidator.articleWhatBodyBeforeAt"]()}
        <code>{m["tools.emailValidator.articleCheckOneAt"]()}</code>
        {m["tools.emailValidator.articleWhatBodyAfterAt"]()}
      </p>
      <h3>{m["tools.emailValidator.articleChecksTitle"]()}</h3>
      <ul>
        <li>
          {m["tools.emailValidator.articleCheckOneBeforeAt"]()}
          <code>{m["tools.emailValidator.articleCheckOneAt"]()}</code>
          {m["tools.emailValidator.articleCheckOneAfterAt"]()}
        </li>
        <li>{m["tools.emailValidator.articleCheckTwo"]()}</li>
        <li>{m["tools.emailValidator.articleCheckThree"]()}</li>
        <li>{m["tools.emailValidator.articleCheckFour"]()}</li>
      </ul>
      <h3>{m["tools.emailValidator.article.examplesTitle"]()}</h3>
      <ul>
        <li>
          {m["tools.emailValidator.articleValidLabel"]()}
          <code>{m["tools.emailValidator.articleValidExampleOne"]()}</code>
        </li>
        <li>
          {m["tools.emailValidator.articleValidLabel"]()}
          <code>{m["tools.emailValidator.articleValidExampleTwo"]()}</code>
        </li>
        <li>
          {m["tools.emailValidator.articleInvalidLabel"]()}
          <code>{m["tools.emailValidator.articleInvalidExampleOne"]()}</code>
        </li>
        <li>
          {m["tools.emailValidator.articleInvalidLabel"]()}
          <code>{m["tools.emailValidator.articleInvalidExampleTwo"]()}</code>
        </li>
      </ul>
      <p>
        {m["tools.emailValidator.articleInternationalBeforeCode"]()}
        <code>{m["tools.emailValidator.articleInternationalCode"]()}</code>
        {m["tools.dnsLookup.article.howAfterUrl"]()}
      </p>
      <h3>{m["tools.emailValidator.articleNotTitle"]()}</h3>
      <ul>
        <li>{m["tools.emailValidator.articleNotOne"]()}</li>
        <li>{m["tools.emailValidator.articleNotTwo"]()}</li>
        <li>{m["tools.emailValidator.articleNotThree"]()}</li>
      </ul>
    </ToolArticle>
  );
}

function EmailValidatorContent() {
  const tooLarge = m["tools.emailValidator.localTooLarge"]();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Validation | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!value) return;
    const timeout = window.setTimeout(() => {
      try {
        setResult(validateEmail(value));
      } catch {
        setError(tooLarge);
      }
    }, VALIDATION_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [tooLarge, value]);

  function updateValue(next: string) {
    setValue(next);
    setResult(null);
    setError("");
  }

  const feedback = result ? feedbackMessage(result) : null;

  return (
    <div className="grid gap-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.emailValidator.email"]()}</Card.Title>
            <Card.Description>
              {m["tools.emailValidator.description"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <InputGroup variant="primary" fullWidth>
              <InputGroup.Prefix>
                <AtSign aria-hidden className="size-4 text-muted" />
              </InputGroup.Prefix>
              <InputGroup.Input
                aria-label={m["tools.emailValidator.email"]()}
                type="email"
                name="email"
                dir="ltr"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                value={value}
                aria-invalid={result ? !result.valid : undefined}
                placeholder={m["tools.emailValidator.articleValidExampleOne"]()}
                className="font-mono text-base"
                onChange={(event) => updateValue(event.currentTarget.value)}
              />
              {value ? (
                <InputGroup.Suffix>
                  <CloseButton
                    aria-label={m["tools.emailValidator.localClearLabel"]()}
                    onPress={() => updateValue("")}
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
                    {m["tools.emailValidator.invalid"]()}
                  </Alert.Title>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : result && feedback ? (
              <div aria-live="polite">
                <Alert
                  status={result.valid ? "success" : "danger"}
                  role={result.valid ? "status" : "alert"}
                >
                  <Alert.Indicator>
                    {result.valid ? (
                      <BadgeCheck aria-hidden className="size-4" />
                    ) : (
                      <TriangleAlert aria-hidden className="size-4" />
                    )}
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Title>
                      {result.valid
                        ? m["tools.emailValidator.valid"]()
                        : m["tools.emailValidator.invalid"]()}
                    </Alert.Title>
                    <Alert.Description>{feedback}</Alert.Description>
                  </Alert.Content>
                </Alert>
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <Results result={result} feedback={feedback} />
      </div>

      <EmailArticle />
    </div>
  );
}

export default function EmailValidator() {
  return (
    <ToolPage>
      <EmailValidatorContent />
    </ToolPage>
  );
}
