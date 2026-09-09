import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, InputGroup } from "@heroui/react";
import { Hash, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  derivePrefixes,
  generateGlobalId,
  parseSubnetId,
} from "@workspace/tools/network/ipv6";

function IPv6UlaGeneratorContent() {
  const inputId = useId();
  const [globalId, setGlobalId] = useState<string | null>(null);
  const [subnet, setSubnet] = useState("0000");
  const [failed, setFailed] = useState(false);

  const generate = useCallback(() => {
    try {
      setGlobalId(generateGlobalId());
      setFailed(false);
    } catch {
      setGlobalId(null);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    generate();
  }, [generate]);

  const subnetId = parseSubnetId(subnet);
  const result = useMemo(
    () => (globalId ? derivePrefixes(globalId, subnetId ?? 0) : null),
    [globalId, subnetId],
  );

  return (
    <div className="grid gap-8">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="gap-4 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
            <div className="grid gap-1">
              <Card.Title>{m["tools.ipv6UlaGenerator.name"]()}</Card.Title>
              <Card.Description>
                {m["tools.ipv6UlaGenerator.record"]()}
              </Card.Description>
            </div>
            <Button type="button" size="sm" onPress={generate}>
              <RefreshCw aria-hidden className="size-4" />
              {m["tools.ipv6UlaGenerator.generate"]()}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <div className="grid gap-2">
              <label htmlFor={inputId} className="text-sm font-medium">
                {m["tools.ipv6UlaGenerator.subnet"]()}
              </label>
              <InputGroup
                variant="secondary"
                fullWidth
                aria-invalid={subnetId === null ? true : undefined}
              >
                <InputGroup.Prefix>
                  <Hash aria-hidden className="size-4 text-muted" />
                </InputGroup.Prefix>
                <InputGroup.Input
                  id={inputId}
                  name="subnet-id"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={4}
                  value={subnet}
                  aria-describedby={`${inputId}-hint${subnetId === null ? ` ${inputId}-error` : ""}`}
                  onChange={(event) => setSubnet(event.currentTarget.value)}
                />
              </InputGroup>
              <p id={`${inputId}-hint`} className="text-sm text-muted">
                {m["tools.ipv6UlaGenerator.subnetHint"]()}
              </p>
            </div>

            {subnetId === null ? (
              <Alert status="danger" role="alert" id={`${inputId}-error`}>
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.ipv6UlaGenerator.subnetError"]()}
                  </Alert.Title>
                </Alert.Content>
              </Alert>
            ) : null}

            {failed ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.ipv6UlaGenerator.cryptoError"]()}
                  </Alert.Title>
                </Alert.Content>
              </Alert>
            ) : null}

            <p className="text-sm leading-6 text-muted">
              {m["tools.ipv6UlaGenerator.facts"]()}
            </p>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.ipv6UlaGenerator.prefix"]()}</Card.Title>
            <Card.Description>
              {m["tools.ipv6UlaGenerator.description"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="divide-y divide-separator py-0">
            <ResultRow
              label={m["tools.ipv6UlaGenerator.prefix"]()}
              value={result?.prefix}
            />
            <ResultRow
              label={m["tools.ipv6UlaGenerator.globalId"]()}
              value={globalId}
            />
            <ResultRow
              label={m["tools.ipv6UlaGenerator.selected"]()}
              value={subnetId === null ? null : result?.selectedSubnet}
            />
            <ResultRow
              label={m["tools.ipv6UlaGenerator.first"]()}
              value={result?.firstSubnet}
            />
            <ResultRow
              label={m["tools.ipv6UlaGenerator.last"]()}
              value={result?.lastSubnet}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <UlaArticle />
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value?: string | null }) {
  const resolved = value ?? "";
  return (
    <div className="flex min-w-0 items-center gap-3 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">{label}</p>
        <output
          aria-label={label}
          dir="ltr"
          className="mt-1 block font-mono text-base font-medium break-all [unicode-bidi:isolate]"
        >
          {resolved || "—"}
        </output>
      </div>
      <ToolCopyButton
        value={resolved}
        copyLabel={m["tools.ipv6UlaGenerator.copy"]({ label })}
        copiedLabel={m["tools.ipv6UlaGenerator.copied"]({ label })}
        errorLabel={m["tools.ipv6UlaGenerator.copyError"]()}
        ariaLabel={label}
        size="icon-sm"
      />
    </div>
  );
}

function UlaArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.ipv6UlaGenerator.aboutHeading"]()}</h2>
      <p>{m["tools.ipv6UlaGenerator.about"]()}</p>
      <h2>{m["tools.ipv6UlaGenerator.layoutHeading"]()}</h2>
      <p>{m["tools.ipv6UlaGenerator.layout"]()}</p>
      <p>{m["tools.ipv6UlaGenerator.format"]()}</p>
      <h2>{m["tools.ipv6UlaGenerator.randomHeading"]()}</h2>
      <p>{m["tools.ipv6UlaGenerator.random"]()}</p>
      <h2>{m["tools.ipv6UlaGenerator.routingHeading"]()}</h2>
      <p>{m["tools.ipv6UlaGenerator.routing"]()}</p>
      <p>
        <a href="https://www.rfc-editor.org/rfc/rfc4193.html">RFC 4193</a>
        {" · "}
        <a href="https://www.rfc-editor.org/rfc/rfc5952.html">RFC 5952</a>
      </p>
    </ToolArticle>
  );
}

export default function IPv6UlaGenerator() {
  return (
    <ToolPage>
      <IPv6UlaGeneratorContent />
    </ToolPage>
  );
}
