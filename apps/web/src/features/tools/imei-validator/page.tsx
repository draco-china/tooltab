import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Chip, InputGroup } from "@heroui/react";
import { BadgeCheck, Binary, TriangleAlert } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/base/empty";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { validateImei } from "@workspace/tools/validation/imei";

function ImeiValidatorPageContent() {
  const [imei, setImei] = useState("");
  const analysis = useMemo(() => (imei ? validateImei(imei) : null), [imei]);
  const feedback = analysis
    ? analysis.isValid
      ? m["tools.imeiValidator.valid"]()
      : analysis.reason === "invalid-format"
        ? m["tools.imeiValidator.invalidFormat"]()
        : analysis.reason === "invalid-length"
          ? m["tools.imeiValidator.invalidLength"]()
          : m["tools.imeiValidator.invalidChecksum"]()
    : null;

  return (
    <div className="grid min-w-0 gap-8">
      <div
        className="grid min-w-0 gap-6"
        data-tool-layout="stacked"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.imeiValidator.imei"]()}</Card.Title>
            <Card.Description>
              {m["tools.imeiValidator.inputDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <InputGroup
              variant="secondary"
              fullWidth
              isInvalid={analysis ? !analysis.isValid : false}
            >
              <InputGroup.Prefix>
                <Binary aria-hidden className="size-4 text-muted" />
              </InputGroup.Prefix>
              <InputGroup.Input
                aria-label={m["tools.imeiValidator.imei"]()}
                name="imei"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                inputMode="numeric"
                maxLength={32}
                value={imei}
                placeholder={m["tools.imeiValidator.placeholder"]()}
                aria-invalid={analysis ? !analysis.isValid : undefined}
                className="font-mono text-base"
                onChange={(event) => setImei(event.currentTarget.value)}
              />
            </InputGroup>

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
                      ? m["tools.imeiValidator.valid"]()
                      : m["tools.imeiValidator.invalid"]()}
                  </Alert.Title>
                  <Alert.Description>{feedback}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.bicSwiftValidator.result"]()}</Card.Title>
            <Card.Description>
              {feedback ?? m["tools.imeiValidator.resultDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent aria-live="polite" className="gap-4 py-4">
            {analysis ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <Detail label={m["tools.audioRecorder.status"]()}>
                  <Chip
                    size="sm"
                    color={analysis.isValid ? "success" : "danger"}
                    variant="soft"
                  >
                    {analysis.isValid
                      ? m["tools.imeiValidator.valid"]()
                      : m["tools.imeiValidator.invalid"]()}
                  </Chip>
                </Detail>
                <Detail label={m["tools.imeiValidator.reason"]()}>
                  <span className="font-medium">{feedback}</span>
                </Detail>
                <Detail label={m["tools.imeiValidator.normalized"]()}>
                  <span className="font-mono text-sm break-all">
                    {analysis.normalized || "—"}
                  </span>
                </Detail>
                <Detail label={m["tools.imeiValidator.expectedCheckDigit"]()}>
                  <span className="font-medium">
                    {analysis.expectedCheckDigit ?? "—"}
                  </span>
                </Detail>
                <Detail label={m["tools.imeiValidator.actualCheckDigit"]()}>
                  <span className="font-medium">
                    {analysis.actualCheckDigit ?? "—"}
                  </span>
                </Detail>
              </dl>
            ) : (
              <Empty className="min-h-64 border-0 p-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Binary aria-hidden className="size-5" />
                  </EmptyMedia>
                  <EmptyDescription>
                    {m["tools.imeiValidator.emptyDescription"]()}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.imeiValidator.articleWhatTitle"]()}</h2>
        <p>{m["tools.imeiValidator.articleWhatBody"]()}</p>
        <h3>{m["tools.imeiValidator.articleChecksTitle"]()}</h3>
        <ul>
          <li>{m["tools.imeiValidator.articleLength"]()}</li>
          <li>{m["tools.imeiValidator.articleFormat"]()}</li>
          <li>{m["tools.imeiValidator.articleChecksum"]()}</li>
        </ul>
        <blockquote>{m["tools.imeiValidator.articleNotice"]()}</blockquote>
      </ToolArticle>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-default/30 p-4">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-6">{children}</dd>
    </div>
  );
}

export function ImeiValidatorPage() {
  return (
    <ToolPage instructions={m["tools.imeiValidator.usage"]()}>
      <ImeiValidatorPageContent />
    </ToolPage>
  );
}

export default ImeiValidatorPage;
