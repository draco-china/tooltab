export const PORT_FILTERS = ["all", "common", "system", "registered"] as const;

export class PortQueryError extends Error {
  constructor() {
    super("invalid_input");
  }
}

export type PortQueryRow = {
  port: number;
  service: string;
  description: string;
  category: string;
  common?: boolean;
};

export function filterPorts<T extends PortQueryRow>(
  rows: readonly T[],
  query = "",
  filter = "all",
): T[] {
  if (
    query.length > 1000 ||
    !PORT_FILTERS.includes(filter as (typeof PORT_FILTERS)[number])
  )
    throw new PortQueryError();
  const q = query.trim().toLowerCase();
  const includes = (value: string) => value.toLowerCase().includes(q);
  return rows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "common" && row.common) ||
        row.category === filter) &&
      (!q || [String(row.port), row.service, row.description].some(includes)),
  );
}
