import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Chip, Input } from "@heroui/react";
import { Network, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/base/empty";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { parseCidr } from "@workspace/tools/network/cidr-details";

type DetailItem = Readonly<{
  label: string;
  value: string;
  copyValue?: string | null;
}>;
const STORAGE_KEY = "tools:cidr-parser:input";

function CidrParserContent() {
  const inputId = useId();
  const [value, setValue] = useState("");

  useEffect(() => {
    try {
      setValue(localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {
      // Storage is optional.
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage is optional.
    }
  }, [value]);

  const result = useMemo(() => parseCidr(value), [value]);
  return (
    <div className="grid gap-8">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]"
        data-tool-panels
      >
        <InputCard inputId={inputId} value={value} onChange={setValue} />
        {result.status === "success" ? (
          <ParsedResult details={result.details} />
        ) : (
          <Placeholder status={result.status} />
        )}
      </div>
      <ToolArticle>
        <p>
          {m["shared.cidrTools.cidrParserArticleIntroBeforeFirst"]()}
          <code>10.24.8.19/21</code>
          {m["shared.cidrTools.cidrParserArticleIntroBetween"]()}
          <code>2001:db8:abcd::123/64</code>
          {m["shared.cidrTools.cidrParserArticleIntroAfterSecond"]()}
        </p>
        <h2>{m["shared.cidrTools.cidrParserArticleWhatTitle"]()}</h2>
        <p>{m["shared.cidrTools.cidrParserArticleWhatBody"]()}</p>
        <h2>{m["shared.cidrTools.cidrParserArticleWhyTitle"]()}</h2>
        <p>{m["shared.cidrTools.cidrParserArticleWhyBody"]()}</p>
        <h2>{m["shared.aesTools.decryptarticlenotestitle"]()}</h2>
        <ul>
          <li>
            <code>/31</code>
            {m["shared.cidrTools.prefixJoin"]()}
            <code>/32</code>
            {m["shared.cidrTools.cidrParserArticleNoteOneAfterPrefixes"]()}
          </li>
          <li>{m["shared.cidrTools.cidrParserArticleNoteTwo"]()}</li>
          <li>{m["shared.cidrTools.cidrParserArticleNoteThree"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

function InputCard({
  inputId,
  value,
  onChange,
}: {
  inputId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["shared.cidrTools.cidrParserInputTitle"]()}</Card.Title>
        <Card.Description>
          {m["shared.cidrTools.cidrParserInputDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-4 py-4">
        <div className="grid gap-2">
          <label htmlFor={inputId} className="text-sm font-medium">
            {m["shared.cidrTools.cidrParserInputLabel"]()}
          </label>
          <Input
            id={inputId}
            name="cidr"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={m["shared.cidrTools.cidrParserInputPlaceholder"]()}
            className="font-mono text-base"
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </div>
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="text-sm text-muted">
            {m["shared.cidrTools.cidrParserInputHint"]()}
          </p>
          <div className="mt-3 grid gap-2">
            {["10.24.8.19/21", "2001:db8:abcd::123/64"].map((example) => (
              <code
                key={example}
                dir="ltr"
                className="rounded-lg border border-border bg-default/20 px-3 py-2 text-left font-mono text-sm"
              >
                {example}
              </code>
            ))}
          </div>
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

export default function CidrParser() {
  return (
    <ToolPage instructions={m["shared.cidrTools.cidrParserUsage"]()}>
      <CidrParserContent />
    </ToolPage>
  );
}

function Placeholder({ status }: { status: "empty" | "invalid" }) {
  const invalid = status === "invalid";
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {invalid
            ? m["shared.cidrTools.cidrParserInvalidTitle"]()
            : m["shared.cidrTools.cidrParserEmptyTitle"]()}
        </Card.Title>
        <Card.Description>
          {invalid
            ? m["shared.cidrTools.cidrParserInvalidDescription"]()
            : m["shared.cidrTools.cidrParserEmptyDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        {invalid ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>
                {m["shared.cidrTools.cidrParserInvalidTitle"]()}
              </Alert.Title>
              <Alert.Description>
                {m["shared.cidrTools.cidrParserInvalidDescription"]()}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : (
          <Empty className="min-h-64 border border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Network aria-hidden />
              </EmptyMedia>
              <EmptyTitle>
                {m["shared.cidrTools.cidrParserEmptyTitle"]()}
              </EmptyTitle>
              <EmptyDescription>
                {m["shared.cidrTools.cidrParserResultDescription"]()}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ParsedResult({
  details,
}: {
  details: Extract<
    ReturnType<typeof parseCidr>,
    { status: "success" }
  >["details"];
}) {
  const locale = getLocale();
  const familyLabel =
    details.family === 4
      ? m["shared.cidrTools.cidrParserIpv4Label"]()
      : m["shared.cidrTools.cidrParserIpv6Label"]();
  const count = (value: bigint, bits: number | null) =>
    `${new Intl.NumberFormat(locale).format(value)}${bits === null ? "" : ` (2^${bits})`}`;
  const rangeItems: DetailItem[] = [
    {
      label: m["tools.cidrParser.detailNetworkAddress"](),
      value: details.networkAddress,
      copyValue: details.networkAddress,
    },
    {
      label: m["tools.cidrParser.detailRangeEnd"](),
      value: details.rangeEnd,
      copyValue: details.rangeEnd,
    },
    {
      label: m["shared.cidrTools.cidrParserFirstUsableLabel"](),
      value: details.firstUsable,
      copyValue: details.firstUsable,
    },
    {
      label: m["shared.cidrTools.cidrParserLastUsableLabel"](),
      value: details.lastUsable,
      copyValue: details.lastUsable,
    },
    {
      label: m["shared.cidrTools.cidrParserBroadcastAddressLabel"](),
      value: details.broadcastAddress ?? m["tools.cidrParser.na"](),
      copyValue: details.broadcastAddress,
    },
  ];
  const routingItems: DetailItem[] = [
    {
      label: m["shared.cidrTools.cidrParserCanonicalLabel"](),
      value: details.canonicalCidr,
      copyValue: details.canonicalCidr,
    },
    {
      label: m["tools.cidrParser.detailPrefix"](),
      value: `/${details.prefix}`,
      copyValue: String(details.prefix),
    },
    {
      label: m["shared.cidrTools.cidrParserNetmaskLabel"](),
      value: details.netmask ?? m["tools.cidrParser.na"](),
      copyValue: details.netmask,
    },
    {
      label: m["shared.cidrTools.cidrParserWildcardMaskLabel"](),
      value: details.wildcardMask ?? m["tools.cidrParser.na"](),
      copyValue: details.wildcardMask,
    },
    {
      label: m["tools.cidrParser.detailStartInteger"](),
      value: details.startInteger,
      copyValue: details.startInteger,
    },
    {
      label: m["tools.cidrParser.detailEndInteger"](),
      value: details.endInteger,
      copyValue: details.endInteger,
    },
  ];
  const overview = [
    [m["common.cidrDetailFamily"](), familyLabel],
    [
      m["shared.cidrTools.cidrParserOriginalAddressLabel"](),
      details.inputAddress,
    ],
    [
      m["tools.cidrParser.detailAddressCount"](),
      count(details.addressCount, details.hostBits),
    ],
    [
      m["shared.cidrTools.cidrParserUsableAddressesLabel"](),
      count(
        details.usableAddressCount,
        details.usableAddressCount === details.addressCount
          ? details.hostBits
          : null,
      ),
    ],
    [
      m["tools.cidrParser.detailHostBits"](),
      new Intl.NumberFormat(locale).format(details.hostBits),
    ],
  ] as const;
  return (
    <div className="grid gap-6">
      <ToolPanelCard>
        <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div>
            <Card.Title>
              {m["shared.cidrTools.cidrParserResultTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["shared.cidrTools.cidrParserResultDescription"]()}
            </Card.Description>
          </div>
          <ToolCopyButton
            value={details.canonicalCidr}
            copyLabel={m["common.actions.copy"]()}
            copiedLabel={m["common.actions.copied"]()}
          />
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          <div className="flex flex-wrap gap-2">
            <Chip>{familyLabel}</Chip>
            <Chip variant="secondary" dir="ltr">
              /{details.prefix}
            </Chip>
            <Chip variant="tertiary" dir="ltr">
              {m["tools.cidrParser.detailRangeStart"]()}: {details.rangeStart}
            </Chip>
          </div>
          <div className="grid gap-2">
            <p className="text-xs font-medium tracking-widest text-muted uppercase">
              {m["shared.cidrTools.cidrParserOverviewTitle"]()}
            </p>
            <p
              dir="ltr"
              className="font-mono text-2xl font-semibold break-all sm:text-3xl"
            >
              {details.canonicalCidr}
            </p>
            <p className="text-sm text-muted">
              {m["shared.cidrTools.cidrParserOverviewDescription"]()}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {overview.map(([label, item]) => (
              <div
                key={label}
                className="min-w-0 rounded-xl border border-border bg-default/10 p-4"
              >
                <p className="text-sm text-muted">{label}</p>
                <p dir="ltr" className="mt-2 font-mono text-sm wrap-break-word">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </ToolPanelCardContent>
      </ToolPanelCard>
      <div className="grid gap-6 xl:grid-cols-2">
        <DetailsCard
          title={m["shared.cidrTools.cidrParserRangeTitle"]()}
          description={m["shared.cidrTools.cidrParserRangeDescription"]()}
          items={rangeItems}
        />
        <DetailsCard
          title={m["shared.cidrTools.cidrParserRoutingTitle"]()}
          description={m["shared.cidrTools.cidrParserRoutingDescription"]()}
          items={routingItems}
        />
      </div>
    </div>
  );
}

function DetailsCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: DetailItem[];
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{title}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-3 py-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-start justify-between gap-3 rounded-xl border border-border bg-default/10 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">{item.label}</p>
              <p
                dir="ltr"
                className="mt-1 font-mono text-sm break-all sm:text-base"
              >
                {item.value}
              </p>
            </div>
            {item.copyValue ? (
              <ToolCopyButton
                value={item.copyValue}
                copyLabel={m["common.actions.copy"]()}
                copiedLabel={m["common.actions.copied"]()}
                variant="ghost"
              />
            ) : null}
          </div>
        ))}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}
