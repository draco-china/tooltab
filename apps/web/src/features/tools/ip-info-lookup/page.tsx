import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  Skeleton,
  Table,
} from "@heroui/react";
import { Globe, Network, Search } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { lookupIpInfoTarget } from "../network-lookups/logic";
import {
  parseLookupTarget,
  RESOLVERS,
  type ResolverId,
} from "@workspace/tools/network/lookups";

type LookupResult = Awaited<ReturnType<typeof lookupIpInfoTarget>>;
type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: LookupResult }
  | { status: "error" };

const DEFAULT_TARGET = "example.com";
const DEFAULT_RESOLVER: ResolverId = "cloudflare";
const LOOKUP_TIMEOUT_MS = 20_000;

function IpInfoLookupContent() {
  const locale = getLocale();
  const targetId = useId();
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [resolver, setResolver] = useState<ResolverId>(DEFAULT_RESOLVER);
  const [state, setState] = useState<LookupState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  const timeout = useRef<number | null>(null);
  const revision = useRef(0);

  const parsed = useMemo(() => {
    try {
      return parseLookupTarget(target);
    } catch {
      return null;
    }
  }, [target]);
  const isInvalid = parsed === null;
  const showResolver = !parsed || parsed.kind === "domain";

  function abortActive() {
    controller.current?.abort();
    controller.current = null;
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    timeout.current = null;
  }

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
      controller.current = null;
      if (timeout.current !== null) window.clearTimeout(timeout.current);
      timeout.current = null;
    },
    [],
  );

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed) return;

    abortActive();
    const current = ++revision.current;
    const active = new AbortController();
    let timedOut = false;
    controller.current = active;
    timeout.current = window.setTimeout(() => {
      if (controller.current !== active) return;
      timedOut = true;
      active.abort();
    }, LOOKUP_TIMEOUT_MS);
    setState({ status: "loading" });

    try {
      const result = await lookupIpInfoTarget(
        { target, resolver },
        active.signal,
      );
      if (revision.current === current && !active.signal.aborted) {
        setState({ status: "success", result });
      }
    } catch {
      if (
        revision.current === current &&
        (timedOut || !active.signal.aborted)
      ) {
        setState({ status: "error" });
      }
    } finally {
      if (controller.current === active) {
        controller.current = null;
        if (timeout.current !== null) window.clearTimeout(timeout.current);
        timeout.current = null;
      }
    }
  }

  return (
    <div className="grid min-w-0 gap-8">
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
        <ToolPanelCard className="xl:sticky xl:top-6">
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.ipInfoLookup.inputTitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.ipInfoLookup.inputDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <form className="grid gap-5" onSubmit={lookup}>
              <div className="grid gap-2">
                <Label htmlFor={targetId}>
                  {m["tools.ipInfoLookup.targetLabel"]()}
                </Label>
                <Input
                  id={targetId}
                  name="target"
                  value={target}
                  placeholder={m["tools.ipInfoLookup.targetPlaceholder"]()}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={isInvalid}
                  className="min-h-11 font-mono"
                  onChange={(event) => setTarget(event.target.value)}
                />
                <p
                  className={`text-xs ${isInvalid ? "text-danger" : "text-muted"}`}
                >
                  {isInvalid
                    ? m["tools.ipInfoLookup.invalidTargetDescription"]()
                    : m["tools.ipInfoLookup.targetDescription"]()}
                </p>
              </div>

              {showResolver ? (
                <div className="grid gap-2">
                  <Select
                    variant="secondary"
                    selectedKey={resolver}
                    onSelectionChange={(key) => {
                      if (key != null) setResolver(String(key) as ResolverId);
                    }}
                  >
                    <Label>{m["tools.ipInfoLookup.resolverLabel"]()}</Label>
                    <Select.Trigger className="min-h-11 w-full">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox
                        aria-label={m[
                          "tools.ipInfoLookup.resolverGroupLabel"
                        ]()}
                      >
                        {Object.entries(RESOLVERS).map(([id, item]) => (
                          <ListBox.Item key={id} id={id} textValue={item.label}>
                            {item.label}
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  <p className="text-xs text-muted">
                    {m["tools.ipInfoLookup.resolverDescription"]()}
                  </p>
                </div>
              ) : null}

              <Button type="submit" isDisabled={isInvalid}>
                <Search aria-hidden className="size-4" />
                {state.status === "loading"
                  ? m["tools.ipInfoLookup.loadingButton"]()
                  : m["tools.ipInfoLookup.lookupButton"]()}
              </Button>
            </form>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ResultCard state={state} parsed={parsed} locale={locale} />
      </div>

      <ToolArticle>
        <h2>{m["tools.ipInfoLookup.whatTitle"]()}</h2>
        <p>{m["tools.ipInfoLookup.whatBody"]()}</p>
        <h2>{m["tools.ipInfoLookup.domainTitle"]()}</h2>
        <p>{m["tools.ipInfoLookup.domainBody"]()}</p>
        <h2>{m["tools.ipInfoLookup.meaningTitle"]()}</h2>
        <p>{m["tools.ipInfoLookup.meaningBody"]()}</p>
        <h2>{m["tools.deviceInformation.article.privacyTitle"]()}</h2>
        <p>{m["tools.ipInfoLookup.privacyBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function ResultCard({
  state,
  parsed,
  locale,
}: {
  state: LookupState;
  parsed: ReturnType<typeof parseLookupTarget> | null;
  locale: string;
}) {
  const result =
    state.status === "success" && parsed ? state.result : undefined;
  const visibleTarget = result?.target ?? parsed;
  const copyValue = result?.addresses.map((entry) => entry.address).join("\n");

  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <Card.Title>{m["tools.ipInfoLookup.resultTitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.ipInfoLookup.resultDescription"]()}
            </Card.Description>
          </div>
          {copyValue ? (
            <ToolCopyButton
              value={copyValue}
              copyLabel={m["tools.ipInfoLookup.copyAllAddresses"]()}
              copiedLabel={m["common.actions.copied"]()}
            />
          ) : null}
        </div>
      </Card.Header>
      <ToolPanelCardContent aria-live="polite" className="py-4">
        {renderResult(state, parsed, locale)}
      </ToolPanelCardContent>
      {visibleTarget ? (
        <ToolPanelCardFooter className="text-xs text-muted">
          <span className="break-all">
            {m["tools.ipInfoLookup.normalizedTarget"]()}:{" "}
            {visibleTarget.normalized}
          </span>
        </ToolPanelCardFooter>
      ) : null}
    </ToolPanelCard>
  );
}

function renderResult(
  state: LookupState,
  parsed: ReturnType<typeof parseLookupTarget> | null,
  locale: string,
) {
  if (state.status === "loading") {
    return (
      <Status
        title={m["tools.ipInfoLookup.loadingTitle"]()}
        description={m["tools.ipInfoLookup.loadingDescription"]()}
      >
        <div role="status" className="grid w-full gap-4">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
          <Skeleton className="h-52 rounded-xl" />
        </div>
      </Status>
    );
  }
  if (!parsed) {
    return (
      <ResultAlert
        title={m["tools.ipInfoLookup.invalidTargetTitle"]()}
        description={m["tools.ipInfoLookup.invalidTargetDescription"]()}
      />
    );
  }
  if (state.status === "error") {
    return (
      <ResultAlert
        title={m["tools.dnsLookup.errorTitle"]()}
        description={m["tools.ipInfoLookup.lookupFailedDescription"]()}
      />
    );
  }
  if (state.status === "success") {
    if (
      state.result.target.kind === "domain" &&
      !state.result.addresses.length
    ) {
      return (
        <Status
          title={m["tools.ipInfoLookup.noAddressesTitle"]()}
          description={m["tools.ipInfoLookup.noAddressesDescription"]()}
        >
          <Network aria-hidden className="size-10 text-muted" />
        </Status>
      );
    }
    return <ResultView result={state.result} locale={locale} />;
  }
  return (
    <Status
      title={m["tools.ipInfoLookup.idleTitle"]()}
      description={m["tools.ipInfoLookup.idleDescription"]()}
    >
      <Network aria-hidden className="size-10 text-muted" />
    </Status>
  );
}

function Status({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-default/30 px-5 py-10 text-center">
      <div className="grid w-full max-w-2xl justify-items-center gap-3">
        {children}
        <h2 className="font-medium">{title}</h2>
        <p className="max-w-lg text-sm leading-6 text-muted">{description}</p>
      </div>
    </div>
  );
}

function ResultAlert({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Alert status="danger" role="alert">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{description}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function ResultView({
  result,
  locale,
}: {
  result: LookupResult;
  locale: string;
}) {
  const addressCount = new Intl.NumberFormat(locale).format(
    result.addresses.length,
  );
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <Chip>
          {result.target.kind === "ip"
            ? m["tools.ipInfoLookup.ipTarget"]()
            : m["common.identityDomain"]()}
        </Chip>
        {result.target.kind === "domain" ? (
          <Chip variant="secondary">
            {m["tools.ipInfoLookup.addressCount"]()}: {addressCount}
          </Chip>
        ) : null}
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <SummaryItem
          label={m["tools.ipInfoLookup.target"]()}
          value={result.target.input}
        />
        <SummaryItem
          label={m["tools.ipInfoLookup.normalizedTarget"]()}
          value={result.target.normalized}
        />
        {result.target.kind === "domain" ? (
          <>
            <SummaryItem
              label={m["tools.ipInfoLookup.resolver"]()}
              value={result.endpoint}
            />
            <SummaryItem
              label={m["tools.ipInfoLookup.addressCount"]()}
              value={addressCount}
            />
          </>
        ) : null}
      </dl>

      {result.records.length ? (
        <section className="grid gap-0 overflow-hidden rounded-xl border border-border">
          <header className="grid gap-1 border-b border-separator p-4">
            <h3 className="font-medium">
              {m["tools.ipInfoLookup.domainRecords"]()}
            </h3>
            <p className="text-sm text-muted">
              {m["tools.ipInfoLookup.domainRecordsDescription"]()}
            </p>
          </header>
          <Table variant="secondary">
            <Table.ScrollContainer>
              <Table.Content
                aria-label={m["tools.ipInfoLookup.domainRecords"]()}
              >
                <Table.Header>
                  <Table.Column id="type" isRowHeader>
                    {m["common.uaFieldType"]()}
                  </Table.Column>
                  <Table.Column id="address">
                    {m["shared.qrTools.address"]()}
                  </Table.Column>
                  <Table.Column id="ttl">
                    {m["tools.dnsLookup.answerTtl"]()}
                  </Table.Column>
                </Table.Header>
                <Table.Body>
                  {result.records.map((record) => (
                    <Table.Row
                      key={`${record.type}-${record.value}`}
                      id={`${record.type}-${record.value}`}
                    >
                      <Table.Cell className="font-medium">
                        {record.type}
                      </Table.Cell>
                      <Table.Cell className="font-mono text-xs break-all">
                        {record.value}
                      </Table.Cell>
                      <Table.Cell className="font-mono text-xs">
                        {record.ttl}{" "}
                        {m["tools.ipInfoLookup.secondsAbbreviation"]()}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </section>
      ) : null}

      <div className="grid gap-4">
        {result.addresses.map((entry) => (
          <AddressCard key={entry.address} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-field-background min-w-0 rounded-xl border border-border p-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-sm break-all" dir="ltr">
        {value}
      </dd>
    </div>
  );
}

function AddressCard({ entry }: { entry: LookupResult["addresses"][number] }) {
  const coordinates =
    entry.info.latitude === null || entry.info.longitude === null
      ? null
      : `${entry.info.latitude}, ${entry.info.longitude}`;
  const mapUrl = coordinates
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`
    : "";
  const rows: [string, string | null][] = [
    [m["shared.addressTools.hostname"](), entry.info.hostname],
    [m["tools.ipInfoLookup.isp"](), entry.info.isp],
    [m["shared.qrTools.organization"](), entry.info.organization],
    [
      m["tools.ipInfoLookup.asn"](),
      entry.info.asn === null ? null : String(entry.info.asn),
    ],
    [m["tools.ipInfoLookup.asnOrganization"](), entry.info.asnOrganization],
    [
      m["shared.qrTools.location"](),
      [entry.info.city, entry.info.region, entry.info.country]
        .filter(Boolean)
        .join(", ") || null,
    ],
    [
      m["tools.ipInfoLookup.country"](),
      entry.info.country
        ? entry.info.countryCode
          ? `${entry.info.country} (${entry.info.countryCode})`
          : entry.info.country
        : entry.info.countryCode,
    ],
    [m["tools.ipInfoLookup.region"](), entry.info.region],
    [m["tools.ipInfoLookup.city"](), entry.info.city],
    [m["tools.ipInfoLookup.postalCode"](), entry.info.postalCode],
    [m["tools.deviceInformation.summaryTimezone"](), entry.info.timezone],
    [m["tools.ipInfoLookup.coordinates"](), coordinates],
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <header className="flex flex-col gap-3 border-b border-separator p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Chip size="sm" variant="secondary">
            {entry.family === 4
              ? m["shared.cidrTools.cidrParserIpv4Label"]()
              : m["shared.cidrTools.cidrParserIpv6Label"]()}
          </Chip>
          <h3
            className="mt-2 font-mono text-xl font-semibold break-all"
            dir="ltr"
          >
            {entry.address}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <ToolCopyButton
            value={entry.address}
            copyLabel={m["tools.ipInfoLookup.copyAddress"]()}
            copiedLabel={m["common.actions.copied"]()}
          />
          {mapUrl ? (
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-8 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition outline-none hover:bg-default focus-visible:ring-2 focus-visible:ring-focus/25"
            >
              <Globe aria-hidden className="size-4" />
              {m["tools.ipInfoLookup.openMap"]()}
            </a>
          ) : null}
        </div>
      </header>
      <dl className="grid sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 border-b border-separator p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd
              className={`mt-1 text-sm wrap-break-word ${value ? "text-foreground" : "text-muted"}`}
              dir="ltr"
            >
              {value || m["tools.deviceInformation.unavailable"]()}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function IpInfoLookup() {
  return (
    <ToolPage>
      <IpInfoLookupContent />
    </ToolPage>
  );
}
