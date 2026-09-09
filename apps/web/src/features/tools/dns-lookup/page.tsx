import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Checkbox,
  Dropdown,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";
import { ChevronDown, RefreshCcw, Search } from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { lookupDnsRecords } from "../network-lookups/logic";
import {
  DNS_RECORD_TYPES,
  type DnsRecordType,
  normalizeDomain,
  RESOLVERS,
  type ResolverId,
} from "@workspace/tools/network/lookups";
import { type LookupResult, ResultsCard } from "./results";

const DOMAIN_KEY = "tools:dns-lookup:domain";
const RECORD_TYPES_KEY = "tools:dns-lookup:record-types";
const SERVER_KEY = "tools:dns-lookup:server";
const DNSSEC_KEY = "tools:dns-lookup:dnssec";
const CHECKING_DISABLED_KEY = "tools:dns-lookup:checking-disabled";

const DNS_TYPE_CODES: Record<DnsRecordType, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  HINFO: 13,
  MX: 15,
  TXT: 16,
  RP: 17,
  AFSDB: 18,
  SIG: 24,
  KEY: 25,
  AAAA: 28,
  LOC: 29,
  SRV: 33,
  NAPTR: 35,
  KX: 36,
  CERT: 37,
  DNAME: 39,
  APL: 42,
  DS: 43,
  SSHFP: 44,
  IPSECKEY: 45,
  RRSIG: 46,
  NSEC: 47,
  DNSKEY: 48,
  DHCID: 49,
  NSEC3: 50,
  NSEC3PARAM: 51,
  TLSA: 52,
  SMIMEA: 53,
  HIP: 55,
  CDS: 59,
  CDNSKEY: 60,
  OPENPGPKEY: 61,
  CSYNC: 62,
  ZONEMD: 63,
  SVCB: 64,
  HTTPS: 65,
  EUI48: 108,
  EUI64: 109,
  TKEY: 249,
  TSIG: 250,
  ANY: 255,
  URI: 256,
  CAA: 257,
  TA: 32768,
  DLV: 32769,
};

export type DnsSearch = Readonly<Record<string, string>>;

type ParsedDnsSearch = {
  domain?: string;
  recordTypes?: DnsRecordType[];
  resolver?: ResolverId;
  dnssec?: boolean;
  checkingDisabled?: boolean;
};

function dnsSearchKey({
  domain,
  recordTypes,
  resolver,
  dnssec,
  checkingDisabled,
}: {
  domain: string;
  recordTypes: DnsRecordType[];
  resolver: ResolverId;
  dnssec: boolean;
  checkingDisabled: boolean;
}) {
  return [
    domain,
    recordTypes.join(","),
    resolver,
    dnssec ? "true" : "",
    checkingDisabled ? "true" : "",
  ].join("|");
}

function readDnsSearch(search: DnsSearch): ParsedDnsSearch {
  const recordTypes = search.types
    ?.split(",")
    .filter((value): value is DnsRecordType =>
      DNS_RECORD_TYPES.includes(value as DnsRecordType),
    );
  const resolver = search.resolver ? readResolver(search.resolver) : undefined;
  return {
    domain: search.domain?.trim() || undefined,
    recordTypes: recordTypes?.length ? recordTypes : undefined,
    resolver: resolver ?? undefined,
    dnssec: search.dnssec === "true" ? true : undefined,
    checkingDisabled: search.checkingDisabled === "true" ? true : undefined,
  };
}

function readResolver(value: string | null): ResolverId | null {
  if (!value) return null;
  return (
    (Object.entries(RESOLVERS).find(
      ([id, resolver]) => id === value || resolver.url === value,
    )?.[0] as ResolverId | undefined) ?? null
  );
}

