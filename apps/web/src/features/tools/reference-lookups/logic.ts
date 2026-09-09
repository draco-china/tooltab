import { lookupMime, MimeQueryError } from "@workspace/tools/network/mime";
import {
  lookupReference as lookupHttpStatus,
  LookupError as HttpLookupError,
} from "../http-status-code-lookup/logic";
import { lookupReference as lookupPorts } from "../port-number-lookup/logic";
import { PortQueryError } from "@workspace/tools/network/ports";
export const LOOKUP_IDS = [
  "http-status-code-lookup",
  "mime-type-lookup",
  "port-number-lookup",
] as const;
export type LookupId = (typeof LOOKUP_IDS)[number];
export class LookupError extends Error {
  constructor() {
    super("invalid_input");
  }
}
export function lookupReference(
  id: LookupId,
  query = "",
  filter = "all",
  locale: "en-US" | "zh-CN" = "en-US",
) {
  if (query.length > 1000 || !["en-US", "zh-CN"].includes(locale))
    throw new LookupError();
  if (id === "http-status-code-lookup") {
    try {
      return lookupHttpStatus(id, query, filter, locale);
    } catch (error) {
      if (error instanceof HttpLookupError) throw new LookupError();
      throw error;
    }
  }
  if (id === "port-number-lookup") {
    try {
      return lookupPorts(id, query, filter, locale);
    } catch (error) {
      if (error instanceof PortQueryError) throw new LookupError();
      throw error;
    }
  }
  if (id !== "mime-type-lookup") throw new LookupError();
  try {
    return lookupMime(query, filter);
  } catch (error) {
    if (error instanceof MimeQueryError) throw new LookupError();
    throw error;
  }
}
