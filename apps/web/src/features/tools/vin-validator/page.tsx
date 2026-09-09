import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Chip, Input, TextField } from "@heroui/react";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import {
  type VinValidationResult,
  validateVin,
} from "@workspace/tools/validation/vin";

const STORAGE_KEY = "tools:vin-validator:vin";
const DEFAULT_VIN = "1M8GDM9AXKP042788";

function VinValidatorPageContent() {
  const [vin, setVin] = useState(DEFAULT_VIN);
  useEffect(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEY);
    if (stored) setVin(stored);
  }, []);
  useEffect(() => safeLocalStorage.setItem(STORAGE_KEY, vin), [vin]);
  const validation = useMemo(() => validateVin(vin), [vin]);
  const hasInput = vin.length > 0;
  const feedback = hasInput ? feedbackMessage(validation) : null;
  const description = hasInput
    ? `${m["tools.audioRecorder.status"]()}: ${validation.isValid ? m["tools.vinValidator.valid"]() : m["tools.vinValidator.invalid"]()} / ${m["tools.isbnValidator.checkDigit"]()}: ${validation.isCheckDigitValid ? m["common.identifierpass"]() : m["common.identifierfail"]()}`
    : m["tools.vinValidator.description"]();

  return (
    <div className="grid gap-8">
      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.vinValidator.vin"]()}</Card.Title>
            <Card.Description>
              {m["tools.vinValidator.description"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextField
              aria-label={m["tools.vinValidator.vin"]()}
              isInvalid={hasInput && !validation.isValid}
            >
              <Input
                aria-label={m["tools.vinValidator.vin"]()}
                name="vin"
                autoComplete="off"
                spellCheck={false}
                value={vin}
                placeholder={m["tools.vinValidator.placeholder"]()}
                className="font-mono text-base"
                aria-invalid={hasInput && !validation.isValid}
                onChange={(event) => setVin(event.currentTarget.value)}
              />
            </TextField>
            {feedback ? (
              <Alert
                status={validation.isValid ? "success" : "danger"}
                role={validation.isValid ? "status" : "alert"}
              >
                <Alert.Indicator>
                  {validation.isValid ? (
                    <BadgeCheck className="size-4" />
                  ) : (
                    <TriangleAlert className="size-4" />
                  )}
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {validation.isValid
                      ? m["tools.vinValidator.valid"]()
                      : m["tools.vinValidator.invalid"]()}
                  </Alert.Title>
                  <Alert.Description>{feedback}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
        {hasInput ? (
          <Results validation={validation} description={description} />
        ) : null}
      </div>
      <ToolArticle>
        <h2>{m["tools.vinValidator.articleTitle"]()}</h2>
        <p>{m["tools.vinValidator.articleBody"]()}</p>
        <ul>
          <li>
            <code>1M8GDM9AXKP042788</code>
          </li>
          <li>{m["tools.vinValidator.articleExcluded"]()}</li>
          <li>{m["tools.vinValidator.articleNinth"]()}</li>
        </ul>
        <h3>{m["tools.vinValidator.articleStructure"]()}</h3>
        <ol>
          <li>{m["tools.vinValidator.articleWmi"]()}</li>
          <li>{m["tools.vinValidator.articleVds"]()}</li>
          <li>{m["tools.vinValidator.articleDigit"]()}</li>
          <li>{m["tools.vinValidator.articleVis"]()}</li>
        </ol>
        <h3>{m["shared.checksumValidators.check"]()}</h3>
        <p>{m["tools.vinValidator.articleChecksumBody"]()}</p>
        <p>
          <code>(w1×v1 + w2×v2 + ... + w17×v17) mod 11</code>
        </p>
        <p>{m["tools.vinValidator.articleNotice"]()}</p>
      </ToolArticle>
    </div>
  );
}

function feedbackMessage(result: VinValidationResult) {
  if (result.isValid) return m["tools.vinValidator.validDescription"]();
  if (!result.isLengthValid) return m["tools.vinValidator.invalidLength"]();
  if (!result.isCharacterValid)
    return m["tools.vinValidator.invalidCharacters"]();
  return m["tools.vinValidator.invalidChecksum"]();
}
function Results({
  validation,
  description,
}: {
  validation: VinValidationResult;
  description: string;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.bicSwiftValidator.result"]()}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label={m["tools.audioRecorder.status"]()}>
            <Chip size="sm" color={validation.isValid ? "success" : "danger"}>
              {validation.isValid
                ? m["tools.vinValidator.valid"]()
                : m["tools.vinValidator.invalid"]()}
            </Chip>
          </Detail>
          <Detail label={m["shared.checksumValidators.length"]()}>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {validation.normalized.length} / 17
              </span>
              <Pass value={validation.isLengthValid} />
            </div>
          </Detail>
          <Detail label={m["tools.emailValidator.lengthCheck"]()}>
            <Pass value={validation.isLengthValid} />
          </Detail>
          <Detail label={m["tools.vinValidator.characterCheck"]()}>
            <div className="grid gap-1">
              <Pass value={validation.isCharacterValid} />
              <span className="text-xs text-muted">
                {m["tools.vinValidator.allowedCharacters"]()}
              </span>
            </div>
          </Detail>
          <Detail label={m["tools.isbnValidator.checkDigit"]()}>
            <div className="grid gap-1">
              <Pass
                value={
                  validation.expectedCheckDigit
                    ? validation.isCheckDigitValid
                    : null
                }
              />
              <span className="text-xs">
                {m["tools.vinValidator.expected"]()}:{" "}
                {validation.expectedCheckDigit ??
                  m["tools.bicSwiftValidator.notAvailable"]()}{" "}
                · {m["tools.vinValidator.actual"]()}:{" "}
                {validation.actualCheckDigit ??
                  m["tools.bicSwiftValidator.notAvailable"]()}
              </span>
            </div>
          </Detail>
          <Detail label={m["tools.vinValidator.normalized"]()}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm break-all">
                {validation.normalized || "-"}
              </span>
              {validation.normalized ? (
                <ToolCopyButton
                  key={validation.normalized}
                  value={validation.normalized}
                  copyLabel={m["common.actions.copy"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  variant="ghost"
                />
              ) : null}
            </div>
          </Detail>
        </dl>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-default/20 p-4">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-6">{children}</dd>
    </div>
  );
}
function Pass({ value }: { value: boolean | null }) {
  if (value === null)
    return (
      <Chip size="sm" variant="tertiary">
        {m["tools.bicSwiftValidator.notAvailable"]()}
      </Chip>
    );
  return (
    <Chip size="sm" color={value ? "success" : "danger"}>
      {value ? m["common.identifierpass"]() : m["common.identifierfail"]()}
    </Chip>
  );
}

export default function VinValidatorPage() {
  return (
    <ToolPage instructions={m["tools.vinValidator.usage"]()}>
      <VinValidatorPageContent />
    </ToolPage>
  );
}
