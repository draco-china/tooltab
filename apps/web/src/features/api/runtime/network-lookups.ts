import * as z from "zod/v4";
import {
  inspectPublicAddresses,
  lookupDnsRecords,
  lookupIpInfoTarget,
  lookupReverseIp,
} from "@/features/tools/network-lookups/logic";
import {
  DNS_RECORD_TYPES,
  NetworkLookupError,
} from "@workspace/tools/network/lookups";
import type { Operation } from "./operation-contract";

const resolver = z
  .enum(["cloudflare", "google", "alidns"])
  .default("cloudflare");
const answer = z.strictObject({
  name: z.string(),
  type: z.string(),
  typeCode: z.number().int(),
  ttl: z.number().int().nonnegative(),
  data: z.string(),
});
const endpoint = z.string().url();

export const dnsLookupInputSchema = z.strictObject({
  name: z.string().min(1).max(2048),
  recordTypes: z
    .array(z.enum(DNS_RECORD_TYPES))
    .min(1)
    .max(DNS_RECORD_TYPES.length)
    .default(["A", "AAAA"]),
  resolver,
  dnssec: z.boolean().default(false),
  checkingDisabled: z.boolean().default(false),
});
export const dnsLookupOutputSchema = z.strictObject({
  name: z.string(),
  resolver,
  endpoint,
  results: z.array(
    z.strictObject({
      recordType: z.enum(DNS_RECORD_TYPES),
      status: z.number().int().nonnegative(),
      statusLabel: z.string(),
      flags: z.strictObject({
        tc: z.boolean(),
        rd: z.boolean(),
        ra: z.boolean(),
        ad: z.boolean(),
        cd: z.boolean(),
      }),
      answers: z.array(answer),
      comment: z.string().nullable(),
    }),
  ),
});

export const reverseIpLookupInputSchema = z.strictObject({
  ip: z.string().min(1).max(100),
  resolver,
});
export const reverseIpLookupOutputSchema = z.strictObject({
  ip: z.string(),
  family: z.union([z.literal(4), z.literal(6)]),
  reverseDomain: z.string(),
  resolver,
  endpoint,
  status: z.number().int().nonnegative(),
  statusLabel: z.string(),
  answers: z.array(
    z.strictObject({
      hostname: z.string(),
      rawHostname: z.string(),
      ttl: z.number().int().nonnegative(),
    }),
  ),
});

export const ipInfoSchema = z.strictObject({
  hostname: z.string().nullable(),
  isp: z.string().nullable(),
  organization: z.string().nullable(),
  asn: z.number().nullable(),
  asnOrganization: z.string().nullable(),
  country: z.string().nullable(),
  countryCode: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  timezone: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
export const ipInfoLookupInputSchema = z.strictObject({
  target: z.string().min(1).max(2048),
  resolver,
});
export const ipInfoLookupOutputSchema = z.strictObject({
  target: z.strictObject({
    kind: z.enum(["ip", "domain"]),
    input: z.string(),
    normalized: z.string(),
  }),
  resolver,
  endpoint,
  records: z.array(
    z.strictObject({
      type: z.enum(["A", "AAAA"]),
      value: z.string(),
      ttl: z.number().int().nonnegative(),
    }),
  ),
  addresses: z.array(
    z.strictObject({
      address: z.string(),
      family: z.union([z.literal(4), z.literal(6)]),
      info: ipInfoSchema,
      metadataStatus: z.enum(["available", "unavailable", "not-public"]),
    }),
  ),
});

export const networkLookupOperations: Operation[] = [
  {
    id: "dns-lookup",
    name: "tooltab_dns_lookup",
    description:
      "Query selected DNS record types through one of three fixed public DNS-over-HTTPS resolvers. The deployed ToolTab service performs the real request; arbitrary resolver URLs are rejected.",
    inputSchema: dnsLookupInputSchema,
    outputSchema: dnsLookupOutputSchema,
    bodyLimit: 10_000,
    idempotent: false,
    run(input, signal) {
      return lookupDnsRecords(dnsLookupInputSchema.parse(input), signal);
    },
  },
  {
    id: "reverse-ip-lookup",
    name: "tooltab_reverse_ip_lookup",
    description:
      "Convert one validated IPv4 or IPv6 address to its reverse DNS name and query PTR records through a fixed public DNS-over-HTTPS resolver.",
    inputSchema: reverseIpLookupInputSchema,
    outputSchema: reverseIpLookupOutputSchema,
    bodyLimit: 2_000,
    idempotent: false,
    run(input, signal) {
      return lookupReverseIp(reverseIpLookupInputSchema.parse(input), signal);
    },
  },
  {
    id: "ip-info-lookup",
    name: "tooltab_ip_info_lookup",
    description:
      "Resolve a validated public domain or inspect one IP address using fixed DNS-over-HTTPS, GeoJS and ip.sb endpoints. Returns up to eight resolved addresses; private or reserved addresses are never sent to metadata providers.",
    inputSchema: ipInfoLookupInputSchema,
    outputSchema: ipInfoLookupOutputSchema,
    bodyLimit: 4_000,
    idempotent: false,
    run(input, signal) {
      return lookupIpInfoTarget(ipInfoLookupInputSchema.parse(input), signal);
    },
  },
];

export const myIpAddressInputSchema = z.strictObject({});
export const myIpAddressOutputSchema = z.strictObject({
  source: z.literal("deployed-service-egress"),
  observedAt: z.string().datetime(),
  addresses: z.array(
    z.strictObject({
      version: z.enum(["ipv4", "ipv6"]),
      address: z.string(),
      provider: z.string(),
      info: ipInfoSchema,
      metadataStatus: z.enum(["available", "unavailable", "not-public"]),
    }),
  ),
  callerAddress: z.null(),
  webrtc: z.strictObject({
    status: z.literal("unavailable"),
    reason: z.string(),
  }),
  notice: z.string(),
});
export const myIpAddressOperation: Operation = {
  id: "my-ip-address",
  name: "tooltab_my_ip_address",
  description:
    "Observe the deployed ToolTab service's actual public egress IPv4 and/or IPv6 address through fixed providers and enrich it with network metadata. This does not return the caller's IP and cannot run browser WebRTC discovery.",
  inputSchema: myIpAddressInputSchema,
  outputSchema: myIpAddressOutputSchema,
  bodyLimit: 1_000,
  idempotent: false,
  async run(input, signal) {
    myIpAddressInputSchema.parse(input);
    return {
      source: "deployed-service-egress" as const,
      observedAt: new Date().toISOString(),
      addresses: await inspectPublicAddresses(signal),
      callerAddress: null,
      webrtc: {
        status: "unavailable" as const,
        reason:
          "The deployed API and MCP server cannot inspect WebRTC candidates in the caller's browser.",
      },
      notice:
        "These addresses belong to the deployed ToolTab service connection, not the calling user's device.",
    };
  },
};

export { NetworkLookupError };
