import type { Locale } from "@/paraglide/runtime.js";

export type ToolSearchEntry = Readonly<{
  slug: string;
  category: string;
  name: string;
  description: string;
}>;

export type ToolSearchSuggestion = Readonly<{
  entry: ToolSearchEntry;
  pre: string;
  match: string;
  post: string;
}>;

export function normalizeToolSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

function suggestionScore(loweredName: string, normalizedQuery: string) {
  const index = loweredName.indexOf(normalizedQuery);
  if (index === 0) return 100;
  if (index > 0) return 50;
  return normalizedQuery
    .split(" ")
    .every((token) => loweredName.includes(token))
    ? 10
    : -1;
}

function splitName(name: string, normalizedQuery: string) {
  const loweredName = name.toLowerCase();
  let index = loweredName.indexOf(normalizedQuery);
  let length = normalizedQuery.length;

  if (index < 0) {
    const firstToken = normalizedQuery.split(" ")[0] ?? "";
    index = firstToken ? loweredName.indexOf(firstToken) : -1;
    length = firstToken.length;
  }

  return index < 0
    ? { pre: name, match: "", post: "" }
    : {
        pre: name.slice(0, index),
        match: name.slice(index, index + length),
        post: name.slice(index + length),
      };
}

export function buildToolSearchSuggestions(
  entries: readonly ToolSearchEntry[],
  query: string,
  locale: Locale,
): readonly ToolSearchSuggestion[] {
  const normalizedQuery = normalizeToolSearchQuery(query).toLowerCase();
  if (!normalizedQuery) return [];

  return entries
    .map((entry) => ({
      entry,
      score: suggestionScore(entry.name.toLowerCase(), normalizedQuery),
    }))
    .filter(({ score }) => score >= 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.name.localeCompare(right.entry.name, locale),
    )
    .slice(0, 8)
    .map(({ entry }) => ({ entry, ...splitName(entry.name, normalizedQuery) }));
}

export function rankToolSearchEntries(
  entries: readonly ToolSearchEntry[],
  query: string,
  category: string | null,
  locale: Locale,
) {
  const normalizedQuery = normalizeToolSearchQuery(query).toLowerCase();
  const tokens = normalizedQuery.split(" ");

  return entries
    .filter((entry) => category === null || entry.category === category)
    .map((entry) => {
      if (!normalizedQuery) return { entry, score: 0 };
      const name = entry.name.toLowerCase();
      const description = entry.description.toLowerCase();
      const searchable = `${name} ${description}`;
      if (!tokens.every((token) => searchable.includes(token))) {
        return { entry, score: -1 };
      }
      return {
        entry,
        score:
          (name === normalizedQuery ? 120 : 0) +
          (name.startsWith(normalizedQuery) ? 60 : 0) +
          (name.includes(normalizedQuery) ? 30 : 0) +
          (description.includes(normalizedQuery) ? 15 : 0),
      };
    })
    .filter(({ score }) => !normalizedQuery || score >= 0)
    .sort((left, right) =>
      normalizedQuery
        ? right.score - left.score ||
          left.entry.name.localeCompare(right.entry.name, locale)
        : left.entry.name.localeCompare(right.entry.name, locale),
    )
    .map(({ entry }) => entry);
}
