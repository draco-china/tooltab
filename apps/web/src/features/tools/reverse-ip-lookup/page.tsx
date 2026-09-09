import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Header,
  Input,
  Label,
  ListBox,
  Select,
  Skeleton,
  Table,
  TextField,
} from "@heroui/react";
import { Network, Search, TriangleAlert } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { lookupReverseIp } from "../network-lookups/logic";
import {
  normalizeIp,
  RESOLVERS,
  type ResolverId,
  reverseDomain,
} from "@workspace/tools/network/lookups";

type LookupResult = Awaited<ReturnType<typeof lookupReverseIp>>;

const IP_STORAGE_KEY = "tools:reverse-ip-lookup:ip";
const RESOLVER_STORAGE_KEY = "tools:reverse-ip-lookup:resolver";
const DEFAULT_IP = "1.1.1.1";

function ReverseIpLookupContent() {
  const [ip, setIp] = useState(DEFAULT_IP);
  const [resolver, setResolver] = useState<ResolverId>("cloudflare");
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const inputState = useMemo(() => parseInput(ip), [ip]);

  useEffect(() => {
    try {
      const storedIp = localStorage.getItem(IP_STORAGE_KEY);
      const storedResolver = readResolver(
        localStorage.getItem(RESOLVER_STORAGE_KEY),
      );
      if (storedIp !== null) setIp(storedIp);
      if (storedResolver) setResolver(storedResolver);
    } catch {}
    setHydrated(true);
    return () => controller.current?.abort();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(IP_STORAGE_KEY, ip);
      localStorage.setItem(RESOLVER_STORAGE_KEY, RESOLVERS[resolver].url);
    } catch {}
  }, [hydrated, ip, resolver]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inputState.status !== "valid") return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    try {
      const next = await lookupReverseIp(
        { ip: inputState.address, resolver },
        active.signal,
      );
      if (!active.signal.aborted) setResult(next);
    } catch {
      if (!active.signal.aborted) {
        setResult(null);
        setError(m["tools.reverseIpLookup.lookupFailedDescription"]());
      }
    } finally {
      if (controller.current === active) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className="grid gap-8">
      <div
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
        data-reverse-ip-panels
      >
        <QueryCard
          ip={ip}
          resolver={resolver}
          inputState={inputState}
          busy={busy}
          onIpChange={(value) => {
            setIp(value);
            setError("");
          }}
          onResolverChange={(value) => {
            setResolver(value);
            setError("");
          }}
          onSubmit={submit}
        />
        <ResultsCard
          resolver={resolver}
          inputState={inputState}
          busy={busy}
          error={error}
          result={result}
        />
      </div>
      <Article />
    </div>
  );
}

type InputState =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "valid"; address: string; family: 4 | 6; domain: string };

function parseInput(value: string): InputState {
  if (!value.trim()) return { status: "empty" };
  try {
    const parsed = normalizeIp(value);
    return {
      status: "valid",
      address: parsed.address,
      family: parsed.family,
      domain: reverseDomain(parsed.address),
    };
  } catch {
    return { status: "invalid" };
  }
}

function readResolver(value: string | null): ResolverId | null {
  if (!value) return null;
  return (
    (Object.entries(RESOLVERS).find(
      ([id, item]) => id === value || item.url === value,
    )?.[0] as ResolverId | undefined) ?? null
  );
}

