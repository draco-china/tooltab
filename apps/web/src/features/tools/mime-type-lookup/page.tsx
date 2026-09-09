import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Chip,
  InputGroup,
  Table,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { ArrowRight, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { lookupMime, MIME_FILTERS } from "@workspace/tools/network/mime";

type Filter = (typeof MIME_FILTERS)[number];
const PAGE_SIZE = 20;

function MimeTypeLookupContent() {
  const locale = getLocale();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query);
  const result = useMemo(
    () => lookupMime(deferredQuery, filter),
    [deferredQuery, filter],
  );
  const entries = result.entries;
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStartIndex = (currentPage - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);
  const rangeStart = pageEntries.length === 0 ? 0 : pageStartIndex + 1;
  const rangeEnd = pageStartIndex + pageEntries.length;
  const formatNumber = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const resultCount = formatNumber.format(entries.length);

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
              {m["tools.mimeTypeLookup.filtersDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <InputGroup variant="secondary" fullWidth>
              <InputGroup.Prefix>
                <Search aria-hidden className="size-4" />
              </InputGroup.Prefix>
              <InputGroup.Input
                type="search"
                name="mime-search"
                autoComplete="off"
                spellCheck={false}
                maxLength={1000}
                aria-label={m["tools.mimeTypeLookup.searchPlaceholder"]()}
                value={query}
                placeholder={m["tools.mimeTypeLookup.searchPlaceholder"]()}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setPage(1);
                }}
              />
            </InputGroup>

            <ToggleButtonGroup
              selectionMode="single"
              selectedKeys={new Set([filter])}
              aria-label={m["shared.referenceLookups.filter"]()}
              isDetached
              className="flex w-full flex-wrap gap-2"
              onSelectionChange={(selection) => {
                const next = String([...selection][0] ?? "");
                if (MIME_FILTERS.includes(next as Filter)) {
                  setFilter(next as Filter);
                  setPage(1);
                }
              }}
            >
              {MIME_FILTERS.map((category) => (
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
                  {m["tools.mimeTypeLookup.resultsTitle"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.mimeTypeLookup.resultsCount"]({
                    count: resultCount,
                  })}
                </Card.Description>
              </div>
              <Chip size="sm" variant="secondary">
                {resultCount}
              </Chip>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="p-0">
            <Table variant="secondary">
              <Table.ScrollContainer className="h-168">
                <Table.Content
                  aria-label={m["shared.referenceLookups.mimename"]()}
                >
                  <Table.Header className="sticky top-0 z-10 bg-surface">
                    <Table.Column
                      id="mimeType"
                      isRowHeader
                      className="min-w-64"
                    >
                      {m["tools.dataUriToFileConverter.mimeTypeLabel"]()}
                    </Table.Column>
                    <Table.Column id="extensions" className="min-w-48">
                      {m["tools.mimeTypeLookup.extensions"]()}
                    </Table.Column>
                    <Table.Column id="category" className="min-w-36">
                      {m["shared.referenceLookups.filter"]()}
                    </Table.Column>
                    <Table.Column id="source" className="min-w-24">
                      {m["shared.referenceLookups.source"]()}
                    </Table.Column>
                    <Table.Column id="compressible" className="min-w-32">
                      {m["shared.referenceLookups.compressible"]()}
                    </Table.Column>
                    <Table.Column id="charset" className="min-w-28">
                      {m["shared.referenceLookups.charset"]()}
                    </Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {pageEntries.map((entry) => (
                      <Table.Row key={entry.mimeType} id={entry.mimeType}>
                        <Table.Cell className="align-top font-mono text-xs sm:text-sm">
                          {entry.mimeType}
                        </Table.Cell>
                        <Table.Cell className="align-top font-mono text-xs sm:text-sm">
                          {entry.extensions.length
                            ? entry.extensions.join(", ")
                            : "—"}
                        </Table.Cell>
                        <Table.Cell className="align-top">
                          <Chip
                            size="sm"
                            variant="tertiary"
                            color={categoryColor(entry.category)}
                          >
                            {categoryLabel(entry.category)}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell className="align-top">
                          {entry.source ? (
                            <Chip size="sm" variant="tertiary">
                              {entry.source.toUpperCase()}
                            </Chip>
                          ) : (
                            "—"
                          )}
                        </Table.Cell>
                        <Table.Cell className="align-top">
                          {entry.compressible === undefined ? (
                            "—"
                          ) : (
                            <Chip
                              size="sm"
                              variant="tertiary"
                              color={entry.compressible ? "success" : "default"}
                            >
                              {entry.compressible
                                ? m["shared.crcChecksum.yes"]()
                                : m["shared.crcChecksum.no"]()}
                            </Chip>
                          )}
                        </Table.Cell>
                        <Table.Cell className="align-top font-mono text-xs sm:text-sm">
                          {entry.charset ?? "—"}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {formatNumber.format(rangeStart)}-{formatNumber.format(rangeEnd)}{" "}
              / {formatNumber.format(entries.length)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="tertiary"
                isIconOnly
                aria-label={m["tools.mimeTypeLookup.previousPage"]()}
                isDisabled={currentPage === 1}
                onPress={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ArrowRight aria-hidden className="size-3.5 rotate-180" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="tertiary"
                isIconOnly
                aria-label={m["tools.mimeTypeLookup.nextPage"]()}
                isDisabled={currentPage === pageCount}
                onPress={() =>
                  setPage((value) => Math.min(pageCount, value + 1))
                }
              >
                <ArrowRight aria-hidden className="size-3.5" />
              </Button>
            </div>
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.mimeTypeLookup.articleTitle"]()}</h2>
        <p>{m["tools.mimeTypeLookup.articleBody"]()}</p>
        <ul>
          {[
            {
              title: m["tools.mimeTypeLookup.articleCategories0Title"](),
              body: m["tools.mimeTypeLookup.articleCategories0Body"](),
            },
            {
              title: m["tools.mimeTypeLookup.articleCategories1Title"](),
              body: m["tools.mimeTypeLookup.articleCategories1Body"](),
            },
            {
              title: m["tools.mimeTypeLookup.articleCategories2Title"](),
              body: m["tools.mimeTypeLookup.articleCategories2Body"](),
            },
            {
              title: m["tools.mimeTypeLookup.articleCategories3Title"](),
              body: m["tools.mimeTypeLookup.articleCategories3Body"](),
            },
            {
              title: m["tools.mimeTypeLookup.articleCategories4Title"](),
              body: m["tools.mimeTypeLookup.articleCategories4Body"](),
            },
            {
              title: m["tools.mimeTypeLookup.articleCategories5Title"](),
              body: m["tools.mimeTypeLookup.articleCategories5Body"](),
            },
            {
              title: m["tools.mimeTypeLookup.articleCategories6Title"](),
              body: m["tools.mimeTypeLookup.articleCategories6Body"](),
            },
            {
              title: m["tools.mimeTypeLookup.articleCategories7Title"](),
              body: m["tools.mimeTypeLookup.articleCategories7Body"](),
            },
          ].map((category) => (
            <li key={category.title}>
              <strong>{category.title}</strong> {category.body}
            </li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

function categoryLabel(category: string) {
  if (category === "all") return m["common.projectall"]();
  if (category === "application")
    return m["tools.mimeTypeLookup.application"]();
  if (category === "audio") return m["tools.mimeTypeLookup.radioaudio"]();
  if (category === "font") return m["shared.pdfEditing.font"]();
  if (category === "image") return m["tools.mimeTypeLookup.image"]();
  if (category === "message") return m["shared.qrTools.message"]();
  if (category === "model") return m["tools.mimeTypeLookup.model"]();
  if (category === "multipart") return m["tools.mimeTypeLookup.multipart"]();
  if (category === "text")
    return m["shared.aesTools.decrypttextplaintextlabel"]();
  if (category === "video") return m["tools.camera.videoMode"]();
  return m["tools.userAgentParser.devUnknown"]();
}

function categoryColor(category: string) {
  if (category === "image") return "accent" as const;
  if (category === "unknown") return "danger" as const;
  return "default" as const;
}

export default function MimeTypeLookup() {
  return (
    <ToolPage>
      <MimeTypeLookupContent />
    </ToolPage>
  );
}
