import {
  filterHttpStatuses,
  HttpStatusQueryError,
} from "@workspace/tools/network/http-status";
import { zhCnStatusDescriptions as descriptions } from "@/features/tools/reference-lookups/data/http/localized-descriptions";
import iana from "../reference-lookups/data/http/iana.json";
import {
  type HttpStatusCodeInfo,
  statusCodes,
} from "../reference-lookups/data/http/status-codes";
export class LookupError extends Error {
  constructor() {
    super("invalid_input");
  }
}
export function lookupReference(
  id: "http-status-code-lookup",
  query = "",
  filter = "all",
  locale: "en-US" | "zh-CN" = "en-US",
) {
  if (
    id !== "http-status-code-lookup" ||
    query.length > 1000 ||
    !["en-US", "zh-CN"].includes(locale)
  )
    throw new LookupError();
  const rows = (statusCodes as readonly HttpStatusCodeInfo[]).map((row) => ({
    ...row,
    description:
      locale === "zh-CN"
        ? ((descriptions as Record<string, string>)[String(row.code)] ??
          row.description)
        : row.description,
    registryName:
      (iana as Record<string, string>)[String(row.code)] ?? "Unassigned",
  }));
  let matches: typeof rows;
  try {
    matches = filterHttpStatuses(rows, query, filter);
  } catch (error) {
    if (error instanceof HttpStatusQueryError) throw new LookupError();
    throw error;
  }
  return {
    dataset: "upstream-c1a30774:50-statuses; IANA2025-09-15 names",
    total: rows.length,
    count: matches.length,
    entries: matches,
  };
}
