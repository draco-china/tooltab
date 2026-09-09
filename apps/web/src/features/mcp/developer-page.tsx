import { SearchField } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { useDeferredValue, useMemo, useState } from "react";
import { orderedToolCategories } from "@/features/tools/catalog/categories";
import { localizedToolCatalog } from "@/features/tools/catalog/discovery";
import { localePath } from "@/lib/locale-path";
import { m } from "@/paraglide/messages.js";
import type { Locale } from "@/paraglide/runtime.js";

export function DeveloperToolDirectory({ locale }: { locale: Locale }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(
    query.trim().toLocaleLowerCase(locale),
  );
  const catalog = useMemo(() => localizedToolCatalog(locale), [locale]);
  const visible = deferredQuery
    ? catalog.filter((entry) => entry.searchText.includes(deferredQuery))
    : catalog;

  return (
    <section aria-labelledby="developer-tools-title" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="developer-tools-title" className="text-2xl font-semibold">
            {m["apiMcp.mcptools"]({}, { locale })}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {m["apiMcp.mcpintro"]({}, { locale })}
          </p>
        </div>
        <span aria-live="polite" className="text-sm text-muted tabular-nums">
          {m["common.toolcount"]({ count: visible.length }, { locale })}
        </span>
      </div>
      <SearchField
        aria-label={m["apiMcp.search"]({}, { locale })}
        value={query}
        onChange={setQuery}
        fullWidth
        variant="secondary"
        className="mt-5 max-w-xl"
      >
        <SearchField.Group className="min-h-11 rounded-xl">
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={m["apiMcp.search"]({}, { locale })} />
          <SearchField.ClearButton
            aria-label={m["common.clear"]({}, { locale })}
            onPress={() => setQuery("")}
          />
        </SearchField.Group>
      </SearchField>
      {visible.length ? (
        <div className="mt-8 grid min-w-0 gap-8">
          {orderedToolCategories.flatMap((category) => {
            const entries = visible.filter(
              ({ tool }) => tool.category === category.id,
            );
            return entries.length
              ? [
                  <section key={category.id} aria-labelledby={category.id}>
                    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
                      <h3 id={category.id} className="font-semibold">
                        {category.nameMessage({}, { locale })}
                      </h3>
                      <span className="text-xs text-muted tabular-nums">
                        {entries.length}
                      </span>
                    </div>
                    <ul className="grid min-w-0 sm:grid-cols-2 lg:grid-cols-3">
                      {entries.map(({ tool, name, description }) => (
                        <li
                          key={tool.id}
                          className="min-w-0 border-b border-border/70 sm:nth-last-[-n+2]:border-b-0 lg:nth-last-[-n+3]:border-b-0"
                        >
                          <Link
                            className="group flex min-h-22 min-w-0 flex-col justify-center gap-1 px-3 py-4 transition-colors duration-200 hover:bg-default/45 sm:px-4"
                            to={localePath(locale, `/tools/${tool.id}`)}
                          >
                            <span className="truncate text-sm font-medium transition-colors group-hover:text-link">
                              {name}
                            </span>
                            <span className="line-clamp-2 text-xs leading-5 text-muted">
                              {description}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>,
                ]
              : [];
          })}
        </div>
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted">
          {m["apiMcp.noresults"]({}, { locale })}
        </p>
      )}
    </section>
  );
}
