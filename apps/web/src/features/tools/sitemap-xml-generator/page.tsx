import type { SeoResult } from "../seo-generators/worker-client";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Input,
  Label,
  Link,
  ListBox,
  Select,
  Skeleton,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  frequencies,
  SeoError,
  type SitemapEntry,
  type SitemapState,
  sitemapPreset,
} from "@workspace/tools/project/seo";
import { runSeoWorker } from "../seo-generators/worker-client";

const AUTO_GENERATE_DELAY = 250;

const frequencyKeys = {
  always: m["shared.seoGenerators.frequencyalways"],
  hourly: m["shared.seoGenerators.frequencyhourly"],
  daily: m["shared.seoGenerators.frequencydaily"],
  weekly: m["shared.seoGenerators.frequencyweekly"],
  monthly: m["shared.seoGenerators.frequencymonthly"],
  yearly: m["shared.seoGenerators.frequencyyearly"],
  never: m["shared.seoGenerators.frequencynever"],
} as const;

const warningKeys = {
  multiple_hosts: m["shared.seoGenerators.warninghosts"],
  long_url: m["shared.seoGenerators.warningurl"],
} as const;

function isUrlEntry(
  entry: SitemapState["sitemapEntries"][number],
): entry is SitemapEntry {
  return "priority" in entry && "changefreq" in entry;
}

