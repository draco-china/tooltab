import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Chip, CloseButton, InputGroup } from "@heroui/react";
import { BadgeCheck, ReceiptText, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import { getLocale } from "@/paraglide/runtime.js";
import { vat } from "@workspace/tools/validation/vat";

const DEFAULT_VAT = "BE 0123.4567.49";
const STORAGE_KEY = "tools:eu-vat-number-validator:input";
const VALIDATION_DELAY_MS = 200;

const formatHints: Record<string, () => string> = {
  AT: () => m["tools.euVatNumberValidator.hint.at"](),
  BE: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 10 }),
  BG: () =>
    m["tools.euVatNumberValidator.hint.either"]({ first: 9, second: 10 }),
  CY: () => m["tools.euVatNumberValidator.hint.cy"](),
  CZ: () => m["tools.euVatNumberValidator.hint.range"]({ min: 8, max: 10 }),
  DE: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 9 }),
  DK: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 8 }),
  EE: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 9 }),
  EL: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 9 }),
  ES: () => m["tools.euVatNumberValidator.hint.es"](),
  FI: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 8 }),
  FR: () => m["tools.euVatNumberValidator.hint.fr"](),
  HR: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 11 }),
  HU: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 8 }),
  IE: () => m["tools.euVatNumberValidator.hint.ie"](),
  IT: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 11 }),
  LT: () =>
    m["tools.euVatNumberValidator.hint.either"]({ first: 9, second: 12 }),
  LU: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 8 }),
  LV: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 11 }),
  MT: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 8 }),
  NL: () => m["tools.euVatNumberValidator.hint.nl"](),
  PL: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 10 }),
  PT: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 9 }),
  RO: () => m["tools.euVatNumberValidator.hint.range"]({ min: 2, max: 10 }),
  SE: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 12 }),
  SI: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 8 }),
  SK: () => m["tools.euVatNumberValidator.hint.digits"]({ count: 10 }),
};

type Result = ReturnType<typeof vat>;

function getFeedback(result: Result) {
  if (result.valid) return m["tools.euVatNumberValidator.valid"]();
  if (!result.checks.countryCode)
    return m["tools.euVatNumberValidator.invalidCountryCode"]();
  if (!result.checks.supported)
    return m["tools.euVatNumberValidator.unsupportedCountry"]();
  if (!result.checks.format)
    return m["tools.euVatNumberValidator.invalidFormat"]();
  if (result.checks.checksum === false)
    return m["tools.euVatNumberValidator.invalidChecksum"]();
  return m["tools.euVatNumberValidator.invalid"]();
}

function countryDisplay(country: string, locale: string) {
  if (!country) return m["tools.bicSwiftValidator.notAvailable"]();
  if (!/^[A-Z]{2}$/.test(country)) return country;
  try {
    const name = new Intl.DisplayNames([locale, "en"], {
      type: "region",
    }).of(country === "EL" ? "GR" : country);
    return name ? `${name} (${country})` : country;
  } catch {
    return country;
  }
}

function DetailTile({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-default/20 p-4">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-2 min-w-0 text-sm leading-6 break-all">{children}</dd>
    </div>
  );
}

function CheckChip({
  value,
  unavailable = false,
}: {
  value: boolean | null | undefined;
  unavailable?: boolean;
}) {
  if (unavailable || value === null || value === undefined) {
    return (
      <Chip size="sm" variant="tertiary">
        {m["common.identityUnchecked"]()}
      </Chip>
    );
  }
  return (
    <Chip size="sm" color={value ? "success" : "danger"}>
      {value
        ? m["common.identifierpass"]()
        : m["tools.creditCardValidator.fail"]()}
    </Chip>
  );
}

function VatArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.euVatNumberValidator.articleWhatTitle"]()}</h2>
      <p>{m["tools.euVatNumberValidator.articleWhatBody"]()}</p>
      <h3>{m["tools.euVatNumberValidator.articleChecksTitle"]()}</h3>
      <p>{m["tools.euVatNumberValidator.articleChecksIntro"]()}</p>
      <ul>
        {[
          m["tools.euVatNumberValidator.articleChecks0"](),
          m["tools.euVatNumberValidator.articleChecks1"](),
          m["tools.euVatNumberValidator.articleChecks2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>{m["tools.euVatNumberValidator.articleChecksBody"]()}</p>
      <h3>{m["tools.euVatNumberValidator.articleCommonTitle"]()}</h3>
      <ul>
        {[
          m["tools.euVatNumberValidator.articleCommon0"](),
          m["tools.euVatNumberValidator.articleCommon1"](),
          m["tools.euVatNumberValidator.articleCommon2"](),
          m["tools.euVatNumberValidator.articleCommon3"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>{m["tools.euVatNumberValidator.articleResultTitle"]()}</h3>
      <p>{m["tools.euVatNumberValidator.articleResultBody"]()}</p>
      <h3>{m["tools.euVatNumberValidator.articlePrivacyTitle"]()}</h3>
      <p>{m["tools.euVatNumberValidator.articlePrivacyBody"]()}</p>
    </ToolArticle>
  );
}

function VatValidatorContent() {
  const locale = getLocale();
  const [input, setInput] = useState(DEFAULT_VAT);
  const [result, setResult] = useState<Result>(() => vat(DEFAULT_VAT));
  const [isReady, setIsReady] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEY);
    if (stored !== null) setInput(stored);
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEY, input);
    if (!input) {
      setResult(vat(""));
      setIsReady(false);
      setError("");
      return;
    }
    const timeout = window.setTimeout(() => {
      try {
        setResult(vat(input));
        setIsReady(true);
        setError("");
      } catch {
        setIsReady(false);
        setError(m["tools.euVatNumberValidator.invalid"]({}, { locale }));
      }
    }, VALIDATION_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [locale, input]);

  const hasInput = input.length > 0;
  const showResult = hasInput && isReady && !error;
  const feedback = showResult ? getFeedback(result) : null;
  const country = String(result.details.country ?? "");
  const number = String(result.details.number ?? "");
  const format =
    formatHints[country]?.() ?? m["tools.bicSwiftValidator.notAvailable"]();
  const countryName = useMemo(
    () => countryDisplay(country, locale),
    [locale, country],
  );

  return (
    <div className="grid gap-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.euVatNumberValidator.vat"]()}</Card.Title>
            <Card.Description>
              {m["tools.euVatNumberValidator.description"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <InputGroup variant="primary" fullWidth>
              <InputGroup.Prefix>
                <ReceiptText aria-hidden className="size-4 text-muted" />
              </InputGroup.Prefix>
              <InputGroup.Input
                aria-label={m["tools.euVatNumberValidator.vat"]()}
                name="vat"
                dir="ltr"
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                value={input}
                aria-invalid={showResult ? !result.valid : undefined}
                placeholder={m["tools.euVatNumberValidator.placeholder"]()}
                className="font-mono text-base"
                onChange={(event) => {
                  setIsReady(false);
                  setInput(event.currentTarget.value);
                }}
              />
              {input ? (
                <InputGroup.Suffix>
                  <CloseButton
                    aria-label={m["tools.euVatNumberValidator.clear"]()}
                    onPress={() => {
                      setIsReady(false);
                      setInput("");
                    }}
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
                    {m["tools.euVatNumberValidator.invalid"]()}
                  </Alert.Title>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : feedback ? (
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
                        ? m["tools.euVatNumberValidator.valid"]()
                        : m["tools.euVatNumberValidator.invalid"]()}
                    </Alert.Title>
                    <Alert.Description>{feedback}</Alert.Description>
                  </Alert.Content>
                </Alert>
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.bicSwiftValidator.result"]()}</Card.Title>
            <Card.Description>
              {showResult
                ? `${countryName} — ${result.checks.supported ? m["tools.deviceInformation.supported"]() : m["tools.deviceInformation.unsupported"]()}`
                : m["tools.euVatNumberValidator.description"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            {showResult ? (
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <DetailTile label={m["tools.audioRecorder.status"]()}>
                  <CheckChip value={result.valid} />
                </DetailTile>
                <DetailTile label={m["common.identityCountry"]()}>
                  <span className="font-medium">{countryName}</span>
                </DetailTile>
                <DetailTile
                  label={m["tools.bicSwiftValidator.countryStatus"]()}
                >
                  <Chip
                    size="sm"
                    color={result.checks.supported ? "success" : "danger"}
                  >
                    {result.checks.supported
                      ? m["tools.deviceInformation.supported"]()
                      : m["tools.deviceInformation.unsupported"]()}
                  </Chip>
                </DetailTile>
                <DetailTile label={m["tools.euVatNumberValidator.format"]()}>
                  <span className="font-mono">{format}</span>
                </DetailTile>
                <DetailTile
                  label={m["tools.euVatNumberValidator.formatStatus"]()}
                >
                  <CheckChip
                    value={result.checks.format}
                    unavailable={!result.checks.supported}
                  />
                </DetailTile>
                <DetailTile label={m["tools.euVatNumberValidator.checksum"]()}>
                  <CheckChip
                    value={result.checks.checksum}
                    unavailable={!result.checks.format}
                  />
                </DetailTile>
                <DetailTile
                  label={m["tools.euVatNumberValidator.normalized"]()}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 font-mono">
                      {result.normalized ||
                        m["tools.bicSwiftValidator.notAvailable"]()}
                    </span>
                    <ToolCopyButton
                      value={result.normalized}
                      copyLabel={m["common.actions.copy"]()}
                      copiedLabel={m["common.actions.copied"]()}
                      size="icon-sm"
                    />
                  </div>
                </DetailTile>
                <DetailTile label={m["tools.euVatNumberValidator.number"]()}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 font-mono">
                      {number || m["tools.bicSwiftValidator.notAvailable"]()}
                    </span>
                    <ToolCopyButton
                      value={number}
                      copyLabel={m["common.actions.copy"]()}
                      copiedLabel={m["common.actions.copied"]()}
                      size="icon-sm"
                    />
                  </div>
                </DetailTile>
              </dl>
            ) : (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 text-center">
                <div className="rounded-full bg-default p-3">
                  <ReceiptText aria-hidden className="size-5" />
                </div>
                <p className="max-w-md text-sm text-muted">
                  {m["tools.euVatNumberValidator.description"]()}
                </p>
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <VatArticle />
    </div>
  );
}

export default function VatValidator() {
  return (
    <ToolPage>
      <VatValidatorContent />
    </ToolPage>
  );
}
