import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Chip, InputGroup } from "@heroui/react";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  type ChecksumResult,
  validateIsbn,
} from "@workspace/tools/validation/isbn";

const DEFAULT_ISBN = "978-0-306-40615-7";
const STORAGE_KEY = "tools:isbn-validator:isbn";

function IsbnValidatorContent() {
  const [isbn, setIsbn] = useState(DEFAULT_ISBN);
  useEffect(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEY);
    if (stored) setIsbn(stored);
  }, []);
  useEffect(() => safeLocalStorage.setItem(STORAGE_KEY, isbn), [isbn]);
  const result = useMemo(() => {
    try {
      return validateIsbn(isbn);
    } catch {
      return null;
    }
  }, [isbn]);
  const hasInput = isbn.length > 0;
  const feedback = hasInput ? feedbackMessage(result) : null;

  return (
    <div className="grid gap-8">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <PanelHeader
            title={m["tools.isbnValidator.isbn"]()}
            description={m["tools.isbnValidator.clientInputDescription"]()}
          />
          <ToolPanelCardContent className="gap-4 py-4">
            <InputGroup variant="primary" fullWidth className="min-h-11">
              <InputGroup.Input
                aria-label={m["tools.isbnValidator.isbn"]()}
                name="isbn"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={isbn}
                aria-invalid={hasInput && !result?.valid ? true : undefined}
                placeholder={m["tools.isbnValidator.placeholder"]()}
                className="font-mono text-base"
                onChange={(event) => setIsbn(event.currentTarget.value)}
              />
            </InputGroup>

            {feedback ? (
              <div aria-live="polite">
                <Alert
                  status={result?.valid ? "success" : "danger"}
                  role={result?.valid ? "status" : "alert"}
                >
                  <Alert.Indicator>
                    {result?.valid ? (
                      <BadgeCheck aria-hidden className="size-4" />
                    ) : (
                      <TriangleAlert aria-hidden className="size-4" />
                    )}
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Title>
                      {result?.valid
                        ? m["tools.isbnValidator.valid"]()
                        : m["tools.isbnValidator.invalid"]()}
                    </Alert.Title>
                    <Alert.Description>{feedback}</Alert.Description>
                  </Alert.Content>
                </Alert>
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        {hasInput ? <ResultsCard result={result} /> : null}
      </div>
      <IsbnArticle />
    </div>
  );
}

function feedbackMessage(result: ChecksumResult | null) {
  if (result?.valid) return m["tools.isbnValidator.valid"]();
  if (!result) return m["tools.isbnValidator.invalidFormat"]();
  if (!result.checks.length) return m["tools.isbnValidator.invalidLength"]();
  if (!result.checks.format) return m["tools.isbnValidator.invalidFormat"]();
  if (!result.checks.checksum)
    return m["tools.ibanValidator.invalidChecksum"]();
  return m["tools.isbnValidator.invalid"]();
}

function ResultsCard({ result }: { result: ChecksumResult | null }) {
  const type = result?.details.type;
  const typeLabel =
    type === "ISBN-10"
      ? m["tools.isbnValidator.isbn10"]()
      : type === "ISBN-13"
        ? m["shared.checksumValidators.isbn13"]()
        : m["common.identityUnknown"]();
  const checksumPasses = result?.checks.checksum === true;
  const normalized = result?.normalized ?? "";
  const isbn10 = stringDetail(result, "isbn10");
  const isbn13 = stringDetail(result, "isbn13");
  const prefix = stringDetail(result, "prefix");
  const isbn10Display = !result?.valid
    ? m["tools.bicSwiftValidator.notAvailable"]()
    : type === "ISBN-13" && prefix !== "978"
      ? m["shared.ipv6ToMac.notConvertible"]()
      : (isbn10 ?? m["tools.bicSwiftValidator.notAvailable"]());
  const isbn13Display = result?.valid
    ? (isbn13 ?? m["tools.bicSwiftValidator.notAvailable"]())
    : m["tools.bicSwiftValidator.notAvailable"]();
  const description = `${typeLabel} / ${m["common.identifierchecksum"]()}: ${
    checksumPasses
      ? m["common.identifierpass"]()
      : m["tools.creditCardValidator.fail"]()
  }`;

  return (
    <ToolPanelCard>
      <PanelHeader
        title={m["tools.bicSwiftValidator.result"]()}
        description={description}
      />
      <ToolPanelCardContent className="py-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailItem
            label={m["tools.isbnValidator.type"]()}
            content={<span className="font-medium">{typeLabel}</span>}
          />
          <DetailItem
            label={m["common.identifierchecksum"]()}
            content={
              <Chip size="sm" color={checksumPasses ? "success" : "danger"}>
                {checksumPasses
                  ? m["common.identifierpass"]()
                  : m["tools.creditCardValidator.fail"]()}
              </Chip>
            }
          />
          <DetailItem
            label={m["tools.isbnValidator.normalized"]()}
            content={
              <ValueWithCopy value={normalized || "-"} copyValue={normalized} />
            }
          />
          <DetailItem
            label={m["tools.isbnValidator.checkDigit"]()}
            content={
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  {m["tools.ibanValidator.expected"]()}:{" "}
                  {stringDetail(result, "expected") ?? "-"}
                </span>
                <span>
                  {m["tools.ibanValidator.actual"]()}:{" "}
                  {stringDetail(result, "actual") ?? "-"}
                </span>
              </div>
            }
          />
          <DetailItem
            label={m["tools.isbnValidator.isbn10"]()}
            content={
              <ValueWithCopy value={isbn10Display} copyValue={isbn10 ?? ""} />
            }
          />
          <DetailItem
            label={m["shared.checksumValidators.isbn13"]()}
            content={
              <ValueWithCopy value={isbn13Display} copyValue={isbn13 ?? ""} />
            }
          />
          <DetailItem
            label={m["tools.isbnValidator.prefix"]()}
            content={type === "ISBN-13" ? (prefix ?? "-") : "-"}
          />
          <DetailItem
            label={m["tools.creditCardValidator.digits"]()}
            content={<span className="font-medium">{normalized.length}</span>}
          />
        </dl>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function stringDetail(
  result: ChecksumResult | null,
  key: keyof ChecksumResult["details"],
) {
  const value = result?.details[key];
  return typeof value === "string" ? value : null;
}

function DetailItem({ content, label }: { content: ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-default/20 p-4">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-6">{content}</dd>
    </div>
  );
}

function ValueWithCopy({
  copyValue,
  value,
}: {
  copyValue: string;
  value: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm break-all">{value}</span>
      {copyValue ? (
        <ToolCopyButton
          key={copyValue}
          value={copyValue}
          copyLabel={m["common.actions.copy"]()}
          copiedLabel={m["common.actions.copied"]()}
          variant="ghost"
        />
      ) : null}
    </div>
  );
}

function PanelHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
  );
}

function IsbnArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.isbnValidator.article.whatTitle"]()}</h2>
      <p>{m["tools.isbnValidator.article.what"]()}</p>
      <ul>
        <li>
          <code>ISBN-10</code>:{" "}
          <code>{m["tools.isbnValidator.article.isbn10Example"]()}</code>
        </li>
        <li>
          <code>ISBN-13</code>:{" "}
          <code>{m["tools.isbnValidator.article.isbn13Example"]()}</code>
        </li>
        <li>
          <code>{m["tools.isbnValidator.article.xExample"]()}</code>
        </li>
      </ul>
      <h3>{m["tools.isbnValidator.article.isbn10Title"]()}</h3>
      <p>{m["tools.isbnValidator.article.isbn10"]()}</p>
      <ol>
        {[
          m["tools.isbnValidator.article.isbn10Steps0"](),
          m["tools.isbnValidator.article.isbn10Steps1"](),
          m["tools.isbnValidator.article.isbn10Steps2"](),
        ].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p>
        <code>{m["tools.isbnValidator.article.isbn10Formula"]()}</code>
      </p>
      <p>
        <code>{m["tools.isbnValidator.article.isbn10Sample"]()}</code>
      </p>
      <h3>{m["tools.isbnValidator.article.isbn13Title"]()}</h3>
      <p>{m["tools.isbnValidator.article.isbn13"]()}</p>
      <ol>
        {[
          m["tools.isbnValidator.article.isbn13Steps0"](),
          m["tools.isbnValidator.article.isbn13Steps1"](),
          m["tools.isbnValidator.article.isbn13Steps2"](),
        ].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p>
        <code>{m["tools.isbnValidator.article.isbn13Formula"]()}</code>
      </p>
      <p>
        <code>{m["tools.isbnValidator.article.isbn13Example"]()}</code>
      </p>
      <p>{m["tools.isbnValidator.article.conversion"]()}</p>
      <p>
        <code>{m["tools.isbnValidator.article.conversionExample"]()}</code>
      </p>
    </ToolArticle>
  );
}

export default function IsbnValidator() {
  return (
    <ToolPage instructions={m["tools.isbnValidator.usage"]()}>
      <IsbnValidatorContent />
    </ToolPage>
  );
}
