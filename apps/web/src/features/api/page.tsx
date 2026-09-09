import {
  Disclosure,
  Link,
  SearchField,
  Skeleton,
  Surface,
  Tabs,
} from "@heroui/react";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parse, stringify } from "yaml";
import { CodeBlock } from "@/components/base/code-block";
import { toolById } from "@/features/tools/catalog/discovery";
import { apiOrigin } from "@/lib/site-origin";
import { m } from "@/paraglide/messages.js";
import type { Locale } from "@/paraglide/runtime.js";

type Schema = Record<string, unknown>;
type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
type Operation = {
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: unknown[];
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, unknown>;
};
type ApiDocument = {
  info?: { version?: string };
  tags?: Array<{ name: string }>;
  paths?: Record<string, Partial<Record<HttpMethod, Operation>>>;
};
type Endpoint = Operation & { method: HttpMethod; path: string };
type LocalizedEndpoint = Endpoint & { displaySummary?: string };

const methods: HttpMethod[] = ["get", "post", "put", "patch", "delete"];

export function ApiPage({ locale }: { locale: Locale }) {
  const [document, setDocument] = useState<ApiDocument>();
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => hashSelection());

  useEffect(() => {
    let active = true;
    fetch("/api/v1/openapi.yaml")
      .then(async (response) => {
        if (!response.ok) throw new Error("OpenAPI request failed");
        return parse(await response.text()) as ApiDocument;
      })
      .then((value) => {
        if (active) setDocument(value);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const selectHash = () => setExpanded(hashSelection());
    window.addEventListener("hashchange", selectHash);
    return () => window.removeEventListener("hashchange", selectHash);
  }, []);

  const endpoints = useMemo(() => collectEndpoints(document), [document]);
  const localizedEndpoints = useMemo(
    () =>
      endpoints.map((endpoint) => ({
        ...endpoint,
        displaySummary: endpointSummary(endpoint, locale),
      })),
    [endpoints, locale],
  );
  const visible = useMemo(() => {
    const terms = query
      .trim()
      .toLocaleLowerCase(locale)
      .split(/\s+/)
      .filter(Boolean);
    return localizedEndpoints.filter((endpoint) => {
      const searchable =
        `${endpoint.method} ${endpoint.path} ${endpoint.displaySummary ?? ""} ${endpoint.summary ?? ""} ${endpoint.description ?? ""}`.toLocaleLowerCase(
          locale,
        );
      return (
        (tag === "all" || endpoint.tags?.includes(tag)) &&
        terms.every((term) => searchable.includes(term))
      );
    });
  }, [localizedEndpoints, locale, query, tag]);
  const tags = document?.tags?.map(({ name }) => name) ?? [];

  useEffect(() => {
    if (!document || !window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    requestAnimationFrame(() => documentById(id)?.scrollIntoView());
  }, [document]);

  function changeExpanded(id: string, isExpanded: boolean) {
    setExpanded((current) => {
      const next = new Set(current);
      if (isExpanded) {
        next.add(id);
        window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
      } else {
        next.delete(id);
        if (decodeURIComponent(window.location.hash.slice(1)) === id)
          window.history.replaceState(null, "", window.location.pathname);
      }
      return next;
    });
  }

  return (
    <main className="grid min-w-0 gap-10 pb-10">
      <header className="max-w-4xl pt-4 sm:pt-8 lg:pt-14">
        <h1 className="text-4xl font-semibold tracking-[-0.045em] text-balance sm:text-5xl">
          {m["apiMcp.apititle"]({}, { locale })}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
          {m["apiMcp.apiintro"]({}, { locale })}
        </p>
      </header>
      <section
        aria-label={m["apiMcp.explorer.endpoints"]()}
        className="min-w-0"
      >
        <Tabs
          selectedKey={tag}
          onSelectionChange={(key) => setTag(String(key))}
          variant="secondary"
          className="w-full max-w-full min-w-0 gap-4 overflow-hidden"
        >
          <Surface className="rounded-xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">
                {document?.info?.version
                  ? `OpenAPI ${document.info.version} · ${endpoints.length} ${m["apiMcp.explorer.operations"]()}`
                  : m["apiMcp.explorer.loading"]()}
              </p>
              {document ? (
                <span
                  aria-live="polite"
                  className="text-sm text-muted tabular-nums"
                >
                  {visible.length} {m["apiMcp.explorer.results"]()}
                </span>
              ) : null}
            </div>

            <SearchField
              aria-label={m["apiMcp.explorer.search"]()}
              value={query}
              onChange={setQuery}
              fullWidth
              variant="secondary"
              className="mt-4 max-w-2xl"
            >
              <SearchField.Group className="min-h-11 rounded-xl">
                <SearchField.SearchIcon />
                <SearchField.Input
                  placeholder={m["apiMcp.explorer.search"]()}
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-separator pt-4">
              <Tabs.ListContainer>
                <Tabs.List aria-label={m["apiMcp.explorer.filters"]()}>
                  {["all", ...tags].map((name) => (
                    <Tabs.Tab
                      key={name}
                      id={name}
                      className="min-h-8 px-2.5 text-xs"
                    >
                      {name === "all"
                        ? m["apiMcp.explorer.all"]()
                        : tagLabel(name, locale)}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
              <div className="flex flex-wrap gap-2">
                <DownloadLink href="/api/v1/openapi.yaml">
                  {m["apiMcp.apidownloadyaml"]({}, { locale })}
                </DownloadLink>
                <DownloadLink href="/api/v1/openapi.json">
                  {m["apiMcp.apidownloadjson"]({}, { locale })}
                </DownloadLink>
              </div>
            </div>
          </Surface>
          <Tabs.Panel
            id={tag}
            className="m-0 w-full max-w-full min-w-0 overflow-hidden p-0"
          >
            {loadError ? (
              <ApiState message={m["apiMcp.explorer.error"]()} tone="danger" />
            ) : visible.length ? (
              <Surface className="divide-y divide-separator overflow-hidden rounded-xl border border-border bg-surface px-4 sm:px-5">
                {visible.map((endpoint) => (
                  <EndpointDisclosure
                    key={endpoint.operationId}
                    endpoint={endpoint}
                    isExpanded={expanded.has(endpoint.operationId)}
                    onExpandedChange={(value) =>
                      changeExpanded(endpoint.operationId, value)
                    }
                  />
                ))}
              </Surface>
            ) : document ? (
              <ApiState message={m["apiMcp.explorer.empty"]()} />
            ) : (
              <ApiExplorerSkeleton label={m["apiMcp.explorer.loading"]()} />
            )}
          </Tabs.Panel>
        </Tabs>
      </section>
    </main>
  );
}

function ApiState({
  message,
  tone = "muted",
}: {
  message: string;
  tone?: "muted" | "danger";
}) {
  return (
    <Surface className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <p
        className={`text-sm ${tone === "danger" ? "text-danger" : "text-muted"}`}
      >
        {message}
      </p>
    </Surface>
  );
}

function ApiExplorerSkeleton({ label }: { label: string }) {
  return (
    <Surface
      className="rounded-xl border border-border bg-surface px-4 py-2 sm:px-5"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {["upload", "artifact", "tools", "openapi"].map((row) => (
        <div
          key={row}
          className="grid min-h-20 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 border-b border-separator last:border-b-0"
        >
          <Skeleton className="h-4 w-10 rounded" />
          <div className="grid gap-2">
            <Skeleton className="h-4 w-2/3 max-w-md rounded" />
            <Skeleton className="h-3 w-1/2 max-w-xs rounded" />
          </div>
        </div>
      ))}
    </Surface>
  );
}

function EndpointDisclosure({
  endpoint,
  isExpanded,
  onExpandedChange,
}: {
  endpoint: LocalizedEndpoint;
  isExpanded: boolean;
  onExpandedChange: (value: boolean) => void;
}) {
  const schema = firstRequestSchema(endpoint);
  const request = requestDefinition(
    endpoint,
    schema,
    m["apiMcp.explorer.noBody"](),
  );
  return (
    <div
      id={endpoint.operationId}
      className="max-w-full min-w-0 scroll-mt-24 overflow-hidden"
    >
      <Disclosure
        isExpanded={isExpanded}
        onExpandedChange={onExpandedChange}
        className="max-w-full min-w-0 overflow-hidden transition-colors duration-200 hover:bg-default/35"
      >
        <Disclosure.Heading>
          <Disclosure.Trigger className="relative min-h-14 w-full min-w-0 items-center py-3 pe-8 text-start">
            <span className="grid min-w-0 flex-1 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3">
              <span className="w-14 shrink-0 font-mono text-xs font-semibold text-accent uppercase">
                {endpoint.method}
              </span>
              <span className="min-w-0">
                <code className="text-sm break-all">{endpoint.path}</code>
                <span className="mt-1 block text-sm leading-5 wrap-anywhere text-muted">
                  {endpoint.displaySummary}
                </span>
              </span>
            </span>
            <Disclosure.Indicator className="absolute inset-e-0 top-1/2 shrink-0 -translate-y-1/2" />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content className="max-w-full min-w-0 overflow-hidden">
          {isExpanded ? (
            <Disclosure.Body className="ps-0 pb-7 sm:ps-17">
              <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                <CodeBlock
                  code={curlExample(endpoint)}
                  title={m["apiMcp.explorer.curl"]()}
                  language="shell"
                  wrap
                />
                <CodeBlock
                  code={stringify(request, { lineWidth: 0 })}
                  title={
                    schema
                      ? m["apiMcp.explorer.request"]()
                      : m["apiMcp.explorer.parameters"]()
                  }
                  language="yaml"
                  wrap
                />
              </div>
              <CodeBlock
                code={stringify(endpoint.responses ?? {}, { lineWidth: 0 })}
                title={m["apiMcp.explorer.responses"]()}
                language="yaml"
                wrap
                className="mt-5"
              />
            </Disclosure.Body>
          ) : null}
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}

function DownloadLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-default px-3 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-default/70"
    >
      <Download aria-hidden className="size-4" />
      {children}
    </Link>
  );
}

function collectEndpoints(document?: ApiDocument) {
  if (!document?.paths) return [];
  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    methods.flatMap((method) => {
      const operation = pathItem[method];
      return operation ? [{ ...operation, method, path }] : [];
    }),
  );
}

function endpointSummary(endpoint: Endpoint, locale: Locale) {
  if (locale !== "zh-CN") return endpoint.summary ?? endpoint.description;
  const toolId = endpoint.path.match(/^\/api\/v1\/tools\/([^/]+)$/)?.[1];
  const tool = toolId ? toolById.get(toolId) : undefined;
  if (tool) return tool.descriptionMessage({}, { locale });
  const summary = localizedEndpointSummaries[endpoint.operationId];
  return summary?.({}, { locale }) ?? endpoint.summary ?? endpoint.description;
}

function tagLabel(tag: string, locale: Locale) {
  if (locale !== "zh-CN") return tag;
  const label = localizedTagLabels[tag];
  return label?.({}, { locale }) ?? tag;
}

function firstRequestSchema(operation: Operation) {
  const content = operation.requestBody?.content;
  if (!content) return undefined;
  return Object.values(content)[0]?.schema;
}

function requestDefinition(
  operation: Operation,
  schema: Schema | undefined,
  noBody: string,
) {
  if (schema && operation.parameters)
    return { parameters: operation.parameters, requestBody: schema };
  return schema ?? operation.parameters ?? { description: noBody };
}

function curlExample(endpoint: Endpoint) {
  const url = `${apiOrigin()}${endpoint.path}`;
  if (endpoint.method === "get" || endpoint.method === "delete")
    return `curl --fail-with-body ${endpoint.method === "delete" ? "-X DELETE " : ""}${url}`;
  if (endpoint.path === "/api/v1/uploads")
    return `curl --fail-with-body -X POST \\\n  -H 'Content-Type: application/octet-stream' \\\n  --data-binary @input.bin '${url}?toolId=png-optimizer'`;
  return `curl --fail-with-body -X ${endpoint.method.toUpperCase()} \\\n  -H 'Content-Type: application/json' \\\n  -d '{}' ${url}`;
}

function hashSelection() {
  if (typeof window === "undefined" || !window.location.hash)
    return new Set<string>();
  return new Set([decodeURIComponent(window.location.hash.slice(1))]);
}

function documentById(id: string) {
  return window.document.getElementById(id);
}

const localizedEndpointSummaries: Record<
  string,
  (inputs?: Record<string, never>, options?: { locale?: Locale }) => string
> = {
  upload_file: m["apiMcp.apiuploadsummary"],
  delete_artifact: m["apiMcp.apideleteartifactsummary"],
  download_artifact: m["apiMcp.apidownloadartifactsummary"],
  list_tools: m["apiMcp.apilisttoolssummary"],
  get_openapi_json: m["apiMcp.apiopenapijsonsummary"],
  get_openapi_yaml: m["apiMcp.apiopenapiyamlsummary"],
  list_popular_tools: m["apiMcp.apipopulartoolssummary"],
};

const localizedTagLabels: Record<
  string,
  (inputs?: Record<string, never>, options?: { locale?: Locale }) => string
> = {
  Tools: m["apiMcp.apitagtools"],
  Files: m["apiMcp.apitagfiles"],
  Catalog: m["apiMcp.apitagcatalog"],
};
