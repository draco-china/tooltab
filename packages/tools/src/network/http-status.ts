export const STATUS_FILTERS = [
  "all",
  "common",
  "informational",
  "success",
  "redirection",
  "client-error",
  "server-error",
] as const;

export class HttpStatusQueryError extends Error {
  constructor() {
    super("invalid_input");
  }
}

export type HttpStatusQueryRow = {
  code: number;
  name: string;
  description: string;
  registryName: string;
  category: string;
  common?: boolean;
};

export function filterHttpStatuses<T extends HttpStatusQueryRow>(
  rows: readonly T[],
  query = "",
  filter = "all",
): T[] {
  if (
    query.length > 1000 ||
    !STATUS_FILTERS.includes(filter as (typeof STATUS_FILTERS)[number])
  )
    throw new HttpStatusQueryError();
  const q = query.trim().toLowerCase();
  const includes = (value: string) => value.toLowerCase().includes(q);
  return rows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "common" && row.common) ||
        row.category === filter) &&
      (!q ||
        [String(row.code), row.name, row.description, row.registryName].some(
          includes,
        )),
  );
}
