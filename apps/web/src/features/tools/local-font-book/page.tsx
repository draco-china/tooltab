import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Chip,
  Alert,
  Input,
  Label,
  ListBox,
  ScrollShadow,
  Select,
  Skeleton,
  Switch,
  TextArea,
  TextField,
} from "@heroui/react";
import { Eye, Moon, Search, Sun } from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CodeBlock } from "@/components/base/code-block";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  filterLocalFonts,
  fontCss,
  groupLocalFonts,
  inferFontWeight,
  isItalicStyle,
  type LocalFont,
  type LocalFontSort,
  normalizeLocalFonts,
  type RawLocalFont,
} from "@workspace/tools/font/local";

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<RawLocalFont[]>;
  }
}

type StyleFilter = "all" | "regular" | "italic";
type SupportState = "checking" | "supported" | "unsupported";
type LoadError = "denied" | "blocked" | "unknown" | null;

const STORAGE_KEYS = {
  search: "tools:local-font-book:search",
  style: "tools:local-font-book:style",
  sort: "tools:local-font-book:sort",
  group: "tools:local-font-book:group",
  sample: "tools:local-font-book:sample-text",
  dark: "tools:local-font-book:dark-preview",
  active: "tools:local-font-book:active-font",
} as const;

const DEFAULT_SAMPLE = "The quick brown fox jumps over the lazy dog.";

