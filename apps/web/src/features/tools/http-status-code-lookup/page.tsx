import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Card,
  Chip,
  InputGroup,
  Table,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { lookupReference } from "./logic";
import { STATUS_FILTERS } from "@workspace/tools/network/http-status";

type Filter = (typeof STATUS_FILTERS)[number];
type StatusRow = Extract<
  ReturnType<typeof lookupReference>["entries"][number],
  { code: number }
>;
const STORAGE_PREFIX = "tools:http-status-code-lookup";

function HttpStatusCodeLookupContent() {
  const locale = getLocale();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const deferredQuery = useDeferredValue(query);
  const result = useMemo(
    () =>
      lookupReference("http-status-code-lookup", deferredQuery, filter, locale),
    [deferredQuery, filter, locale],
  );
  const rows = result.entries as StatusRow[];
  const count = new Intl.NumberFormat(locale).format(result.count);
  useEffect(() => {
    try {
      const storedQuery = localStorage.getItem(`${STORAGE_PREFIX}:search`);
      const storedFilter = localStorage.getItem(`${STORAGE_PREFIX}:category`);
      if (storedQuery !== null) setQuery(storedQuery);
      if (STATUS_FILTERS.includes(storedFilter as Filter))
        setFilter(storedFilter as Filter);
    } catch {
      // Persistence is optional.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}:search`, query);
      localStorage.setItem(`${STORAGE_PREFIX}:category`, filter);
    } catch {
      // Lookup remains available if storage is blocked.
    }
  }, [filter, query]);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.httpStatusCodeLookup.filtersTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.httpStatusCodeLookup.filtersDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <InputGroup variant="secondary" fullWidth>
              <InputGroup.Prefix>
                <Search aria-hidden className="size-4" />
              </InputGroup.Prefix>
              <InputGroup.Input
                type="search"
                name="status-search"
                autoComplete="off"
                spellCheck={false}
                maxLength={1000}
                aria-label={m["tools.httpStatusCodeLookup.searchPlaceholder"]()}
                value={query}
                placeholder={m[
                  "tools.httpStatusCodeLookup.searchPlaceholder"
                ]()}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </InputGroup>
            <ToggleButtonGroup
              isDetached
              selectionMode="single"
              selectedKeys={new Set([filter])}
              aria-label={m["shared.referenceLookups.filter"]()}
              className="flex w-full flex-wrap gap-2"
              onSelectionChange={(selection) => {
                const next = String([...selection][0] ?? "");
                if (STATUS_FILTERS.includes(next as Filter))
                  setFilter(next as Filter);
              }}
            >
              {STATUS_FILTERS.map((item) => (
                <ToggleButton key={item} id={item} size="sm">
                  {filterLabel(item)}
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
                  {m["tools.httpStatusCodeLookup.resultsTitle"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.httpStatusCodeLookup.resultsCount"]({ count })}
                </Card.Description>
              </div>
              <Chip size="sm" variant="secondary">
                {count}
              </Chip>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="p-0">
            {rows.length ? (
              <Table variant="secondary">
                <Table.ScrollContainer className="max-h-168">
                  <Table.Content
                    aria-label={m["shared.referenceLookups.statusname"]()}
                  >
                    <Table.Header className="sticky top-0 z-10 bg-surface">
                      <Table.Column id="code" isRowHeader className="w-24">
                        {m["tools.codeScreenshotGenerator.codeTitle"]()}
                      </Table.Column>
                      <Table.Column id="name" className="min-w-52">
                        {m["common.uaFieldName"]()}
                      </Table.Column>
                      <Table.Column id="category" className="min-w-44">
                        {m["shared.referenceLookups.filter"]()}
                      </Table.Column>
                      <Table.Column id="description" className="min-w-80">
                        {m["common.favicondescriptionlabel"]()}
                      </Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {rows.map((row) => (
                        <Table.Row key={row.code} id={String(row.code)}>
                          <Table.Cell className="align-top font-mono font-semibold">
                            {row.code}
                          </Table.Cell>
                          <Table.Cell className="align-top">
                            <div className="grid gap-2">
                              <span className="font-medium">{row.name}</span>
                              {row.common ? (
                                <Chip size="sm" variant="tertiary">
                                  {m["shared.referenceLookups.common"]()}
                                </Chip>
                              ) : null}
                            </div>
                          </Table.Cell>
                          <Table.Cell className="align-top">
                            <Chip
                              size="sm"
                              variant="tertiary"
                              color={categoryColor(row.category)}
                            >
                              {categoryLabel(row.category)}
                            </Chip>
                          </Table.Cell>
                          <Table.Cell className="align-top text-sm leading-6 text-muted">
                            {row.description}
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
                  <Search aria-hidden className="size-5 text-muted" />
                  <p className="font-medium">
                    {m["tools.httpStatusCodeLookup.noResultsTitle"]()}
                  </p>
                  <p className="text-sm text-muted">
                    {m["tools.httpStatusCodeLookup.noResultsDescription"]()}
                  </p>
                </div>
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.httpStatusCodeLookup.articleWhatTitle"]()}</h2>
        <p>{m["tools.httpStatusCodeLookup.articleWhatBody"]()}</p>
        <h3>{m["tools.httpStatusCodeLookup.articleFamiliesTitle"]()}</h3>
        <ul>
          {(
            [
              [
                m["tools.httpStatusCodeLookup.articleFamilies0Title"](),
                m["tools.httpStatusCodeLookup.articleFamilies0Body"](),
              ],
              [
                m["tools.httpStatusCodeLookup.articleFamilies1Title"](),
                m["tools.httpStatusCodeLookup.articleFamilies1Body"](),
              ],
              [
                m["tools.httpStatusCodeLookup.articleFamilies2Title"](),
                m["tools.httpStatusCodeLookup.articleFamilies2Body"](),
              ],
              [
                m["tools.httpStatusCodeLookup.articleFamilies3Title"](),
                m["tools.httpStatusCodeLookup.articleFamilies3Body"](),
              ],
              [
                m["tools.httpStatusCodeLookup.articleFamilies4Title"](),
                m["tools.httpStatusCodeLookup.articleFamilies4Body"](),
              ],
            ] as const
          ).map(([title, body]) => (
            <li key={title}>
              <strong>{title}</strong> {body}
            </li>
          ))}
        </ul>
        <h3>{m["tools.httpStatusCodeLookup.articleWhenTitle"]()}</h3>
        <p>{m["tools.httpStatusCodeLookup.articleWhenBody"]()}</p>
        <h3>{m["tools.httpStatusCodeLookup.articleWhyTitle"]()}</h3>
        <p>{m["tools.httpStatusCodeLookup.articleWhyBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function filterLabel(filter: Filter) {
  if (filter === "common") return m["shared.referenceLookups.common"]();
  if (filter === "informational")
    return m["tools.httpStatusCodeLookup.informationalFilter"]();
  if (filter === "success")
    return m["tools.httpStatusCodeLookup.successFilter"]();
  if (filter === "redirection")
    return m["tools.httpStatusCodeLookup.redirectionFilter"]();
  if (filter === "client-error")
    return m["tools.httpStatusCodeLookup.errorFilter"]();
  if (filter === "server-error")
    return m["tools.httpStatusCodeLookup.serverErrorFilter"]();
  return m["common.projectall"]();
}

function categoryLabel(category: StatusRow["category"]) {
  if (category === "informational")
    return m["tools.httpStatusCodeLookup.informational"]();
  if (category === "success") return m["tools.httpStatusCodeLookup.success"]();
  if (category === "redirection")
    return m["shared.referenceLookups.redirect"]();
  if (category === "client-error")
    return m["tools.httpStatusCodeLookup.error"]();
  return m["tools.httpStatusCodeLookup.serverError"]();
}

function categoryColor(category: StatusRow["category"]) {
  if (category === "success") return "success" as const;
  if (category === "client-error" || category === "server-error")
    return "danger" as const;
  if (category === "redirection") return "warning" as const;
  return "default" as const;
}

export default function HttpStatusCodeLookup() {
  return (
    <ToolPage>
      <HttpStatusCodeLookupContent />
    </ToolPage>
  );
}
