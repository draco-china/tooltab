import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, InputGroup } from "@heroui/react";
import { Network, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { normalizeIpCidr } from "@workspace/tools/network/cidr";

type Result =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "success"; normalized: string };

function IpCidrNormalizerPageContent() {
  const inputId = useId();
  const [value, setValue] = useState("");
  const result = useMemo<Result>(() => {
    if (!value.trim()) return { status: "empty" };
    try {
      return { status: "success", normalized: normalizeIpCidr(value) };
    } catch {
      return { status: "invalid" };
    }
  }, [value]);

  return (
    <div className="grid min-w-0 gap-8">
      <div
        className="grid min-w-0 gap-6"
        data-tool-layout="stacked"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.ipCidrNormalizer.inputTitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.ipCidrNormalizer.inputDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor={inputId} className="text-sm font-medium">
                {m["tools.ipCidrNormalizer.label"]()}
              </label>
              <InputGroup variant="secondary" fullWidth>
                <InputGroup.Prefix>
                  <Network aria-hidden className="size-4 text-muted" />
                </InputGroup.Prefix>
                <InputGroup.Input
                  id={inputId}
                  name="ip-cidr"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  value={value}
                  aria-invalid={result.status === "invalid" || undefined}
                  placeholder={m["tools.ipCidrNormalizer.placeholder"]()}
                  className="font-mono text-base"
                  onChange={(event) => setValue(event.currentTarget.value)}
                />
              </InputGroup>
            </div>

            {result.status === "invalid" ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.ipCidrNormalizer.invalidInput"]()}
                  </Alert.Title>
                  <Alert.Description>
                    {m["tools.ipCidrNormalizer.invalidInputDescription"]()}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard
          role="region"
          aria-label={m["tools.ipCidrNormalizer.resultTitle"]()}
        >
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.ipCidrNormalizer.resultTitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.ipCidrNormalizer.resultDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <div
              aria-live="polite"
              className="rounded-xl border border-border bg-default/30 p-4"
            >
              <div className="flex min-h-20 min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted">
                    {m["tools.ipCidrNormalizer.resultTitle"]()}
                  </p>
                  <p className="mt-2 font-mono text-lg font-medium break-all">
                    {result.status === "success" ? result.normalized : "—"}
                  </p>
                </div>
                <ToolCopyButton
                  value={result.status === "success" ? result.normalized : ""}
                  copyLabel={m["common.actions.copy"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  disabled={result.status !== "success"}
                />
              </div>
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.ipCidrNormalizer.article.whatTitle"]()}</h2>
        <p>{m["tools.ipCidrNormalizer.article.what"]()}</p>
        <h2>{m["tools.ipCidrNormalizer.article.howTitle"]()}</h2>
        <p>
          {m["tools.ipCidrNormalizer.article.howBeforeIpv4"]()}
          <code>192.168.0.15/24</code>
          {m["tools.ipCidrNormalizer.article.howBetween"]()}
          <code>192.168.0.0/24</code>
          {m["tools.ipCidrNormalizer.article.howBetweenExamples"]()}
          <code>2001:db8::1234/64</code>
          {m["tools.ipCidrNormalizer.article.howBetween"]()}
          <code>2001:db8::/64</code>
          {m["tools.dnsLookup.article.howAfterUrl"]()}
        </p>
        <h2>{m["tools.ipCidrNormalizer.article.usefulTitle"]()}</h2>
        <p>{m["tools.ipCidrNormalizer.article.useful"]()}</p>
        <h2>{m["tools.ipCidrNormalizer.article.rejectedTitle"]()}</h2>
        <p>{m["tools.ipCidrNormalizer.article.rejected"]()}</p>
      </ToolArticle>
    </div>
  );
}

export function IpCidrNormalizerPage() {
  return (
    <ToolPage instructions={m["tools.ipCidrNormalizer.usage"]()}>
      <IpCidrNormalizerPageContent />
    </ToolPage>
  );
}
