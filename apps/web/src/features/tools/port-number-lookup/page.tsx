import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Card,
  Chip,
  InputGroup,
  Pagination,
  Table,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Network, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getLocale } from "@/paraglide/runtime.js";
import { m } from "@/paraglide/messages.js";
import { lookupReference } from "./logic";
import { PORT_FILTERS } from "@workspace/tools/network/ports";

type Filter = (typeof PORT_FILTERS)[number];
type PortRow = Extract<
  ReturnType<typeof lookupReference>["entries"][number],
  { port: number }
>;

const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 200;
const STORAGE_PREFIX = "tools:port-number-lookup";

function PortNumberLookupPageContent() {
  const locale = getLocale();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query, SEARCH_DELAY_MS);
  const result = useMemo(
    () => lookupReference("port-number-lookup", debouncedQuery, filter, locale),
    [debouncedQuery, filter, locale],
  );
  const entries = result.entries as PortRow[];
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStartIndex = (currentPage - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);
  const rangeStart = pageEntries.length === 0 ? 0 : pageStartIndex + 1;
  const rangeEnd = pageStartIndex + pageEntries.length;
  const formatNumber = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const resultCount = formatNumber.format(entries.length);

  useEffect(() => {
    try {
      const storedQuery = localStorage.getItem(`${STORAGE_PREFIX}:search`);
      const storedFilter = localStorage.getItem(`${STORAGE_PREFIX}:category`);
      if (storedQuery !== null) setQuery(storedQuery);
      if (PORT_FILTERS.includes(storedFilter as Filter)) {
        setFilter(storedFilter as Filter);
      }
    } catch {
      // Persistence is optional; the lookup itself stays browser-local.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}:search`, query);
      localStorage.setItem(`${STORAGE_PREFIX}:category`, filter);
    } catch {
      // Storage can be unavailable without affecting the lookup.
    }
  }, [filter, query]);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <div
        className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
        data-tool-panels
      >
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.httpStatusCodeLookup.filtersTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.portNumberLookup.filtersDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <InputGroup variant="secondary" fullWidth>
              <InputGroup.Prefix>
                <Search aria-hidden className="size-4" />
              </InputGroup.Prefix>
              <InputGroup.Input
                type="search"
                name="port-search"
                autoComplete="off"
                spellCheck={false}
                maxLength={1000}
                aria-label={m["tools.portNumberLookup.searchPlaceholder"]()}
                value={query}
                placeholder={m["tools.portNumberLookup.searchPlaceholder"]()}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setPage(1);
                }}
              />
            </InputGroup>
            <ToggleButtonGroup
              selectionMode="single"
              selectedKeys={new Set([filter])}
              aria-label={m["shared.referenceLookups.portname"]()}
              isDetached
              className="flex w-full flex-wrap gap-2"
              onSelectionChange={(selection) => {
                const next = String([...selection][0] ?? "");
                if (PORT_FILTERS.includes(next as Filter)) {
                  setFilter(next as Filter);
                  setPage(1);
                }
              }}
            >
              {PORT_FILTERS.map((category) => (
                <ToggleButton key={category} id={category} size="sm">
                  {categoryLabel(category)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <Card.Title>
                  {m["tools.portNumberLookup.resultsTitle"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.portNumberLookup.resultsCount"]({
                    count: resultCount,
                  })}
                </Card.Description>
              </div>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="p-0">
            {pageEntries.length ? (
              <Table variant="secondary">
                <Table.ScrollContainer className="h-128">
                  <Table.Content
                    aria-label={m["shared.referenceLookups.portname"]()}
                    className="min-w-2xl"
                  >
                    <Table.Header className="sticky top-0 z-10">
                      <Table.Column id="port" isRowHeader className="w-24">
                        {m["shared.addressTools.port"]()}
                      </Table.Column>
                      <Table.Column id="service" className="min-w-52">
                        {m["tools.portNumberLookup.service"]()}
                      </Table.Column>
                      <Table.Column id="protocol" className="min-w-32">
                        {m["shared.addressTools.protocol"]()}
                      </Table.Column>
                      <Table.Column id="description" className="min-w-72">
                        {m["common.favicondescriptionlabel"]()}
                      </Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {pageEntries.map((entry) => (
                        <Table.Row
                          key={`${entry.port}-${entry.protocol}`}
                          id={`${entry.port}-${entry.protocol}`}
                        >
                          <Table.Cell className="align-top font-mono font-semibold">
                            {entry.port}
                          </Table.Cell>
                          <Table.Cell className="align-top">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono">{entry.service}</span>
                              {entry.common ? (
                                <Chip size="sm" variant="secondary">
                                  {m["shared.referenceLookups.common"]()}
                                </Chip>
                              ) : null}
                            </div>
                          </Table.Cell>
                          <Table.Cell className="align-top">
                            <Chip
                              size="sm"
                              variant="tertiary"
                              color={protocolColor(entry.protocol)}
                            >
                              {entry.protocol}
                            </Chip>
                          </Table.Cell>
                          <Table.Cell className="align-top text-sm leading-6 text-muted">
                            {entry.description}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            ) : (
              <div className="flex min-h-64 items-center justify-center p-6 text-center">
                <div className="grid max-w-sm justify-items-center gap-2">
                  <Network aria-hidden className="size-5 text-muted" />
                  <p className="font-medium">
                    {m["tools.portNumberLookup.noResultsTitle"]()}
                  </p>
                  <p className="text-sm text-muted">
                    {m["tools.portNumberLookup.noResultsDescription"]()}
                  </p>
                </div>
              </div>
            )}
          </ToolPanelCardContent>
          {pageEntries.length ? (
            <ToolPanelCardFooter className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
              <p className="text-sm text-muted sm:justify-self-start">
                {formatNumber.format(rangeStart)}-
                {formatNumber.format(rangeEnd)} /{" "}
                {formatNumber.format(entries.length)}
              </p>
              <Pagination
                aria-label={m["tools.portNumberLookup.resultsTitle"]()}
                className="justify-center sm:justify-self-center"
              >
                <Pagination.Content>
                  <Pagination.Item>
                    <Pagination.Previous
                      isDisabled={currentPage === 1}
                      onPress={() => setPage((value) => Math.max(1, value - 1))}
                    >
                      <Pagination.PreviousIcon />
                      <span className="sr-only">
                        {m["tools.portNumberLookup.paginationPreviousPage"]()}
                      </span>
                    </Pagination.Previous>
                  </Pagination.Item>
                  {Array.from({ length: pageCount }, (_, index) => {
                    const pageNumber = index + 1;
                    return (
                      <Pagination.Item key={pageNumber}>
                        <Pagination.Link
                          isActive={pageNumber === currentPage}
                          onPress={() => setPage(pageNumber)}
                        >
                          {pageNumber}
                        </Pagination.Link>
                      </Pagination.Item>
                    );
                  })}
                  <Pagination.Item>
                    <Pagination.Next
                      isDisabled={currentPage === pageCount}
                      onPress={() =>
                        setPage((value) => Math.min(pageCount, value + 1))
                      }
                    >
                      <Pagination.NextIcon />
                      <span className="sr-only">
                        {m["tools.portNumberLookup.paginationNextPage"]()}
                      </span>
                    </Pagination.Next>
                  </Pagination.Item>
                </Pagination.Content>
              </Pagination>
              <span aria-hidden className="hidden sm:block" />
            </ToolPanelCardFooter>
          ) : null}
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.portNumberLookup.aboutTitle"]()}</h2>
        <p>{m["tools.portNumberLookup.aboutDescription"]()}</p>
        <h3>{m["tools.portNumberLookup.systemPorts"]()}</h3>
        <p>{m["tools.portNumberLookup.systemPortsDesc"]()}</p>
        <h3>{m["tools.portNumberLookup.registeredPorts"]()}</h3>
        <p>{m["tools.portNumberLookup.registeredPortsDesc"]()}</p>
        <h3>{m["tools.portNumberLookup.dynamicPorts"]()}</h3>
        <p>{m["tools.portNumberLookup.dynamicPortsDesc"]()}</p>
      </ToolArticle>
    </div>
  );
}

function categoryLabel(category: Filter) {
  if (category === "common") return m["shared.referenceLookups.common"]();
  if (category === "system") return m["tools.portNumberLookup.system"]();
  if (category === "registered")
    return m["tools.portNumberLookup.registered"]();
  return m["shared.crcChecksum.all"]();
}

function protocolColor(protocol: PortRow["protocol"]) {
  if (protocol === "TCP") return "accent" as const;
  if (protocol === "UDP") return "warning" as const;
  return "default" as const;
}

export default function PortNumberLookupPage() {
  return (
    <ToolPage>
      <PortNumberLookupPageContent />
    </ToolPage>
  );
}
