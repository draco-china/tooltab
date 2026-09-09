import { Tabs } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { Grid2X2, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/base/empty";
import {
  emptyToolDirectoryState,
  readToolDirectoryState,
  type ToolDirectoryState,
  writeToolDirectoryState,
} from "@/features/tool-directory/state";
import {
  normalizeToolSearchQuery,
  rankToolSearchEntries,
  type ToolSearchEntry,
} from "@/features/tool-search/core";
import { ToolSearch } from "@/features/tool-search/search";
import {
  type ToolCategory,
  orderedToolCategories as toolCategories,
} from "@/features/tools/catalog/categories";
import {
  categoryById,
  localizedToolCatalog,
  toolCountByCategory,
  toolsByCategoryTask,
} from "@/features/tools/catalog/discovery";
import { localePath } from "@/lib/locale-path";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

type CategoryOption = Readonly<{
  id: "all" | ToolCategory;
  name: string;
  count: number;
}>;

function CategoryNav({
  categories,
  selected,
  onSelect,
}: {
  categories: readonly CategoryOption[];
  selected: CategoryOption["id"];
  onSelect: (category: CategoryOption["id"]) => void;
}) {
  return (
    <nav
      aria-label={m["home.categoryfilter"]()}
      className="hidden lg:sticky lg:top-8 lg:block"
    >
      <Tabs
        orientation="vertical"
        selectedKey={selected}
        onSelectionChange={(key) =>
          onSelect(String(key) as CategoryOption["id"])
        }
        className="w-full"
      >
        <Tabs.ListContainer className="w-full bg-transparent">
          <Tabs.List
            aria-label={m["home.categoryfilter"]()}
            className="w-full items-stretch justify-start p-0"
          >
            {categories.map((item) => (
              <Tabs.Tab
                key={item.id}
                id={item.id}
                className="min-h-8 justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start text-sm"
              >
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 font-normal text-muted tabular-nums">
                  {item.count}
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel key={selected} id={selected} className="sr-only">
          {categories.find((item) => item.id === selected)?.name}
        </Tabs.Panel>
      </Tabs>
    </nav>
  );
}

function CategoryTabs({
  categories,
  selected,
  onSelect,
}: {
  categories: readonly CategoryOption[];
  selected: CategoryOption["id"];
  onSelect: (category: CategoryOption["id"]) => void;
}) {
  return (
    <Tabs
      selectedKey={selected}
      onSelectionChange={(key) => onSelect(String(key) as CategoryOption["id"])}
      className="-mx-1 min-w-0 overflow-hidden px-1 pb-1 lg:hidden"
    >
      <Tabs.ListContainer>
        <Tabs.List
          aria-label={m["home.categoryfilter"]()}
          className="justify-start"
        >
          {categories.map((item) => (
            <Tabs.Tab
              key={item.id}
              id={item.id}
              className="min-h-8 w-auto shrink-0 gap-1.5 px-3 text-[13px] whitespace-nowrap"
            >
              {item.name}
              <span className="text-muted tabular-nums">{item.count}</span>
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel key={selected} id={selected} className="sr-only">
        {categories.find((item) => item.id === selected)?.name}
      </Tabs.Panel>
    </Tabs>
  );
}

function TaskTabs({
  tasks,
  selected,
  onSelect,
}: {
  tasks: readonly { id: string; name: string }[];
  selected: string;
  onSelect: (task: string) => void;
}) {
  if (tasks.length < 2) return null;
  const options = [{ id: "all", name: m["home.taskall"]() }, ...tasks];

  return (
    <Tabs
      variant="secondary"
      selectedKey={selected}
      onSelectionChange={(key) => onSelect(String(key))}
      className="min-w-0 overflow-hidden"
    >
      <Tabs.ListContainer>
        <Tabs.List
          aria-label={m["home.taskfilter"]()}
          className="justify-start"
        >
          {options.map((item) => (
            <Tabs.Tab
              key={item.id}
              id={item.id}
              className="min-h-8 w-auto shrink-0 px-2.5 text-xs whitespace-nowrap"
            >
              {item.name}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel key={selected} id={selected} className="sr-only">
        {options.find((item) => item.id === selected)?.name}
      </Tabs.Panel>
    </Tabs>
  );
}

function EmptyState({ registry }: { registry?: boolean }) {
  const Icon = registry ? Grid2X2 : Search;
  return (
    <Empty className="min-h-56 border border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{m["home.toolsearchemptytitle"]()}</EmptyTitle>
        <EmptyDescription>
          {m["home.toolsearchemptydescription"]()}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function ToolList() {
  const locale = getLocale();
  const [state, setState] = useState<ToolDirectoryState>(
    emptyToolDirectoryState,
  );
  const restoringLocation = useRef(true);
  const deferredQuery = useDeferredValue(state.query);
  const catalog = useMemo(() => localizedToolCatalog(locale), [locale]);
  const catalogBySlug = useMemo(
    () => new Map(catalog.map((entry) => [entry.tool.id, entry])),
    [catalog],
  );
  const searchEntries = useMemo<ToolSearchEntry[]>(
    () =>
      catalog.map(({ tool, name, description }) => ({
        slug: tool.id,
        category: tool.category,
        name,
        description,
      })),
    [catalog],
  );
  const categoryNames = useMemo(
    () =>
      new Map(
        toolCategories.map((category) => [
          category.id,
          category.nameMessage({}, { locale }),
        ]),
      ),
    [locale],
  );
  const categories = useMemo<CategoryOption[]>(
    () => [
      {
        id: "all",
        name: m["home.categoryall"]({}, { locale }),
        count: catalog.length,
      },
      ...toolCategories.flatMap((category) => {
        const name = categoryNames.get(category.id);
        const count = toolCountByCategory.get(category.id);
        return name && count ? [{ id: category.id, name, count }] : [];
      }),
    ],
    [catalog.length, categoryNames, locale],
  );
  const selectedCategory =
    state.category === "all" ? undefined : categoryById.get(state.category);
  const tasks = useMemo(
    () =>
      selectedCategory?.tasks.flatMap((task) => {
        const hasTools = toolsByCategoryTask
          .get(selectedCategory.id)
          ?.has(task.id);
        return hasTools
          ? [{ id: task.id, name: task.nameMessage({}, { locale }) }]
          : [];
      }) ?? [],
    [locale, selectedCategory],
  );

  useEffect(() => {
    const syncFromLocation = () => {
      restoringLocation.current = true;
      setState(readToolDirectoryState(window.location.search));
    };
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (restoringLocation.current) {
      restoringLocation.current = false;
      return;
    }
    const url = new URL(window.location.href);
    url.search = writeToolDirectoryState(url.search, {
      query: state.query,
      category: state.category,
      task: state.task,
    });
    window.history.replaceState(window.history.state, "", url);
  }, [state.category, state.query, state.task]);

  const eligibleEntries = useMemo(
    () =>
      searchEntries.filter((entry) => {
        const tool = catalogBySlug.get(entry.slug)?.tool;
        return (
          tool &&
          (state.category === "all" || tool.category === state.category) &&
          (state.task === "all" || tool.task === state.task)
        );
      }),
    [catalogBySlug, searchEntries, state.category, state.task],
  );
  const rankedEntries = useMemo(
    () => rankToolSearchEntries(eligibleEntries, deferredQuery, null, locale),
    [deferredQuery, eligibleEntries, locale],
  );
  const normalizedQuery = normalizeToolSearchQuery(deferredQuery);

  function selectCategory(category: CategoryOption["id"]) {
    setState((current) => ({ ...current, category, task: "all" }));
  }

  return (
    <main className="flex max-w-full flex-col gap-8 pt-2 pb-6 sm:gap-10 sm:pt-6 sm:pb-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          {m["home.category"]()}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted sm:text-base">
          {m["home.directoryintro"]()}
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
        <CategoryNav
          categories={categories}
          selected={state.category}
          onSelect={selectCategory}
        />

        <div
          className="flex min-w-0 flex-col gap-4"
          aria-busy={state.query !== deferredQuery}
          aria-live="polite"
        >
          <CategoryTabs
            categories={categories}
            selected={state.category}
            onSelect={selectCategory}
          />
          <div className="flex items-center">
            <ToolSearch
              entries={eligibleEntries}
              locale={locale}
              query={state.query}
              onQueryChange={(query) =>
                setState((current) => ({ ...current, query }))
              }
              categoryLabels={Object.fromEntries(categoryNames)}
            />
          </div>

          <TaskTabs
            tasks={tasks}
            selected={state.task}
            onSelect={(task) => setState((current) => ({ ...current, task }))}
          />

          {normalizedQuery && rankedEntries.length ? (
            <p className="text-sm text-muted">
              {m["common.toolcount"]({ count: rankedEntries.length })}
            </p>
          ) : null}

          {!catalog.length ? (
            <EmptyState registry />
          ) : rankedEntries.length ? (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {rankedEntries.map((entry) => {
                const item = catalogBySlug.get(entry.slug);
                if (!item) return null;
                const Icon = item.tool.icon;
                return (
                  <Link
                    key={item.tool.id}
                    to={localePath(locale, `/tools/${item.tool.id}`)}
                    className="flex items-center gap-3.5 px-4 py-3.5 transition-colors [contain-intrinsic-size:auto_5rem] [content-visibility:auto] hover:bg-default/50 focus-visible:bg-default/50 sm:px-4.5"
                  >
                    <Icon
                      aria-hidden
                      className="size-4 shrink-0 text-muted"
                      strokeWidth={1.8}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-3.5">
                      <span className="truncate text-[15px] font-medium tracking-[-0.02em] md:w-56 md:shrink-0">
                        {item.name}
                      </span>
                      <span className="truncate text-[13px] text-muted md:min-w-0 md:flex-1">
                        {item.description}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-[10px] font-medium tracking-[0.12em] text-muted uppercase md:inline">
                      {categoryNames.get(item.tool.category)}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </main>
  );
}
