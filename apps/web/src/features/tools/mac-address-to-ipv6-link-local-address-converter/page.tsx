import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Input, Label, TextField } from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { macToIpv6 } from "@workspace/tools/network/address";
import { m } from "@/paraglide/messages.js";

function MacToIpv6LinkLocalPageContent() {
  const macId = useId();
  const interfaceId = useId();
  const [mac, setMac] = useState("aa:bb:cc:dd:ee:ff");
  const [networkInterface, setNetworkInterface] = useState("");
  const result = convert(mac, networkInterface);

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
              {m[
                "tools.macAddressToIpv6LinkLocalAddressConverter.inputTitle"
              ]()}
            </Card.Title>
            <Card.Description>
              {m[
                "tools.macAddressToIpv6LinkLocalAddressConverter.inputDescription"
              ]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <TextField isInvalid={result.status === "invalid"}>
              <Label htmlFor={macId}>
                {m[
                  "tools.macAddressToIpv6LinkLocalAddressConverter.macLabel"
                ]()}
              </Label>
              <Input
                id={macId}
                name="mac"
                autoComplete="off"
                spellCheck={false}
                value={mac}
                placeholder={m[
                  "tools.macAddressToIpv6LinkLocalAddressConverter.macPlaceholder"
                ]()}
                className="min-h-11 font-mono text-base"
                onChange={(event) => setMac(event.currentTarget.value)}
              />
            </TextField>
            <TextField>
              <Label htmlFor={interfaceId}>
                {m[
                  "tools.macAddressToIpv6LinkLocalAddressConverter.networkInterfaceLabel"
                ]()}
              </Label>
              <Input
                id={interfaceId}
                name="network-interface"
                autoComplete="off"
                spellCheck={false}
                value={networkInterface}
                placeholder={m[
                  "tools.macAddressToIpv6LinkLocalAddressConverter.networkInterfacePlaceholder"
                ]()}
                className="min-h-11 font-mono text-base"
                onChange={(event) =>
                  setNetworkInterface(event.currentTarget.value)
                }
              />
            </TextField>
            {result.status === "invalid" ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m[
                      "tools.macAddressToIpv6LinkLocalAddressConverter.invalidAddress"
                    ]()}
                  </Alert.Title>
                  <Alert.Description>
                    {m[
                      "tools.macAddressToIpv6LinkLocalAddressConverter.invalidAddress"
                    ]()}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m[
                "tools.macAddressToIpv6LinkLocalAddressConverter.resultLabel"
              ]()}
            </Card.Title>
            <Card.Description>
              {m[
                "tools.macAddressToIpv6LinkLocalAddressConverter.resultDescription"
              ]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <div className="flex min-h-40 items-start justify-between gap-4 rounded-xl border border-border bg-default/20 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted">
                  {m[
                    "tools.macAddressToIpv6LinkLocalAddressConverter.resultLabel"
                  ]()}
                </p>
                <output className="mt-2 block font-mono text-lg font-medium break-all">
                  {result.status === "success" ? result.value : "—"}
                </output>
              </div>
              <ToolCopyButton
                value={result.status === "success" ? result.value : ""}
                copyLabel={m["common.actions.copy"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={result.status !== "success"}
              />
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <MacToIpv6Article />
    </div>
  );
}

function MacToIpv6Article() {
  return (
    <ToolArticle>
      <h2>
        {m["tools.macAddressToIpv6LinkLocalAddressConverter.article.title"]()}
      </h2>
      <p>
        {m["tools.macAddressToIpv6LinkLocalAddressConverter.article.summary"]()}
      </p>
      <h3>{m["shared.barcodeTools.readerArticleWhenTitle"]()}</h3>
      <p>
        {m["tools.macAddressToIpv6LinkLocalAddressConverter.article.when"]()}
      </p>
      <h3>
        {m[
          "tools.macAddressToIpv6LinkLocalAddressConverter.article.mappingTitle"
        ]()}
      </h3>
      <ol>
        {[
          m[
            "tools.macAddressToIpv6LinkLocalAddressConverter.article.mapping0"
          ](),
          m[
            "tools.macAddressToIpv6LinkLocalAddressConverter.article.mapping1"
          ](),
          m[
            "tools.macAddressToIpv6LinkLocalAddressConverter.article.mapping2"
          ](),
          m[
            "tools.macAddressToIpv6LinkLocalAddressConverter.article.mapping3"
          ](),
        ].map((item) => (
          <li key={item}>
            <InlineCodeText text={item} />
          </li>
        ))}
      </ol>
      <h3>
        {m[
          "tools.macAddressToIpv6LinkLocalAddressConverter.article.formatsTitle"
        ]()}
      </h3>
      <ul>
        {[
          m[
            "tools.macAddressToIpv6LinkLocalAddressConverter.article.formats0"
          ](),
          m[
            "tools.macAddressToIpv6LinkLocalAddressConverter.article.formats1"
          ](),
          m[
            "tools.macAddressToIpv6LinkLocalAddressConverter.article.formats2"
          ](),
          m[
            "tools.macAddressToIpv6LinkLocalAddressConverter.article.formats3"
          ](),
        ].map((item) => (
          <li key={item}>
            <code>{item}</code>
          </li>
        ))}
      </ul>
      <h3>
        {m[
          "tools.macAddressToIpv6LinkLocalAddressConverter.article.suffixTitle"
        ]()}
      </h3>
      <p>
        <InlineCodeText
          text={m[
            "tools.macAddressToIpv6LinkLocalAddressConverter.article.suffix"
          ]()}
        />
      </p>
    </ToolArticle>
  );
}

const inlineCodeTokens = new Set([
  "U/L bit",
  "ff:fe",
  "fe80::/10",
  "%eth0",
  "%en0",
]);

function InlineCodeText({ text }: { text: string }) {
  return text
    .split(/(U\/L bit|ff:fe|fe80::\/10|%eth0|%en0)/g)
    .map((part) =>
      inlineCodeTokens.has(part) ? <code key={part}>{part}</code> : part,
    );
}

function convert(mac: string, networkInterface: string) {
  if (!mac.trim()) return { status: "empty" as const };
  try {
    return {
      status: "success" as const,
      value: macToIpv6(mac, networkInterface).ipv6,
    };
  } catch {
    return { status: "invalid" as const };
  }
}

export default function MacToIpv6LinkLocalPage() {
  return (
    <ToolPage
      instructions={m[
        "tools.macAddressToIpv6LinkLocalAddressConverter.usage"
      ]()}
    >
      <MacToIpv6LinkLocalPageContent />
    </ToolPage>
  );
}
