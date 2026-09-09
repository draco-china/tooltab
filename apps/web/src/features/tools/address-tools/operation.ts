import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import {
  buildUrl,
  convertDomain,
  ipv6ToMac,
  macToIpv6,
  parseUrl,
} from "@workspace/tools/network/address";
export const urlDraftSchema = z.strictObject({
  protocol: z.string().max(100),
  username: z.string().max(100000),
  password: z.string().max(100000),
  hostname: z.string().max(1000),
  port: z.string().max(10),
  pathname: z.string().max(100000),
  fragment: z.string().max(100000),
  queryEntries: z
    .array(
      z.strictObject({
        key: z.string().max(100000),
        value: z.string().max(100000),
      }),
    )
    .max(1000),
  opaque: z.boolean().default(false),
});
const mac = z.strictObject({
  input: z.string().max(100),
  networkInterface: z.string().max(100).default(""),
});
const ipv6 = z.strictObject({ input: z.string().max(200) });
const domain = z.strictObject({
  input: z.string().max(4096),
  direction: z.enum(["ascii", "unicode"]).default("ascii"),
});
const url = z.union([
  z.strictObject({
    operation: z.literal("parse"),
    input: z.string().max(100000),
  }),
  z.strictObject({ operation: z.literal("build"), draft: urlDraftSchema }),
]);
export const addressToolOperations: Operation[] = [
  {
    id: "mac-address-to-ipv6-link-local-address-converter",
    name: "tooltab_mac_address_to_ipv6_link_local_address_converter",
    description:
      "Derive an RFC4291 modified EUI64 link-local IPv6 address from a48-bit MAC, with optional interfacezone.",
    inputSchema: mac,
    outputSchema: z.strictObject({ mac: z.string(), ipv6: z.string() }),
    bodyLimit: 10000,
    idempotent: true,
    run(input) {
      const p = mac.parse(input);
      return macToIpv6(p.input, p.networkInterface);
    },
  },
  {
    id: "ipv6-address-to-mac-address-converter",
    name: "tooltab_ipv6_address_to_mac_address_converter",
    description:
      "Extract a candidate MAC only when a valid IPv6 IID has the FF:FE modified EUI64 marker; not proof of hardware identity.",
    inputSchema: ipv6,
    outputSchema: z.strictObject({
      convertible: z.boolean(),
      ipv6: z.string(),
      mac: z.string().nullable(),
    }),
    bodyLimit: 10000,
    idempotent: true,
    run(input) {
      return ipv6ToMac(ipv6.parse(input).input);
    },
  },
  {
    id: "unicode-punycode-converter",
    name: "tooltab_unicode_punycode_converter",
    description:
      "Encode/decode domain labels using reversible raw Punycode; validates DNS ASCII label lengths, but does not apply IDNA mapping or claim domain registration validity.",
    inputSchema: domain,
    outputSchema: z.strictObject({ ascii: z.string(), unicode: z.string() }),
    bodyLimit: 30000,
    idempotent: true,
    run(input) {
      const p = domain.parse(input);
      return convertDomain(p.input, p.direction);
    },
  },
  {
    id: "url-parser-builder",
    name: "tooltab_url_parser_builder",
    description:
      "Parse/build absolute URLs locally with credentials, path, fragment and ordered duplicate query entries. Preserve encoded path separators; no requests are made.",
    inputSchema: url,
    outputSchema: z.strictObject({
      url: z.string(),
      draft: urlDraftSchema,
      origin: z.string(),
      host: z.string(),
      pathSegments: z.number(),
      queryCount: z.number(),
    }),
    bodyLimit: 1000000,
    idempotent: true,
    run(input) {
      const p = url.parse(input);
      return p.operation === "parse" ? parseUrl(p.input) : buildUrl(p.draft);
    },
  },
];
