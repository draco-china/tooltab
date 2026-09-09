import database from "mime-db/db.json";

export const MIME_FILTERS = [
  "all",
  "application",
  "audio",
  "font",
  "image",
  "message",
  "model",
  "multipart",
  "text",
  "video",
] as const;

type MimeRecord = {
  extensions?: string[];
  source?: string;
  charset?: string;
  compressible?: boolean;
};

export class MimeQueryError extends Error {
  constructor() {
    super("invalid_input");
  }
}

const mimeEntries = Object.entries(database as Record<string, MimeRecord>)
  .map(([mimeType, entry]) => ({
    mimeType,
    category: MIME_FILTERS.includes(
      mimeType.split("/")[0] as (typeof MIME_FILTERS)[number],
    )
      ? mimeType.split("/")[0]
      : "unknown",
    extensions: entry.extensions ?? [],
    ...entry,
  }))
  .sort((a, b) => a.mimeType.localeCompare(b.mimeType));

export function lookupMime(query = "", filter = "all") {
  if (
    query.length > 1000 ||
    !MIME_FILTERS.includes(filter as (typeof MIME_FILTERS)[number])
  )
    throw new MimeQueryError();
  const q = query.trim().toLowerCase();
  const includes = (value: string) => value.toLowerCase().includes(q);
  const matches = mimeEntries
    .filter((row) => filter === "all" || row.category === filter)
    .map((row) => ({
      row,
      rank: q
        ? [
            row.extensions.some(includes),
            includes(row.mimeType),
            includes(row.source ?? ""),
            includes(row.charset ?? ""),
          ].indexOf(true)
        : 0,
    }))
    .filter(({ rank }) => rank !== -1);
  if (q)
    matches.sort(
      (a, b) => a.rank - b.rank || a.row.mimeType.localeCompare(b.row.mimeType),
    );
  return {
    dataset: "mime-db@1.54.0" as const,
    total: mimeEntries.length,
    count: matches.length,
    entries: matches.map(({ row }) => ({
      ...row,
      extensions: [...row.extensions],
    })),
  };
}
