import { MIME_FILTERS } from "@workspace/tools/network/mime";
import { PORT_FILTERS } from "@workspace/tools/network/ports";
import { STATUS_FILTERS } from "@workspace/tools/network/http-status";
import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import { LOOKUP_IDS, type LookupId, lookupReference } from "./logic";
export function referenceSchema(id: LookupId) {
  return z.strictObject({
    query: z.string().max(1000).default(""),
    filter: z
      .enum(
        id === "http-status-code-lookup"
          ? STATUS_FILTERS
          : id === "port-number-lookup"
            ? PORT_FILTERS
            : MIME_FILTERS,
      )
      .default("all"),
    locale: z.enum(["en-US", "zh-CN"]).default("en-US"),
  });
}
const statusEntry = z.strictObject({
  code: z.number().int(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  common: z.boolean().optional(),
  registryName: z.string(),
});
const portEntry = z.strictObject({
  port: z.number().int(),
  service: z.string(),
  protocol: z.enum(["TCP", "UDP", "TCP/UDP"]),
  description: z.string(),
  category: z.enum(["system", "registered"]),
  common: z.boolean().optional(),
});
const mimeEntry = z.strictObject({
  mimeType: z.string(),
  category: z.string(),
  extensions: z.array(z.string()),
  source: z.string().optional(),
  charset: z.string().optional(),
  compressible: z.boolean().optional(),
});
export const referenceOperations: Operation[] = LOOKUP_IDS.map((id) => ({
  id,
  name: `tooltab_${id.replaceAll("-", "_")}`,
  description:
    id === "http-status-code-lookup"
      ? "Search all 50 fixed-upstream status references with localized descriptions and IANA2025-09-15 names. Historical aliases retained; not a complete IANA registry. Full matching results."
      : id === "mime-type-lookup"
        ? "Search all2522 mime-db1.54.0 entries by media type/extension/source/charset and9 categories. Full matching results including metadata; not file-content validation."
        : "Search all176 selected upstream service ports by number/name/description and range/common filter. Retains TCP/UDP distinctions; not a complete IANA registry and does not scan networks.",
  inputSchema: referenceSchema(id),
  outputSchema: z.strictObject({
    dataset: z.string(),
    total: z.number().int(),
    count: z.number().int(),
    entries: z.array(
      id === "http-status-code-lookup"
        ? statusEntry
        : id === "port-number-lookup"
          ? portEntry
          : mimeEntry,
    ),
  }),
  bodyLimit: 7000,
  idempotent: true,
  run(input, signal) {
    signal?.throwIfAborted();
    const p = referenceSchema(id).parse(input);
    return lookupReference(id, p.query, p.filter, p.locale);
  },
}));