function QueryCard({
  domain,
  setDomain,
  recordTypes,
  setRecordTypes,
  resolver,
  setResolver,
  dnssec,
  setDnssec,
  checkingDisabled,
  setCheckingDisabled,
  validationError,
  clearValidation,
  busy,
  onSubmit,
  onReset,
}: {
  domain: string;
  setDomain: (value: string) => void;
  recordTypes: DnsRecordType[];
  setRecordTypes: (value: DnsRecordType[]) => void;
  resolver: ResolverId;
  setResolver: (value: ResolverId) => void;
  dnssec: boolean;
  setDnssec: (value: boolean) => void;
  checkingDisabled: boolean;
  setCheckingDisabled: (value: boolean) => void;
  validationError: string;
  clearValidation: () => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onReset: () => void;
}) {
  const resolverId = useId();
  const formId = useId();
  const recordSummary =
    recordTypes.length <= 4
      ? recordTypes.join(", ")
      : `${recordTypes.slice(0, 4).join(", ")} +${recordTypes.length - 4}`;

  return (
    <ToolPanelCard>
      <Card.Header className="flex flex-col items-start gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <Card.Title>{m["tools.dnsLookup.queryTitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.dnsLookup.queryDescription"]()}
          </Card.Description>
        </div>
        <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Button
            form={formId}
            type="submit"
            variant="primary"
            isDisabled={busy}
          >
            <Search aria-hidden className="size-4" />
            {busy
              ? m["tools.dnsLookup.lookingUpButton"]()
              : m["tools.dnsLookup.lookupButton"]()}
          </Button>
          <Button type="button" variant="ghost" onPress={onReset}>
            <RefreshCcw aria-hidden className="size-4" />
            {m["common.actions.reset"]()}
          </Button>
        </div>
      </Card.Header>
      <form id={formId} onSubmit={onSubmit}>
        <ToolPanelCardContent className="grid gap-6 py-4 lg:grid-cols-2 lg:items-start">
          <TextField
            fullWidth
            className="gap-2"
            isInvalid={Boolean(validationError)}
          >
            <Label>{m["common.identityDomain"]()}</Label>
            <Input
              name="domain"
              className="min-h-11 font-mono"
              value={domain}
              placeholder={m["tools.dnsLookup.domainPlaceholder"]()}
              autoComplete="url"
              spellCheck={false}
              onChange={(event) => {
                clearValidation();
                setDomain(event.currentTarget.value);
              }}
            />
            {validationError ? (
              <p role="alert" className="text-sm text-danger">
                {validationError}
              </p>
            ) : null}
          </TextField>

          <Select
            variant="secondary"
            selectedKey={resolver}
            onSelectionChange={(key) => setResolver(String(key) as ResolverId)}
          >
            <Label className="text-sm font-medium">
              {m["tools.dnsLookup.dohServerLabel"]()}
            </Label>
            <Select.Trigger id={resolverId} className="min-h-11 w-full">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {Object.entries(RESOLVERS).map(([id, item]) => (
                  <ListBox.Item key={id} id={id} textValue={item.label}>
                    {item.label}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <fieldset className="grid min-w-0 gap-2">
            <legend className="text-sm font-medium">
              {m["tools.dnsLookup.recordTypesLabel"]()}
            </legend>
            <p className="text-sm text-muted">
              {m["tools.dnsLookup.recordTypesDescription"]()}
            </p>
            <Dropdown>
              <Dropdown.Trigger
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-default px-3 text-start text-sm outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/25"
                aria-label={`${m["tools.dnsLookup.recordTypesLabel"]()}: ${recordSummary || m["tools.dnsLookup.recordTypeRequired"]()}`}
              >
                <span className="min-w-0 truncate font-mono">
                  {recordSummary || m["tools.dnsLookup.recordTypesLabel"]()}
                </span>
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-muted"
                />
              </Dropdown.Trigger>
              <Dropdown.Popover className="max-h-80 w-(--trigger-width) overflow-y-auto">
                <Dropdown.Menu
                  aria-label={m["tools.dnsLookup.recordTypesLabel"]()}
                  selectionMode="multiple"
                  selectedKeys={new Set(recordTypes)}
                  onSelectionChange={(selection) => {
                    clearValidation();
                    const next =
                      selection === "all"
                        ? [...DNS_RECORD_TYPES]
                        : DNS_RECORD_TYPES.filter((type) =>
                            selection.has(type),
                          );
                    setRecordTypes(next);
                  }}
                >
                  {DNS_RECORD_TYPES.map((type) => (
                    <Dropdown.Item key={type} id={type} textValue={type}>
                      <span className="flex w-full items-center justify-between gap-6">
                        <span className="w-12 font-mono text-xs text-muted tabular-nums">
                          {DNS_TYPE_CODES[type]}
                        </span>
                        <span className="flex-1 font-mono">{type}</span>
                      </span>
                      <Dropdown.ItemIndicator />
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </fieldset>

          <fieldset className="grid gap-4">
            <legend className="text-sm font-medium">
              {m["tools.dnsLookup.flagsLabel"]()}
            </legend>
            <Checkbox isSelected={dnssec} onChange={setDnssec}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">
                    {m["tools.dnsLookup.dnssecLabel"]()}
                  </span>
                  <span className="text-xs text-muted">
                    {m["tools.dnsLookup.dnssecDescription"]()}
                  </span>
                </span>
              </Checkbox.Content>
            </Checkbox>
            <Checkbox
              isSelected={checkingDisabled}
              onChange={setCheckingDisabled}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">
                    {m["tools.dnsLookup.checkingDisabledLabel"]()}
                  </span>
                  <span className="text-xs text-muted">
                    {m["tools.dnsLookup.checkingDisabledDescription"]()}
                  </span>
                </span>
              </Checkbox.Content>
            </Checkbox>
          </fieldset>
        </ToolPanelCardContent>
      </form>
    </ToolPanelCard>
  );
}

function Article() {
  return (
    <ToolArticle>
      <p>{m["tools.dnsLookup.articleLead"]()}</p>
      <h2>{m["tools.dnsLookup.articleWhenTitle"]()}</h2>
      <p>{m["tools.dnsLookup.articleWhenBody"]()}</p>
      <h2>{m["tools.dnsLookup.article.howTitle"]()}</h2>
      <p>
        {m["tools.dnsLookup.articleHowBeforeUrl"]()}
        <code>https://www.example.com/path</code>
        {m["tools.dnsLookup.articleHowBetweenUrls"]()}
        <code>www.example.com</code>
        {m["tools.dnsLookup.article.howAfterUrl"]()}
      </p>
      <h2>{m["tools.dnsLookup.articleResultsTitle"]()}</h2>
      <p>
        {m["tools.dnsLookup.articleResultsBeforeNoError"]()}
        <code>NoError</code>
        {m["tools.dnsLookup.articleResultsBetweenNoErrorAndOtherCodes"]()}
        <code>NXDomain</code>, <code>ServFail</code>,{" "}
        {m["tools.dnsLookup.errorJoin"]()} <code>Refused</code>
        {m["tools.dnsLookup.articleResultsAfterOtherCodes"]()}
      </p>
      <h2>{m["tools.dnsLookup.articlePrivacyTitle"]()}</h2>
      <p>
        {m["tools.dnsLookup.articlePrivacyBeforeDig"]()}
        <code>dig</code>
        {m["tools.dnsLookup.articlePrivacyAfterDig"]()}
      </p>
    </ToolArticle>
  );
}

function DnsLookupContent({
  search,
  onSearchChange,
}: {
  search: DnsSearch;
  onSearchChange: (next: Record<string, string>) => void;
}) {
  const locale = getLocale();
  const searchCheckingDisabled = search.checkingDisabled;
  const searchDnssec = search.dnssec;
  const searchDomain = search.domain;
  const searchResolver = search.resolver;
  const searchTypes = search.types;
  const parsedSearch = useMemo(
    () =>
      readDnsSearch({
        checkingDisabled: searchCheckingDisabled,
        dnssec: searchDnssec,
        domain: searchDomain,
        resolver: searchResolver,
        types: searchTypes,
      }),
    [
      searchCheckingDisabled,
      searchDnssec,
      searchDomain,
      searchResolver,
      searchTypes,
    ],
  );
  const [domain, setDomain] = useState(parsedSearch.domain ?? "example.com");
  const [recordTypes, setRecordTypes] = useState<DnsRecordType[]>(
    parsedSearch.recordTypes ?? ["A", "AAAA"],
  );
  const [resolver, setResolver] = useState<ResolverId>(
    parsedSearch.resolver ?? "cloudflare",
  );
  const [dnssec, setDnssec] = useState(false);
  const [checkingDisabled, setCheckingDisabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  const expectedSearchKey = useRef<string | null>(null);

  useEffect(() => {
    try {
      const storedDomain = localStorage.getItem(DOMAIN_KEY);
      const storedTypes = JSON.parse(
        localStorage.getItem(RECORD_TYPES_KEY) ?? "null",
      ) as unknown;
      const storedResolver = readResolver(localStorage.getItem(SERVER_KEY));
      if (parsedSearch.domain !== undefined) setDomain(parsedSearch.domain);
      else if (storedDomain !== null) setDomain(storedDomain);
      if (parsedSearch.recordTypes) setRecordTypes(parsedSearch.recordTypes);
      else if (Array.isArray(storedTypes)) {
        setRecordTypes(
          DNS_RECORD_TYPES.filter((type) => storedTypes.includes(type)),
        );
      }
      if (parsedSearch.resolver) setResolver(parsedSearch.resolver);
      else if (storedResolver) setResolver(storedResolver);
      setDnssec(
        parsedSearch.dnssec ?? localStorage.getItem(DNSSEC_KEY) === "true",
      );
      setCheckingDisabled(
        parsedSearch.checkingDisabled ??
          localStorage.getItem(CHECKING_DISABLED_KEY) === "true",
      );
    } catch {}
    const currentSearchKey = dnsSearchKey({
      domain: parsedSearch.domain ?? "example.com",
      recordTypes: parsedSearch.recordTypes ?? ["A", "AAAA"],
      resolver: parsedSearch.resolver ?? "cloudflare",
      dnssec: parsedSearch.dnssec ?? false,
      checkingDisabled: parsedSearch.checkingDisabled ?? false,
    });
    if (expectedSearchKey.current === currentSearchKey) {
      expectedSearchKey.current = null;
    } else {
      controller.current?.abort();
      controller.current = null;
      setBusy(false);
    }
    setResult(null);
    setHydrated(true);
  }, [
    parsedSearch.checkingDisabled,
    parsedSearch.dnssec,
    parsedSearch.domain,
    parsedSearch.recordTypes,
    parsedSearch.resolver,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(DOMAIN_KEY, domain);
      localStorage.setItem(RECORD_TYPES_KEY, JSON.stringify(recordTypes));
      localStorage.setItem(SERVER_KEY, RESOLVERS[resolver].url);
      localStorage.setItem(DNSSEC_KEY, String(dnssec));
      localStorage.setItem(CHECKING_DISABLED_KEY, String(checkingDisabled));
    } catch {}
  }, [checkingDisabled, dnssec, domain, hydrated, recordTypes, resolver]);

  useEffect(() => () => controller.current?.abort(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = domain.trim();
    if (!value) {
      setValidationError(m["tools.dnsLookup.domainRequired"]());
      return;
    }
    try {
      normalizeDomain(value);
    } catch {
      setValidationError(m["tools.dnsLookup.invalidDomain"]());
      return;
    }
    if (!recordTypes.length) {
      setValidationError(m["tools.dnsLookup.recordTypeRequired"]());
      return;
    }

    expectedSearchKey.current = dnsSearchKey({
      domain: value,
      recordTypes,
      resolver,
      dnssec,
      checkingDisabled,
    });
    onSearchChange({
      domain: value,
      types: recordTypes.join(","),
      resolver,
      ...(dnssec ? { dnssec: "true" } : {}),
      ...(checkingDisabled ? { checkingDisabled: "true" } : {}),
    });
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setValidationError("");
    setError("");
    try {
      const next = await lookupDnsRecords(
        { name: value, recordTypes, resolver, dnssec, checkingDisabled },
        active.signal,
      );
      if (!active.signal.aborted) setResult(next);
    } catch (cause) {
      if (!active.signal.aborted) {
        setResult(null);
        setError(
          `${m["tools.dnsLookup.lookupFailed"]()} ${cause instanceof Error ? cause.message : ""}`.trim(),
        );
      }
    } finally {
      if (controller.current === active) {
        controller.current = null;
        expectedSearchKey.current = null;
        setBusy(false);
      }
    }
  }

  function reset() {
    controller.current?.abort();
    controller.current = null;
    expectedSearchKey.current = null;
    setDomain("example.com");
    setRecordTypes(["A", "AAAA"]);
    setResolver("cloudflare");
    setDnssec(false);
    setCheckingDisabled(false);
    setValidationError("");
    setBusy(false);
    setError("");
    setResult(null);
    onSearchChange({});
  }

  return (
    <div className="grid gap-8">
      <QueryCard
        domain={domain}
        setDomain={setDomain}
        recordTypes={recordTypes}
        setRecordTypes={setRecordTypes}
        resolver={resolver}
        setResolver={setResolver}
        dnssec={dnssec}
        setDnssec={setDnssec}
        checkingDisabled={checkingDisabled}
        setCheckingDisabled={setCheckingDisabled}
        validationError={validationError}
        clearValidation={() => setValidationError("")}
        busy={busy}
        onSubmit={submit}
        onReset={reset}
      />
      <ResultsCard locale={locale} busy={busy} error={error} result={result} />
      <Article />
    </div>
  );
}

export default function DnsLookup({
  search,
  onSearchChange,
}: {
  search: DnsSearch;
  onSearchChange: (next: Record<string, string>) => void;
}) {
  return (
    <ToolPage>
      <DnsLookupContent search={search} onSearchChange={onSearchChange} />
    </ToolPage>
  );
}