function readSetting(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function FontListSkeleton() {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2" aria-hidden>
      {["one", "two", "three", "four", "five", "six"].map((key) => (
        <div className="space-y-3 rounded-xl border p-4" key={key}>
          <Skeleton className="h-5 w-3/4 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-default">
        <Search aria-hidden className="size-5 text-muted" />
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted">{description}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: Readonly<{ label: string; value: string; mono?: boolean }>) {
  return (
    <div className="grid gap-1.5 rounded-xl border border-separator bg-default/30 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd
        dir={mono ? "ltr" : undefined}
        translate={mono ? "no" : undefined}
        className={
          mono
            ? "min-w-0 font-mono text-sm break-all"
            : "min-w-0 text-sm wrap-break-word"
        }
      >
        {value || "--"}
      </dd>
    </div>
  );
}

function fontDescriptor(font: LocalFont | null) {
  if (!font) return undefined;
  const family = font.family || font.fullName || font.postscriptName;
  if (!family) return undefined;
  const fontWeight = inferFontWeight(font.style);
  return {
    fontFamily: `"${family.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
    fontStyle: isItalicStyle(font.style) ? "italic" : "normal",
    ...(fontWeight ? { fontWeight } : {}),
  };
}

function LocalFontBookContent() {
  const locale = getLocale();
  const [fonts, setFonts] = useState<LocalFont[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [support, setSupport] = useState<SupportState>("checking");
  const [search, setSearch] = useState("");
  const [style, setStyle] = useState<StyleFilter>("all");
  const [sort, setSort] = useState<LocalFontSort>("family");
  const [group, setGroup] = useState(true);
  const [sample, setSample] = useState(DEFAULT_SAMPLE);
  const [dark, setDark] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [settingsReady, setSettingsReady] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const loadRevision = useRef(0);

  useEffect(() => {
    setSupport(
      typeof window.queryLocalFonts === "function"
        ? "supported"
        : "unsupported",
    );
    const storedStyle = readSetting(STORAGE_KEYS.style);
    const storedSort = readSetting(STORAGE_KEYS.sort);
    setSearch(readSetting(STORAGE_KEYS.search) ?? "");
    setStyle(
      storedStyle === "regular" || storedStyle === "italic"
        ? storedStyle
        : "all",
    );
    setSort(
      storedSort === "name" || storedSort === "style" ? storedSort : "family",
    );
    setGroup(readSetting(STORAGE_KEYS.group) !== "false");
    setSample(readSetting(STORAGE_KEYS.sample) ?? DEFAULT_SAMPLE);
    setDark(readSetting(STORAGE_KEYS.dark) === "true");
    setActiveId(readSetting(STORAGE_KEYS.active) ?? "");
    setSettingsReady(true);

    let disposed = false;
    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "local-fonts" as PermissionName })
        .then((status) => {
          if (!disposed) setPermissionDenied(status.state === "denied");
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      loadRevision.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    writeSetting(STORAGE_KEYS.search, search);
    writeSetting(STORAGE_KEYS.style, style);
    writeSetting(STORAGE_KEYS.sort, sort);
    writeSetting(STORAGE_KEYS.group, String(group));
    writeSetting(STORAGE_KEYS.sample, sample);
    writeSetting(STORAGE_KEYS.dark, String(dark));
    writeSetting(STORAGE_KEYS.active, activeId);
  }, [activeId, dark, group, sample, search, settingsReady, sort, style]);

  const visible = useMemo(
    () => filterLocalFonts(fonts, deferredSearch, style, sort),
    [deferredSearch, fonts, sort, style],
  );
  const active = visible.find((font) => font.id === activeId) ?? null;
  const groups = useMemo(
    () => groupLocalFonts(visible, group),
    [group, visible],
  );
  const css = fontCss(active ?? undefined);
  const countLabel = hasLoaded
    ? m["tools.localFontBook.fontCount"](
        { count: new Intl.NumberFormat(locale).format(fonts.length) },
        { locale },
      )
    : "";
  const statusMessage =
    support === "unsupported"
      ? m["tools.localFontBook.statusUnsupported"]({}, { locale })
      : loadError === "blocked"
        ? m["tools.localFontBook.statusBlocked"]({}, { locale })
        : loadError === "denied" || permissionDenied
          ? m["tools.localFontBook.statusDenied"]({}, { locale })
          : loadError === "unknown"
            ? m["tools.localFontBook.statusError"]({}, { locale })
            : "";

  useEffect(() => {
    if (!fonts.length) return;
    const firstId = visible[0]?.id ?? "";
    if (!visible.some((font) => font.id === activeId) && firstId !== activeId) {
      setActiveId(firstId);
    }
  }, [activeId, fonts.length, visible]);

  async function loadFonts() {
    if (support !== "supported" || !window.queryLocalFonts) return;
    const revision = ++loadRevision.current;
    setLoading(true);
    setHasLoaded(false);
    setLoadError(null);
    setPermissionDenied(false);
    setFonts([]);
    try {
      const rawFonts = await window.queryLocalFonts();
      if (revision !== loadRevision.current) return;
      const next = normalizeLocalFonts(rawFonts);
      const nextVisible = filterLocalFonts(next, deferredSearch, style, sort);
      startTransition(() => {
        if (revision !== loadRevision.current) return;
        setFonts(next);
        setHasLoaded(true);
        setActiveId((current) =>
          nextVisible.some((font) => font.id === current)
            ? current
            : (nextVisible[0]?.id ?? ""),
        );
      });
    } catch (error) {
      if (revision !== loadRevision.current) return;
      const name =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      setLoadError(
        name === "NotAllowedError"
          ? "denied"
          : name === "SecurityError"
            ? "blocked"
            : "unknown",
      );
    } finally {
      if (revision === loadRevision.current) setLoading(false);
    }
  }

  const descriptor = fontDescriptor(active);

  return (
    <div className="grid gap-10">
      <div
        className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(21rem,0.92fr)] xl:items-stretch xl:gap-6"
        data-tool-panels
      >
        <ToolPanelCard className="min-w-0 xl:h-auto">
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <Card.Title>
                {m["tools.localFontBook.libraryTitle"]({}, { locale })}
              </Card.Title>
              <Card.Description>
                {m["tools.localFontBook.description"]({}, { locale })}
              </Card.Description>
            </div>
            <Button
              variant="outline"
              size="sm"
              isDisabled={support !== "supported" || loading}
              onPress={() => void loadFonts()}
            >
              {hasLoaded && !fonts.length
                ? m["tools.localFontBook.fontretry"]({}, { locale })
                : m["tools.localFontBook.loadButton"]({}, { locale })}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <Input
              aria-label={m["tools.localFontBook.searchPlaceholder"](
                {},
                { locale },
              )}
              placeholder={m["tools.localFontBook.searchPlaceholder"](
                {},
                { locale },
              )}
              autoComplete="off"
              value={search}
              disabled={!fonts.length}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                variant="secondary"
                selectedKey={style}
                isDisabled={!fonts.length}
                onSelectionChange={(key) =>
                  setStyle((key as StyleFilter) ?? "all")
                }
              >
                <Label>{m["common.localfontstyle"]({}, { locale })}</Label>
                <Select.Trigger className="w-full">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item
                      id="all"
                      textValue={m["tools.localFontBook.fontallstyles"](
                        {},
                        { locale },
                      )}
                    >
                      {m["tools.localFontBook.fontallstyles"]({}, { locale })}
                    </ListBox.Item>
                    <ListBox.Item
                      id="regular"
                      textValue={m["tools.localFontBook.fontregular"](
                        {},
                        { locale },
                      )}
                    >
                      {m["tools.localFontBook.fontregular"]({}, { locale })}
                    </ListBox.Item>
                    <ListBox.Item
                      id="italic"
                      textValue={m["tools.localFontBook.filterStyleItalic"](
                        {},
                        { locale },
                      )}
                    >
                      {m["tools.localFontBook.filterStyleItalic"](
                        {},
                        { locale },
                      )}
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
              <Select
                variant="secondary"
                selectedKey={sort}
                isDisabled={!fonts.length}
                onSelectionChange={(key) =>
                  setSort((key as LocalFontSort) ?? "family")
                }
              >
                <Label>
                  {m["tools.localFontBook.sortLabel"]({}, { locale })}
                </Label>
                <Select.Trigger className="w-full">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item
                      id="family"
                      textValue={m["tools.localFontBook.detailsFamily"](
                        {},
                        { locale },
                      )}
                    >
                      {m["tools.localFontBook.detailsFamily"]({}, { locale })}
                    </ListBox.Item>
                    <ListBox.Item
                      id="name"
                      textValue={m["shared.pdfEditing.readfieldName"](
                        {},
                        { locale },
                      )}
                    >
                      {m["shared.pdfEditing.readfieldName"]({}, { locale })}
                    </ListBox.Item>
                    <ListBox.Item
                      id="style"
                      textValue={m["common.localfontstyle"]({}, { locale })}
                    >
                      {m["common.localfontstyle"]({}, { locale })}
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <div className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-separator bg-default/30 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {m["tools.localFontBook.groupLabel"]({}, { locale })}
                </p>
                {countLabel ? <Chip className="mt-1">{countLabel}</Chip> : null}
              </div>
              <Switch
                isSelected={group}
                isDisabled={!fonts.length}
                onChange={setGroup}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
            </div>
            <div className="min-h-0 overflow-hidden rounded-2xl border border-separator bg-default/20 xl:flex-1">
              <ScrollShadow
                className="max-h-120 xl:h-full"
                orientation="vertical"
              >
                {loading ? (
                  <FontListSkeleton />
                ) : groups.length ? (
                  <div className="flex flex-col gap-4 p-4">
                    {groups.map((fontGroup) => (
                      <section key={fontGroup.id} className="grid gap-3">
                        {fontGroup.label ? (
                          <h3 className="text-xs font-medium wrap-break-word text-muted">
                            {fontGroup.label}
                          </h3>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {fontGroup.items.map((font) => (
                            <Button
                              key={font.id}
                              data-testid={`font-${font.id}`}
                              data-active={font.id === activeId}
                              variant={
                                font.id === activeId ? "secondary" : "outline"
                              }
                              className="h-auto min-h-20 min-w-0 justify-start p-4 text-start whitespace-normal"
                              onPress={() =>
                                startTransition(() => setActiveId(font.id))
                              }
                            >
                              <span className="block min-w-0">
                                <span
                                  className="line-clamp-2 block font-medium wrap-break-word"
                                  style={fontDescriptor(font)}
                                >
                                  {font.displayName}
                                </span>
                                <span className="mt-2 block min-w-0 text-xs wrap-break-word text-muted">
                                  {font.displayFamily} {font.displayStyle}
                                </span>
                              </span>
                            </Button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : fonts.length ? (
                  <EmptyState
                    title={m["tools.localFontBook.noResults"]({}, { locale })}
                    description={m["tools.localFontBook.searchPlaceholder"](
                      {},
                      { locale },
                    )}
                  />
                ) : hasLoaded ? (
                  <div role="status">
                    <EmptyState
                      title={m["tools.localFontBook.fontemptytitle"](
                        {},
                        { locale },
                      )}
                      description={m[
                        "tools.localFontBook.fontemptydescription"
                      ]({}, { locale })}
                    />
                  </div>
                ) : (
                  <EmptyState
                    title={m["tools.localFontBook.loadButton"]({}, { locale })}
                    description={m["tools.localFontBook.description"](
                      {},
                      { locale },
                    )}
                  />
                )}
              </ScrollShadow>
            </div>
            {statusMessage ? (
              permissionDenied || loadError === "denied" ? (
                <Alert status="warning" role="status" aria-live="polite">
                  <Alert.Content>
                    <Alert.Description>{statusMessage}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : (
                <div
                  aria-live="polite"
                  className="rounded-xl border border-dashed border-separator bg-default/20 px-4 py-3 text-sm text-muted"
                >
                  {statusMessage}
                </div>
              )
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <div className="flex min-w-0 flex-col gap-5 xl:gap-6">
          <ToolPanelCard className="min-w-0">
            <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <Card.Title>
                  {m["common.faviconpreview"]({}, { locale })}
                </Card.Title>
                <Card.Description>
                  {m["tools.localFontBook.previewDescription"]({}, { locale })}
                </Card.Description>
              </div>
              <Button
                isIconOnly
                size="sm"
                variant="outline"
                aria-label={m[
                  "tools.cssBoxShadowGenerator.darkBackgroundLabel"
                ]({}, { locale })}
                onPress={() => setDark((value) => !value)}
              >
                {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
              </Button>
            </Card.Header>
            <ToolPanelCardContent className="flex flex-col gap-4 py-4">
              <TextField>
                <Label className="sr-only">
                  {m["tools.localFontBook.previewFallback"]({}, { locale })}
                </Label>
                <TextArea
                  aria-label={m["tools.localFontBook.previewFallback"](
                    {},
                    { locale },
                  )}
                  value={sample}
                  placeholder={m["tools.localFontBook.previewPlaceholder"](
                    {},
                    { locale },
                  )}
                  rows={4}
                  className="min-h-28 resize-y"
                  onChange={(event) => setSample(event.target.value)}
                />
              </TextField>
              <div
                data-dark={dark}
                className={`overflow-hidden rounded-2xl border px-5 py-5 sm:px-6 sm:py-6 ${dark ? "border-slate-800 bg-slate-950 text-slate-50" : "border-separator bg-default/30"}`}
              >
                {active && descriptor ? (
                  <div
                    className="flex min-h-60 flex-col gap-8 sm:min-h-72 sm:gap-10"
                    style={descriptor}
                  >
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Chip>{active.displayFamily}</Chip>
                      <Chip>{active.displayStyle}</Chip>
                    </div>
                    <div className="space-y-4">
                      <p
                        dir="auto"
                        className="text-[clamp(2rem,4.2vw,4.25rem)] leading-[0.98] tracking-tight text-balance wrap-break-word"
                      >
                        {sample ||
                          m["tools.localFontBook.previewFallback"](
                            {},
                            { locale },
                          )}
                      </p>
                      <p
                        dir="ltr"
                        className="border-t border-current/10 pt-4 text-sm tracking-[0.18em] uppercase opacity-60"
                      >
                        Aa Bb Cc 0123456789 &amp; @#?!
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-60 flex-col items-center justify-center gap-3 text-center">
                    <Eye aria-hidden className="size-6 text-muted" />
                    <p className="font-medium">
                      {m["common.faviconpreview"]({}, { locale })}
                    </p>
                    <p className="text-sm text-muted">
                      {m["tools.localFontBook.previewEmpty"]({}, { locale })}
                    </p>
                  </div>
                )}
              </div>
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard className="min-w-0">
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m["tools.localFontBook.fontdetails"]({}, { locale })}
              </Card.Title>
              <Card.Description>
                {m["tools.localFontBook.detailsDescription"]({}, { locale })}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="flex flex-col gap-4 py-4">
              {active ? (
                <>
                  <dl className="grid gap-2.5">
                    <DetailRow
                      label={m["tools.localFontBook.detailsFamily"](
                        {},
                        { locale },
                      )}
                      value={active.family}
                    />
                    <DetailRow
                      label={m["tools.localFontBook.detailsFullName"](
                        {},
                        { locale },
                      )}
                      value={active.fullName}
                    />
                    <DetailRow
                      label={m["tools.localFontBook.detailsPostscript"](
                        {},
                        { locale },
                      )}
                      value={active.postscriptName}
                      mono
                    />
                    <DetailRow
                      label={m["common.localfontstyle"]({}, { locale })}
                      value={active.style}
                    />
                  </dl>
                  <CodeBlock
                    code={css}
                    title={m["tools.localFontBook.cssTitle"]({}, { locale })}
                    language="CSS"
                    copyLabel={m["tools.localFontBook.copyCssLabel"](
                      {},
                      { locale },
                    )}
                    copiedLabel={m["common.actions.copied"]({}, { locale })}
                    wrap
                  />
                </>
              ) : (
                <EmptyState
                  title={m["tools.localFontBook.fontdetails"]({}, { locale })}
                  description={m["tools.localFontBook.previewEmpty"](
                    {},
                    { locale },
                  )}
                />
              )}
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>
      </div>

      <ToolArticle>
        <h2>{m["tools.localFontBook.articleWhatTitle"]({}, { locale })}</h2>
        <p>{m["tools.localFontBook.articleWhatBodyOne"]({}, { locale })}</p>
        <p>{m["tools.localFontBook.articleWhatBodyTwo"]({}, { locale })}</p>
        <p>{m["tools.localFontBook.articleWhatBodyThree"]({}, { locale })}</p>
        <p>{m["tools.localFontBook.articleWhatBodyFour"]({}, { locale })}</p>
        <h3>{m["tools.localFontBook.articlePointsTitle"]({}, { locale })}</h3>
        <ul>
          {[
            m["tools.localFontBook.articlePoints0"]({}, { locale }),
            m["tools.localFontBook.articlePoints1"]({}, { locale }),
            m["tools.localFontBook.articlePoints2"]({}, { locale }),
            m["tools.localFontBook.articlePoints3"]({}, { locale }),
          ].map((point, index) => (
            <li key={point}>
              {index === 0 ? (
                <>
                  {point.split("font-family")[0]}
                  <code>font-family</code>
                  {point.split("font-family")[1]}
                </>
              ) : (
                point
              )}
            </li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function LocalFontBook() {
  return (
    <ToolPage>
      <LocalFontBookContent />
    </ToolPage>
  );
}