function QueryCard({
  ip,
  resolver,
  inputState,
  busy,
  onIpChange,
  onResolverChange,
  onSubmit,
}: {
  ip: string;
  resolver: ResolverId;
  inputState: InputState;
  busy: boolean;
  onIpChange: (value: string) => void;
  onResolverChange: (value: ResolverId) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <ToolPanelCard className="xl:sticky xl:top-6">
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.reverseIpLookup.inputTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.reverseIpLookup.inputDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <form className="grid gap-5" onSubmit={onSubmit}>
          <TextField
            fullWidth
            className="gap-2"
            isInvalid={inputState.status === "invalid"}
          >
            <Label>{m["tools.ipInfoLookup.ipTarget"]()}</Label>
            <Input
              name="ip"
              dir="ltr"
              className="min-h-11 text-left font-mono text-base [unicode-bidi:isolate]"
              autoComplete="off"
              spellCheck={false}
              value={ip}
              placeholder={m["tools.reverseIpLookup.ipPlaceholder"]()}
              onChange={(event) => onIpChange(event.currentTarget.value)}
            />
            <p
              className={`text-sm ${inputState.status === "invalid" ? "text-danger" : "text-muted"}`}
            >
              {inputState.status === "invalid"
                ? m["tools.reverseIpLookup.invalidIpDescription"]()
                : m["tools.reverseIpLookup.ipDescription"]()}
            </p>
          </TextField>

          <Select
            variant="secondary"
            selectedKey={resolver}
            onSelectionChange={(key) =>
              onResolverChange(String(key) as ResolverId)
            }
          >
            <Label>{m["tools.ipInfoLookup.resolverLabel"]()}</Label>
            <Select.Trigger className="min-h-11 w-full">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Section>
                  <Header className="px-2 py-1 text-xs font-medium text-muted">
                    {m["tools.ipInfoLookup.resolverGroupLabel"]()}
                  </Header>
                  {Object.entries(RESOLVERS).map(([id, item]) => (
                    <ListBox.Item key={id} id={id} textValue={item.label}>
                      {item.label}
                    </ListBox.Item>
                  ))}
                </ListBox.Section>
              </ListBox>
            </Select.Popover>
          </Select>
          <p className="-mt-3 text-sm text-muted">
            {m["tools.reverseIpLookup.resolverDescription"]()}
          </p>

          <Button
            type="submit"
            fullWidth
            isDisabled={inputState.status !== "valid" || busy}
          >
            <Search aria-hidden className="size-4" />
            {busy
              ? m["tools.ipInfoLookup.loadingButton"]()
              : m["tools.reverseIpLookup.lookupButton"]()}
          </Button>
        </form>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ResultsCard({
  resolver,
  inputState,
  busy,
  error,
  result,
}: {
  resolver: ResolverId;
  inputState: InputState;
  busy: boolean;
  error: string;
  result: LookupResult | null;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="flex-row items-start justify-between gap-3 border-b border-separator">
        <div className="grid min-w-0 gap-1">
          <Card.Title>{m["tools.reverseIpLookup.resultTitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.reverseIpLookup.resultDescription"]()}
          </Card.Description>
        </div>
        {inputState.status === "valid" ? (
          <ToolCopyButton
            value={inputState.domain}
            copyLabel={m["tools.reverseIpLookup.copyReverseDomain"]()}
            copiedLabel={m["common.actions.copied"]()}
          />
        ) : null}
      </Card.Header>
      <ToolPanelCardContent className="py-4" aria-live="polite">
        {busy ? (
          <LoadingState />
        ) : inputState.status === "invalid" ? (
          <ErrorState
            title={m["common.cidrInvalidIp"]()}
            description={m["tools.reverseIpLookup.invalidIpDescription"]()}
          />
        ) : error ? (
          <ErrorState
            title={m["tools.dnsLookup.errorTitle"]()}
            description={error}
          />
        ) : result ? (
          <ResultView result={result} />
        ) : (
          <EmptyState
            icon={<Network aria-hidden className="size-5" />}
            title={m["tools.reverseIpLookup.idleTitle"]()}
            description={`${m["tools.reverseIpLookup.idleDescription"]()} ${RESOLVERS[resolver].url}`}
          />
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function LoadingState() {
  return (
    <div
      className="grid min-h-72 content-center gap-4"
      role="status"
      aria-label={m["tools.reverseIpLookup.loadingTitle"]()}
    >
      <Skeleton className="mx-auto size-12 rounded-full" />
      <Skeleton className="mx-auto h-5 w-48 rounded-lg" />
      <Skeleton className="mx-auto h-4 w-72 max-w-full rounded-lg" />
      <span className="sr-only">
        {m["tools.reverseIpLookup.loadingDescription"]()}
      </span>
    </div>
  );
}

function ErrorState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-72 content-center">
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>{title}</Alert.Title>
          <Alert.Description>{description}</Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center">
      <div className="grid max-w-lg justify-items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-default text-muted">
          {icon}
        </span>
        <div className="grid gap-1">
          <h3 className="font-medium">{title}</h3>
          <p className="text-sm break-all text-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}

function ResultView({ result }: { result: LookupResult }) {
  const locale = getLocale();
  const addressFamily =
    result.family === 4
      ? m["shared.cidrTools.cidrParserIpv4Label"]()
      : m["shared.cidrTools.cidrParserIpv6Label"]();
  const answerCount = new Intl.NumberFormat(locale).format(
    result.answers.length,
  );
  const answerText = result.answers
    .map((answer) => answer.rawHostname)
    .join("\n");
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <Chip size="sm">{addressFamily}</Chip>
        <Chip
          size="sm"
          color={result.status === 0 ? "success" : "danger"}
          variant="secondary"
        >
          {result.statusLabel}
        </Chip>
        <Chip size="sm" variant="tertiary">
          {answerCount}
        </Chip>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <SummaryItem
          label={m["tools.reverseIpLookup.reverseDomain"]()}
          value={result.reverseDomain}
        />
        <SummaryItem
          label={m["tools.ipInfoLookup.resolver"]()}
          value={result.endpoint}
        />
        <SummaryItem
          label={m["tools.reverseIpLookup.dnsStatus"]()}
          value={result.statusLabel}
        />
        <SummaryItem
          label={m["common.cidrDetailFamily"]()}
          value={addressFamily}
        />
      </dl>
      <AnswerList result={result} answerText={answerText} />
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

function AnswerList({
  result,
  answerText,
}: {
  result: LookupResult;
  answerText: string;
}) {
  const locale = getLocale();
  if (!result.answers.length) {
    return (
      <EmptyState
        icon={<Network aria-hidden className="size-5" />}
        title={m["tools.reverseIpLookup.noRecordsTitle"]()}
        description={m["tools.reverseIpLookup.noRecordsDescription"]()}
      />
    );
  }
  const number = new Intl.NumberFormat(locale);
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border">
      <header className="flex flex-col gap-3 border-b border-separator p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h3 className="font-medium">
            {m["tools.reverseIpLookup.ptrRecordsTitle"]()}
          </h3>
          <p className="text-sm text-muted">
            {m["tools.reverseIpLookup.ptrRecordsDescription"]()}
          </p>
        </div>
        <ToolCopyButton
          value={answerText}
          copyLabel={m["tools.reverseIpLookup.copyHostnames"]()}
          copiedLabel={m["common.actions.copied"]()}
        />
      </header>
      <dl className="grid gap-3 p-4 md:hidden">
        {result.answers.map((answer) => (
          <div
            key={`${answer.rawHostname}:${answer.ttl}`}
            className="grid gap-3 rounded-xl border border-border p-3"
          >
            <SummaryItem
              label={m["shared.addressTools.hostname"]()}
              value={answer.hostname}
            />
            <div className="grid grid-cols-2 gap-3">
              <SummaryItem
                label={m["tools.dnsLookup.answerTtl"]()}
                value={`${number.format(answer.ttl)} ${m["tools.reverseIpLookup.secondsAbbreviation"]()}`}
              />
              <SummaryItem
                label={m["tools.reverseIpLookup.rawValue"]()}
                value={answer.rawHostname}
              />
            </div>
          </div>
        ))}
      </dl>
      <Table variant="secondary" className="hidden md:block">
        <Table.ScrollContainer>
          <Table.Content
            aria-label={m["tools.reverseIpLookup.ptrRecordsTitle"]()}
          >
            <Table.Header>
              <Table.Column id="hostname" isRowHeader>
                {m["shared.addressTools.hostname"]()}
              </Table.Column>
              <Table.Column id="ttl">
                {m["tools.dnsLookup.answerTtl"]()}
              </Table.Column>
              <Table.Column id="raw">
                {m["tools.reverseIpLookup.rawValue"]()}
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {result.answers.map((answer) => (
                <Table.Row
                  key={`${answer.rawHostname}:${answer.ttl}`}
                  id={`${answer.rawHostname}:${answer.ttl}`}
                >
                  <Table.Cell className="font-mono text-xs break-all">
                    {answer.hostname}
                  </Table.Cell>
                  <Table.Cell className="font-mono text-xs">
                    {number.format(answer.ttl)}{" "}
                    {m["tools.reverseIpLookup.secondsAbbreviation"]()}
                  </Table.Cell>
                  <Table.Cell className="font-mono text-xs break-all text-muted">
                    {answer.rawHostname}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </section>
  );
}

function Article() {
  return (
    <ToolArticle>
      <p>
        {m["tools.reverseIpLookup.articleLeadBeforePtr"]()}
        <code>PTR</code>
        {m["tools.reverseIpLookup.articleLeadAfterPtr"]()}
      </p>
      <h2>{m["tools.reverseIpLookup.articleChecksTitle"]()}</h2>
      <p>
        {m["tools.reverseIpLookup.articleChecksBeforeIpv4"]()}
        <code>in-addr.arpa</code>
        {m["tools.reverseIpLookup.articleChecksBetween"]()}
        <code>ip6.arpa</code>
        {m["tools.reverseIpLookup.articleChecksAfterIpv6"]()}
      </p>
      <h2>{m["tools.reverseIpLookup.articleQueryTitle"]()}</h2>
      <p>
        {m["tools.reverseIpLookup.articleQueryBeforePtr"]()}
        <code>PTR</code>
        {m["tools.reverseIpLookup.articleQueryAfterPtr"]()}
      </p>
      <h2>{m["tools.reverseIpLookup.articleMissingTitle"]()}</h2>
      <p>
        {m["tools.reverseIpLookup.articleMissingBeforePtr"]()}
        <code>PTR</code>
        {m["tools.reverseIpLookup.articleMissingAfterPtr"]()}
      </p>
      <h2>{m["shared.aesTools.decryptarticlenotestitle"]()}</h2>
      <ul>
        {[
          m["tools.reverseIpLookup.articleNotes0"](),
          m["tools.reverseIpLookup.articleNotes1"](),
          m["tools.reverseIpLookup.articleNotes2"](),
        ].map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </ToolArticle>
  );
}

export default function ReverseIpLookup() {
  return (
    <ToolPage>
      <ReverseIpLookupContent />
    </ToolPage>
  );
}
