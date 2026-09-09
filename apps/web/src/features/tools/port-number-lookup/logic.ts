import { filterPorts, PortQueryError } from "@workspace/tools/network/ports";
import { ports } from "../reference-lookups/data/ports";
export function lookupReference(
  id: "port-number-lookup",
  query = "",
  filter = "all",
  locale: "en-US" | "zh-CN" = "en-US",
) {
  if (
    id !== "port-number-lookup" ||
    query.length > 1000 ||
    !["en-US", "zh-CN"].includes(locale)
  )
    throw new PortQueryError();
  const matches = filterPorts(ports, query, filter);
  return {
    dataset: "upstream-c1a30774:176-selected-ports; not complete IANA registry",
    total: ports.length,
    count: matches.length,
    entries: matches,
  };
}
