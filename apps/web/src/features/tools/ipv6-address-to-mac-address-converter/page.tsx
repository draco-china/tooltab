import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, InputGroup } from "@heroui/react";
import { Network, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { AddressError, ipv6ToMac } from "@workspace/tools/network/address";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";

const DEFAULT_IPV6 = "fe80::a8bb:ccff:fedd:eeff";
const STORAGE_KEY = "tools:ipv6-address-to-mac-address-converter:ipv6";
const LEGACY_STORAGE_KEY = "tools:ipv6-to-mac:ipv6";

type Result =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "not-convertible" }
  | { status: "success"; mac: string };

function Ipv6ToMacPageContent() {
  const inputId = useId();
  const [ipv6, setIpv6] = useState(DEFAULT_IPV6);
  useEffect(() => {
    const stored =
      safeLocalStorage.getItem(STORAGE_KEY) ??
      safeLocalStorage.getItem(LEGACY_STORAGE_KEY);
    if (stored !== null) setIpv6(stored);
  }, []);
  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEY, ipv6);
  }, [ipv6]);
  const result = useMemo<Result>(() => {
    if (!ipv6.trim()) return { status: "empty" };
    try {
      const converted = ipv6ToMac(ipv6);
      return converted.convertible && converted.mac
        ? { status: "success", mac: converted.mac }
        : { status: "not-convertible" };
    } catch (error) {
      if (error instanceof AddressError) return { status: "invalid" };
      return { status: "invalid" };
    }
  }, [ipv6]);
  const displayValue =
    result.status === "success"
      ? result.mac
      : result.status === "not-convertible"
        ? m["shared.ipv6ToMac.notConvertible"]()
        : result.status === "invalid"
          ? m["shared.ipv6ToMac.invalidAddress"]()
          : "";

  return (
    <div className="grid min-w-0 gap-8">
      <div
        className="grid min-w-0 gap-6"
        data-tool-layout="stacked"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.ipv6AddressToMacAddressConverter.inputTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.ipv6AddressToMacAddressConverter.inputDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor={inputId} className="text-sm font-medium">
                {m["shared.cidrTools.cidrParserIpv6Label"]()}
              </label>
              <InputGroup variant="secondary" fullWidth>
                <InputGroup.Prefix>
                  <Network aria-hidden className="size-4 text-muted" />
                </InputGroup.Prefix>
                <InputGroup.Input
                  id={inputId}
                  name="ipv6"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  value={ipv6}
                  aria-invalid={result.status === "invalid" || undefined}
                  placeholder={m["shared.ipv6ToMac.placeholder"]()}
                  className="font-mono text-base"
                  onChange={(event) => setIpv6(event.currentTarget.value)}
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
                    {m["shared.ipv6ToMac.invalidAddress"]()}
                  </Alert.Title>
                  <Alert.Description>
                    {m["shared.ipv6ToMac.invalidAddress"]()}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.ipv6AddressToMacAddressConverter.resultTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.ipv6AddressToMacAddressConverter.resultDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <div className="rounded-xl border border-border bg-default/30 p-4">
              <div className="flex min-h-20 min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1" aria-live="polite">
                  <p className="text-sm text-muted">
                    {m["tools.ipv6AddressToMacAddressConverter.macLabel"]()}
                  </p>
                  <p className="mt-2 font-mono text-lg font-medium break-all">
                    {displayValue || "—"}
                  </p>
                </div>
                <ToolCopyButton
                  value={result.status === "success" ? result.mac : ""}
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
        <h2>{m["shared.ipv6ToMac.article.howTitle"]()}</h2>
        <p>{m["shared.ipv6ToMac.article.how"]()}</p>
        <h3>{m["shared.ipv6ToMac.article.worksTitle"]()}</h3>
        <p>{m["shared.ipv6ToMac.article.works"]()}</p>
        <ul>
          <li>{m["shared.ipv6ToMac.article.worksOne"]()}</li>
          <li>{m["shared.ipv6ToMac.article.worksTwo"]()}</li>
          <li>{m["shared.ipv6ToMac.article.worksThree"]()}</li>
        </ul>
        <h3>{m["shared.ipv6ToMac.article.conversionTitle"]()}</h3>
        <p>{m["shared.ipv6ToMac.article.conversion"]()}</p>
        <ol>
          <li>{m["shared.ipv6ToMac.article.stepOne"]()}</li>
          <li>{m["shared.ipv6ToMac.article.stepTwo"]()}</li>
          <li>{m["shared.ipv6ToMac.article.stepThree"]()}</li>
          <li>{m["shared.ipv6ToMac.article.stepFour"]()}</li>
        </ol>
        <h3>{m["shared.ipv6ToMac.article.whyTitle"]()}</h3>
        <p>{m["shared.ipv6ToMac.article.why"]()}</p>
        <ul>
          <li>{m["shared.ipv6ToMac.article.whyOne"]()}</li>
          <li>{m["shared.ipv6ToMac.article.whyTwo"]()}</li>
          <li>{m["shared.ipv6ToMac.article.whyThree"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

export function Ipv6ToMacPage() {
  return (
    <ToolPage
      instructions={m["tools.ipv6AddressToMacAddressConverter.usage"]()}
    >
      <Ipv6ToMacPageContent />
    </ToolPage>
  );
}
