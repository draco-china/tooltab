import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CircleArrowDown, Code, Shield } from "lucide-react";
import { useMemo, useState } from "react";
import { ToolSearch } from "@/features/tool-search/search";
import { toolCategories } from "@/features/tools/catalog/categories";
import {
  localizedToolCatalog,
  toolById,
  toolCountByCategory,
} from "@/features/tools/catalog/discovery";
import { localePath } from "@/lib/locale-path";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { toolCategoryIcons } from "./category-icons";

const featuredToolIds = [
  "json-formatter",
  "qr-code-generator",
  "uuid-v4-generator",
  "base64-encoder-decoder",
  "unix-timestamp-converter",
  "random-password-generator",
] as const;

const popularToolIds = [
  "json-formatter",
  "uuid-v4-generator",
  "base64-encoder-decoder",
  "unix-timestamp-converter",
] as const;

const homeCategories = toolCategories
  .flatMap((category) => {
    const count = toolCountByCategory.get(category.id) ?? 0;
    return count > 0 ? [{ category, count }] : [];
  })
  .sort(
    (left, right) =>
      right.count - left.count ||
      left.category.id.localeCompare(right.category.id),
  )
  .slice(0, 8);

export function HomePage() {
  const locale = getLocale();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const catalog = useMemo(() => localizedToolCatalog(locale), [locale]);
  const localizedToolById = useMemo(
    () => new Map(catalog.map((entry) => [entry.tool.id, entry])),
    [catalog],
  );
  const categoryLabels = useMemo(
    () =>
      Object.fromEntries(
        toolCategories.map((category) => [
          category.id,
          category.nameMessage({}, { locale }),
        ]),
      ),
    [locale],
  );
  const searchEntries = useMemo(
    () =>
      catalog.map(({ tool, name, description }) => ({
        slug: tool.id,
        category: tool.category,
        name,
        description,
      })),
    [catalog],
  );
  const popularTools = popularToolIds.flatMap((id) => {
    const entry = localizedToolById.get(id);
    return entry ? [entry] : [];
  });
  const featuredTools = featuredToolIds.flatMap((id) => {
    const entry = localizedToolById.get(id);
    return entry ? [entry] : [];
  });
  const numberFormat = new Intl.NumberFormat(locale);
  const formattedToolCount = numberFormat.format(toolById.size);
  const toolsPath = localePath(locale, "/tools");

  return (
    <main className="flex flex-col gap-8 sm:gap-10">
      <section className="flex max-w-208 flex-col gap-4">
        <p className="text-sm font-medium text-accent">
          {m["home.homeeyebrow"]({ count: formattedToolCount }, { locale })}
        </p>
        <h1 className="text-4xl leading-[1.08] font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {m["home.hometitle"]({}, { locale })}
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted sm:text-lg">
          {m["home.homedescription"]({}, { locale })}
        </p>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:max-w-130">
            <ToolSearch
              entries={searchEntries}
              locale={locale}
              query={query}
              onQueryChange={setQuery}
              onSubmitQuery={(submittedQuery) =>
                void navigate({
                  href: `${toolsPath}?query=${encodeURIComponent(submittedQuery)}`,
                })
              }
              categoryLabels={categoryLabels}
              variant="hero"
            />
          </div>
          <Link
            to={toolsPath}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            {m["home.browsealltools"]({}, { locale })}
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </Link>
        </div>
        <p className="text-[13px] leading-6 text-muted">
          {m["home.popularshortcuts"]({}, { locale })}&nbsp;
          {popularTools.map(({ tool, name }, index) => (
            <span key={tool.id}>
              {index > 0 ? <span aria-hidden> · </span> : null}
              <Link
                to={localePath(locale, `/tools/${tool.id}`)}
                className="text-foreground underline decoration-border underline-offset-[3px] transition-colors hover:decoration-foreground/40"
              >
                {name}
              </Link>
            </span>
          ))}
        </p>
      </section>

      <section className="grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          {
            Icon: Shield,
            title: m["home.nouploadtitle"]({}, { locale }),
            description: m["home.nouploadbody"]({}, { locale }),
          },
          {
            Icon: Code,
            title: m["home.noservertitle"]({}, { locale }),
            description: m["home.noserverbody"]({}, { locale }),
          },
          {
            Icon: CircleArrowDown,
            title: m["home.offlinereadytitle"]({}, { locale }),
            description: m["home.offlinereadybody"]({}, { locale }),
          },
        ].map(({ Icon, title, description }) => (
          <div
            key={title}
            className="flex items-start gap-3 px-4 py-6 sm:px-6 sm:first:ps-0 sm:last:pe-0"
          >
            <Icon
              aria-hidden
              className="mt-0.5 size-4.5 shrink-0 text-foreground"
            />
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-0.5 text-sm leading-normal text-muted">
                {description}
              </p>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl leading-tight font-semibold tracking-[-0.035em]">
            {m["home.browsecategories"]({}, { locale })}
          </h2>
          <Link
            to={toolsPath}
            className="inline-flex shrink-0 items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
          >
            {m["home.homecategoriesaction"]({}, { locale })}
            <ArrowRight aria-hidden className="size-3.5 rtl:rotate-180" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {homeCategories.map(({ category, count }) => {
            const Icon = toolCategoryIcons[category.id];
            return (
              <Link
                key={category.id}
                to={toolsPath}
                search={{ category: category.id }}
                className="flex min-h-18 items-center gap-3 rounded-[1.25rem] border border-border px-4 py-4 transition-colors hover:bg-default/40"
              >
                <Icon aria-hidden className="size-4.5 shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {categoryLabels[category.id]}
                  </span>
                  <span className="block text-xs text-muted">
                    {m["common.toolcount"](
                      {
                        count: numberFormat.format(count),
                      },
                      { locale },
                    )}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl leading-tight font-semibold tracking-[-0.035em]">
            {m["home.populartools"]({}, { locale })}
          </h2>
          <Link
            to={toolsPath}
            className="inline-flex shrink-0 items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
          >
            {m["home.homepopulartoolsaction"](
              { count: formattedToolCount },
              { locale },
            )}
            <ArrowRight aria-hidden className="size-3.5 rtl:rotate-180" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredTools.map(({ tool, name, description }) => (
            <Link
              key={tool.id}
              to={localePath(locale, `/tools/${tool.id}`)}
              className="group flex min-h-32 flex-col gap-2 rounded-[1.25rem] border border-border bg-surface p-6 transition-colors hover:bg-default"
            >
              <span className="flex min-w-0 items-center gap-2">
                <tool.icon
                  aria-hidden
                  className="size-4.5 shrink-0 text-muted"
                />
                <span className="truncate text-base font-medium tracking-[-0.02em]">
                  {name}
                </span>
              </span>
              <span className="line-clamp-2 text-sm leading-relaxed text-muted">
                {description}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