function Highlighted({ html }: { html: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: the XML highlighter escapes user source and returns trusted span markup.
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function SitemapGeneratorContent() {
  const id = useId();
  const [sitemap, setSitemap] = useState(() => sitemapPreset("standard"));
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<SeoResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SeoError | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const task = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const activeDownload = useRef("");

  const disposeResult = useCallback(() => {
    revision.current++;
    task.current?.abort();
    task.current = null;
    setBusy(false);
    setResult(null);
    setError(null);
    if (activeDownload.current) URL.revokeObjectURL(activeDownload.current);
    activeDownload.current = "";
    setDownloadUrl("");
  }, []);

  const generate = useCallback(async (state: SitemapState) => {
    const current = ++revision.current;
    task.current?.abort();
    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    setError(null);
    try {
      const next = await runSeoWorker(
        { kind: "sitemap", state },
        controller.signal,
      );
      if (current !== revision.current || controller.signal.aborted) return;
      setResult(next);
      if (next.output) {
        const url = URL.createObjectURL(
          new Blob([next.output], { type: "application/xml" }),
        );
        activeDownload.current = url;
        setDownloadUrl(url);
      }
    } catch (cause) {
      if (current === revision.current && !controller.signal.aborted) {
        setError(
          cause instanceof SeoError ? cause : new SeoError("invalid_input"),
        );
      }
    } finally {
      if (current === revision.current) {
        task.current = null;
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    disposeResult();
    const timer = window.setTimeout(
      () => void generate(sitemap),
      AUTO_GENERATE_DELAY,
    );
    return () => window.clearTimeout(timer);
  }, [disposeResult, generate, sitemap]);

  useEffect(
    () => () => {
      revision.current++;
      task.current?.abort();
      if (activeDownload.current) URL.revokeObjectURL(activeDownload.current);
    },
    [],
  );

  const entries =
    sitemap.mode === "urlset" ? sitemap.urlEntries : sitemap.sitemapEntries;
  const totalPages = Math.max(1, Math.ceil(entries.length / 20));

  function editSitemap(change: (state: SitemapState) => SitemapState) {
    disposeResult();
    setSitemap(change);
  }

  function editEntry(index: number, field: string, value: string) {
    editSitemap((state) =>
      state.mode === "urlset"
        ? {
            ...state,
            urlEntries: state.urlEntries.map((entry, entryIndex) =>
              entryIndex === index ? { ...entry, [field]: value } : entry,
            ),
          }
        : {
            ...state,
            sitemapEntries: state.sitemapEntries.map((entry, entryIndex) =>
              entryIndex === index ? { ...entry, [field]: value } : entry,
            ),
          },
    );
  }

  function removeEntry(index: number) {
    editSitemap((state) =>
      state.mode === "urlset"
        ? {
            ...state,
            urlEntries: state.urlEntries.filter(
              (_, entryIndex) => entryIndex !== index,
            ),
          }
        : {
            ...state,
            sitemapEntries: state.sitemapEntries.filter(
              (_, entryIndex) => entryIndex !== index,
            ),
          },
    );
    setPage(0);
  }

  function applyPreset(preset: "standard" | "content" | "index") {
    disposeResult();
    setSitemap(sitemapPreset(preset));
    setPage(0);
  }

  return (
    <div className="grid min-w-0 gap-6" data-tool-panels>
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <div className="space-y-1">
            <Card.Title>
              {m["tools.sitemapXmlGenerator.seooptionstitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.sitemapXmlGenerator.seooptionsdescription"]()}
            </Card.Description>
          </div>
        </Card.Header>
        <ToolPanelCardContent className="gap-5 py-4">
          <div className="grid gap-2">
            <Label>{m["tools.sitemapXmlGenerator.seomode"]()}</Label>
            <ToggleButtonGroup
              aria-label={m["tools.sitemapXmlGenerator.seomode"]()}
              selectionMode="single"
              selectedKeys={new Set([sitemap.mode])}
              className="grid w-full grid-cols-2 [&_button]:min-h-11"
              onSelectionChange={(selection) => {
                const mode = String([...selection][0] ?? "");
                if (mode !== "urlset" && mode !== "sitemapindex") return;
                editSitemap((state) => ({ ...state, mode }));
                setPage(0);
              }}
            >
              <ToggleButton id="urlset">
                {m["tools.sitemapXmlGenerator.seourlset"]()}
              </ToggleButton>
              <ToggleButton id="sitemapindex">
                {m["tools.sitemapXmlGenerator.seoindex"]()}
              </ToggleButton>
            </ToggleButtonGroup>
          </div>

          <TextField fullWidth>
            <Label>{m["tools.sitemapXmlGenerator.seobase"]()}</Label>
            <Input
              className="min-h-11 w-full"
              value={sitemap.baseUrl}
              placeholder="https://example.com"
              onChange={(event) =>
                editSitemap((state) => ({
                  ...state,
                  baseUrl: event.currentTarget.value,
                }))
              }
            />
          </TextField>

          <Switch
            isSelected={sitemap.autoJoin}
            onChange={(selected) =>
              editSitemap((state) => ({
                ...state,
                autoJoin: selected === true,
              }))
            }
          >
            <Switch.Content className="flex min-h-11 items-center justify-between gap-4">
              <span className="min-w-0 space-y-1">
                <span className="block font-medium">
                  {m["tools.sitemapXmlGenerator.seojoin"]()}
                </span>
                <span className="block text-sm text-muted">
                  {m["tools.sitemapXmlGenerator.seojoindescription"]()}
                </span>
              </span>
              <Switch.Control className="shrink-0">
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>

          <div className="grid gap-2">
            <div className="space-y-1">
              <Label>{m["tools.sitemapXmlGenerator.seopresets"]()}</Label>
              <p className="text-sm text-muted">
                {m["tools.sitemapXmlGenerator.seopresetsdescription"]()}
              </p>
            </div>
            <ToolPanelActionGroup>
              <Button variant="outline" onClick={() => applyPreset("standard")}>
                {m["shared.seoGenerators.standard"]()}
              </Button>
              <Button variant="outline" onClick={() => applyPreset("content")}>
                {m["shared.seoGenerators.content"]()}
              </Button>
              <Button variant="outline" onClick={() => applyPreset("index")}>
                {m["shared.seoGenerators.indexpreset"]()}
              </Button>
            </ToolPanelActionGroup>
          </div>
        </ToolPanelCardContent>
        <ToolPanelCardFooter>
          <Button variant="ghost" onClick={() => applyPreset("standard")}>
            <RotateCcw aria-hidden className="size-4" />
            {m["common.actions.reset"]()}
          </Button>
        </ToolPanelCardFooter>
      </ToolPanelCard>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <div className="space-y-1">
              <Card.Title>
                {m["tools.sitemapXmlGenerator.seoentries"]()} ({entries.length})
              </Card.Title>
              <Card.Description>
                {m["tools.sitemapXmlGenerator.seoentriesdescription"]()}
              </Card.Description>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {entries
              .slice(page * 20, page * 20 + 20)
              .map((entry, localIndex) => {
                const index = page * 20 + localIndex;
                return (
                  <section
                    key={index}
                    className="grid gap-4 rounded-2xl border border-separator p-4"
                    aria-label={`${m["tools.sitemapXmlGenerator.seoentry"]()} ${index + 1}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">
                        {m["tools.sitemapXmlGenerator.seoentry"]()} {index + 1}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeEntry(index)}
                      >
                        <Trash2 aria-hidden className="size-4" />
                        {m["tools.sitemapXmlGenerator.seoremove"]()}
                      </Button>
                    </div>
                    <div
                      className={`grid gap-4 ${isUrlEntry(entry) ? "sm:grid-cols-2" : ""}`}
                    >
                      <TextField fullWidth>
                        <Label>
                          {m["tools.sitemapXmlGenerator.seolocation"]()}
                        </Label>
                        <Input
                          id={`${id}-loc-${index}`}
                          className="min-h-11 w-full"
                          value={entry.loc}
                          placeholder="/pricing"
                          onChange={(event) =>
                            editEntry(index, "loc", event.currentTarget.value)
                          }
                        />
                      </TextField>
                      <TextField fullWidth>
                        <Label>
                          {m["tools.sitemapXmlGenerator.seolastmod"]()}
                        </Label>
                        <Input
                          id={`${id}-date-${index}`}
                          className="min-h-11 w-full"
                          value={entry.lastmod}
                          placeholder="2026-04-20"
                          onChange={(event) =>
                            editEntry(
                              index,
                              "lastmod",
                              event.currentTarget.value,
                            )
                          }
                        />
                      </TextField>
                      {isUrlEntry(entry) ? (
                        <>
                          <Select
                            variant="secondary"
                            selectedKey={entry.changefreq || "omit"}
                            onSelectionChange={(key) => {
                              if (key == null) return;
                              editEntry(
                                index,
                                "changefreq",
                                String(key) === "omit" ? "" : String(key),
                              );
                            }}
                          >
                            <Label>
                              {m["tools.sitemapXmlGenerator.seofrequency"]()}
                            </Label>
                            <Select.Trigger
                              id={`${id}-freq-${index}`}
                              className="min-h-11 w-full"
                            >
                              <Select.Value />
                              <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                              <ListBox>
                                <ListBox.Section>
                                  <ListBox.Item id="omit" textValue="omit">
                                    {m["tools.sitemapXmlGenerator.seoomit"]()}
                                  </ListBox.Item>
                                  {frequencies.map((frequency) => (
                                    <ListBox.Item
                                      key={frequency}
                                      id={frequency}
                                      textValue={frequencyKeys[frequency]({})}
                                    >
                                      {frequencyKeys[frequency]({})}
                                    </ListBox.Item>
                                  ))}
                                </ListBox.Section>
                              </ListBox>
                            </Select.Popover>
                          </Select>
                          <TextField fullWidth>
                            <Label>
                              {m["tools.sitemapXmlGenerator.seopriority"]()}
                            </Label>
                            <Input
                              id={`${id}-priority-${index}`}
                              className="min-h-11 w-full"
                              value={entry.priority}
                              inputMode="decimal"
                              onChange={(event) =>
                                editEntry(
                                  index,
                                  "priority",
                                  event.currentTarget.value,
                                )
                              }
                            />
                          </TextField>
                        </>
                      ) : null}
                    </div>
                  </section>
                );
              })}
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-between gap-3">
            <Button
              variant="outline"
              isDisabled={entries.length >= 50000}
              onClick={() => {
                editSitemap((state) =>
                  state.mode === "urlset"
                    ? {
                        ...state,
                        urlEntries: [
                          ...state.urlEntries,
                          {
                            loc: "",
                            lastmod: "",
                            changefreq: "",
                            priority: "",
                          },
                        ],
                      }
                    : {
                        ...state,
                        sitemapEntries: [
                          ...state.sitemapEntries,
                          { loc: "", lastmod: "" },
                        ],
                      },
                );
                setPage(Math.floor(entries.length / 20));
              }}
            >
              <Plus aria-hidden className="size-4" />
              {m["tools.sitemapXmlGenerator.seoaddentry"]()}
            </Button>
            {totalPages > 1 ? (
              <ToolPanelActionGroup className="justify-end">
                <Button
                  variant="ghost"
                  isDisabled={page === 0}
                  onClick={() => setPage((value) => value - 1)}
                >
                  {m["tools.sitemapXmlGenerator.seoprevious"]()}
                </Button>
                <span className="text-sm text-muted">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  isDisabled={page >= totalPages - 1}
                  onClick={() => setPage((value) => value + 1)}
                >
                  {m["tools.sitemapXmlGenerator.seonext"]()}
                </Button>
              </ToolPanelActionGroup>
            ) : null}
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard className="xl:sticky xl:top-24 xl:h-fit!">
          <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <Card.Title>
                {m["tools.sitemapXmlGenerator.seooutputtitle"]()}
              </Card.Title>
              <Card.Description>
                {result
                  ? m["tools.sitemapXmlGenerator.seooutputcount"]({
                      count: result.count,
                    })
                  : m["tools.sitemapXmlGenerator.seooutputdescription"]()}
              </Card.Description>
            </div>
            {busy || (result && downloadUrl) ? (
              <ToolPanelActionGroup className="shrink-0 sm:justify-end">
                {busy ? (
                  <Button variant="ghost" onClick={disposeResult}>
                    {m["common.actions.cancel"]()}
                  </Button>
                ) : null}
                {result && downloadUrl ? (
                  <Link
                    href={downloadUrl}
                    download={result.filename}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <Download aria-hidden className="size-4" />
                    {m["shared.seoGenerators.download"]({
                      filename: result.filename,
                    })}
                  </Link>
                ) : null}
              </ToolPanelActionGroup>
            ) : null}
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {m["tools.sitemapXmlGenerator.seoerror"]()} ({error.code}
                {error.index !== undefined ? ` · ${error.index + 1}` : ""})
              </p>
            ) : busy && !result ? (
              <Skeleton className="h-96 rounded-2xl" />
            ) : result ? (
              <>
                <CodeBlock
                  code={result.output}
                  title="XML"
                  language="XML"
                  className="rounded-none border-x-0 border-b-0"
                  copyLabel={`${m["common.actions.copy"]()} XML`}
                  maxHeightClassName="max-h-[44rem] min-h-96"
                  codeClassName="[&_.hljs-name]:text-primary [&_.hljs-string]:text-chart-2 [&_.hljs-attr]:text-chart-3"
                >
                  {result.highlighted ? (
                    <Highlighted html={result.highlighted} />
                  ) : (
                    result.output.slice(0, 100000)
                  )}
                </CodeBlock>
                {result.warnings.length ? (
                  <ul className="grid gap-1 text-sm text-muted">
                    {result.warnings.map((warning) => (
                      <li key={warning}>
                        {warning in warningKeys
                          ? warningKeys[warning as keyof typeof warningKeys]({})
                          : warning}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {result.output.length > 100000 ? (
                  <p className="text-sm text-muted">
                    {m["tools.sitemapXmlGenerator.seopreviewnote"]()}
                  </p>
                ) : null}
              </>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
    </div>
  );
}

export function SitemapGenerator() {
  return (
    <ToolPage>
      <SitemapGeneratorContent />
    </ToolPage>
  );
}
