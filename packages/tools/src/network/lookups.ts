import { formatIp, parseIp } from "./cidr";

export const DNS_RECORD_TYPES = [
  "A",
  "NS",
  "CNAME",
  "SOA",
  "PTR",
  "HINFO",
  "MX",
  "TXT",
  "RP",
  "AFSDB",
  "SIG",
  "KEY",
  "AAAA",
  "LOC",
  "SRV",
  "NAPTR",
  "KX",
  "CERT",
  "DNAME",
  "APL",
  "DS",
  "SSHFP",
  "IPSECKEY",
  "RRSIG",
  "NSEC",
  "DNSKEY",
  "DHCID",
  "NSEC3",
  "NSEC3PARAM",
  "TLSA",
  "SMIMEA",
  "HIP",
  "CDS",
  "CDNSKEY",
  "OPENPGPKEY",
  "CSYNC",
  "ZONEMD",
  "CAA",
  "SVCB",
  "HTTPS",
  "EUI48",
  "EUI64",
  "TKEY",
  "TSIG",
  "ANY",
  "URI",
  "TA",
  "DLV",
] as const;
export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];
export const RESOLVERS = {
  cloudflare: {
    label: "Cloudflare",
    url: "https://cloudflare-dns.com/dns-query",
  },
  google: { label: "Google", url: "https://dns.google/resolve" },
  alidns: { label: "AliDNS", url: "https://dns.alidns.com/resolve" },
} as const;
export type ResolverId = keyof typeof RESOLVERS;

const DNS_CODES: Record<number, string> = {
  0: "NOERROR",
  1: "FORMERR",
  2: "SERVFAIL",
  3: "NXDOMAIN",
  4: "NOTIMP",
  5: "REFUSED",
};
const DNS_ANSWER_TYPES = new Map<number, string>([
  [1, "A"],
  [2, "NS"],
  [5, "CNAME"],
  [6, "SOA"],
  [12, "PTR"],
  [13, "HINFO"],
  [15, "MX"],
  [16, "TXT"],
  [17, "RP"],
  [18, "AFSDB"],
  [24, "SIG"],
  [25, "KEY"],
  [28, "AAAA"],
  [29, "LOC"],
  [33, "SRV"],
  [35, "NAPTR"],
  [36, "KX"],
  [37, "CERT"],
  [39, "DNAME"],
  [42, "APL"],
  [43, "DS"],
  [44, "SSHFP"],
  [45, "IPSECKEY"],
  [46, "RRSIG"],
  [47, "NSEC"],
  [48, "DNSKEY"],
  [49, "DHCID"],
  [50, "NSEC3"],
  [51, "NSEC3PARAM"],
  [52, "TLSA"],
  [53, "SMIMEA"],
  [55, "HIP"],
  [59, "CDS"],
  [60, "CDNSKEY"],
  [61, "OPENPGPKEY"],
  [62, "CSYNC"],
  [63, "ZONEMD"],
  [64, "SVCB"],
  [65, "HTTPS"],
  [108, "EUI48"],
  [109, "EUI64"],
  [249, "TKEY"],
  [250, "TSIG"],
  [255, "ANY"],
  [256, "URI"],
  [257, "CAA"],
  [32768, "TA"],
  [32769, "DLV"],
]);
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_ANSWERS = 500;

export class NetworkLookupError extends Error {
  constructor(
    public readonly code:
      | "invalid_domain"
      | "invalid_ip"
      | "invalid_target"
      | "network_failed"
      | "invalid_response",
    message: string = code,
  ) {
    super(message);
  }
}

export type DnsAnswer = {
  name: string;
  type: string;
  typeCode: number;
  ttl: number;
  data: string;
};
export type DnsResult = {
  recordType: DnsRecordType;
  status: number;
  statusLabel: string;
  flags: { tc: boolean; rd: boolean; ra: boolean; ad: boolean; cd: boolean };
  answers: DnsAnswer[];
  comment: string | null;
};
type DnsJson = {
  Status?: unknown;
  TC?: unknown;
  RD?: unknown;
  RA?: unknown;
  AD?: unknown;
  CD?: unknown;
  Answer?: unknown;
  Comment?: unknown;
};

export type IpInfo = {
  hostname: string | null;
  isp: string | null;
  organization: string | null;
  asn: number | null;
  asnOrganization: string | null;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
};

export function normalizeDomain(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048)
    throw new NetworkLookupError("invalid_domain");
  let hostname: string;
  try {
    hostname = new URL(
      /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`,
    ).hostname
      .toLowerCase()
      .replace(/\.$/u, "");
  } catch {
    throw new NetworkLookupError("invalid_domain");
  }
  const labels = hostname.split(".");
  if (
    hostname.length > 253 ||
    labels.length < 2 ||
    labels.some(
      (label) =>
        !/^[a-z0-9-]{1,63}$/u.test(label) ||
        label.startsWith("-") ||
        label.endsWith("-"),
    )
  )
    throw new NetworkLookupError("invalid_domain");
  return hostname;
}

export function normalizeIp(value: string) {
  const trimmed = value.trim();
  const raw =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;
  try {
    const parsed = parseIp(raw);
    return {
      address: formatIp(parsed.value, parsed.family),
      family: parsed.family,
      value: parsed.value,
    } as const;
  } catch {
    throw new NetworkLookupError("invalid_ip");
  }
}

export function parseLookupTarget(value: string) {
  try {
    const ip = normalizeIp(value);
    return {
      kind: "ip" as const,
      input: value.trim(),
      normalized: ip.address,
      address: ip.address,
      family: ip.family,
    };
  } catch {
    try {
      const normalized = normalizeDomain(value);
      return { kind: "domain" as const, input: value.trim(), normalized };
    } catch {
      throw new NetworkLookupError("invalid_target");
    }
  }
}

export function reverseDomain(value: string) {
  const ip = normalizeIp(value);
  if (ip.family === 4)
    return `${ip.address.split(".").reverse().join(".")}.in-addr.arpa`;
  const hex = ip.value.toString(16).padStart(32, "0");
  return `${[...hex].reverse().join(".")}.ip6.arpa`;
}

export function parseDnsResponse(
  value: unknown,
): Omit<DnsResult, "recordType"> {
  if (!value || typeof value !== "object")
    throw new NetworkLookupError("invalid_response");
  const raw = value as DnsJson;
  if (!Number.isInteger(raw.Status) || (raw.Status as number) < 0)
    throw new NetworkLookupError("invalid_response");
  const rows = raw.Answer === undefined ? [] : raw.Answer;
  if (!Array.isArray(rows) || rows.length > MAX_ANSWERS)
    throw new NetworkLookupError("invalid_response");
  const answers = rows.map((row) => {
    if (!row || typeof row !== "object")
      throw new NetworkLookupError("invalid_response");
    const item = row as Record<string, unknown>;
    if (
      typeof item.name !== "string" ||
      item.name.length > 4096 ||
      !Number.isInteger(item.type) ||
      !Number.isInteger(item.TTL) ||
      (item.TTL as number) < 0 ||
      typeof item.data !== "string" ||
      item.data.length > 16_384
    )
      throw new NetworkLookupError("invalid_response");
    return {
      name: item.name,
      type: DNS_ANSWER_TYPES.get(item.type as number) ?? String(item.type),
      typeCode: item.type as number,
      ttl: item.TTL as number,
      data: item.data,
    };
  });
  const status = raw.Status as number;
  return {
    status,
    statusLabel: DNS_CODES[status] ?? `RCODE ${status}`,
    flags: {
      tc: raw.TC === true,
      rd: raw.RD === true,
      ra: raw.RA === true,
      ad: raw.AD === true,
      cd: raw.CD === true,
    },
    answers,
    comment:
      typeof raw.Comment === "string" ? raw.Comment.slice(0, 4096) : null,
  };
}

export function dohUrl(
  resolver: ResolverId,
  name: string,
  type: string,
  dnssec = false,
  checkingDisabled = false,
) {
  const url = new URL(RESOLVERS[resolver].url);
  url.search = new URLSearchParams({ name, type }).toString();
  if (dnssec) url.searchParams.set("do", "1");
  if (checkingDisabled) url.searchParams.set("cd", "1");
  return url.toString();
}

export function isPublicIp(address: string) {
  const ip = normalizeIp(address);
  if (ip.family === 4) {
    const n = Number(ip.value);
    const first = n >>> 24;
    const second = (n >>> 16) & 255;
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0)
    );
  }
  const n = ip.value;
  const top3 = Number(n >> 125n);
  const documentationPrefix = 0x20010db8n;
  return top3 === 1 && n >> 96n !== documentationPrefix;
}

type ProviderObject = Record<string, unknown> | undefined;
function stringValue(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 1000)
    : undefined;
}
function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function mergeIpMetadata(
  geojs: ProviderObject,
  ipsb: ProviderObject,
  ptr: ProviderObject,
): IpInfo {
  const get = (key: string) =>
    stringValue(geojs?.[key]) ?? stringValue(ipsb?.[key]);
  const num = (key: string) =>
    numberValue(geojs?.[key]) ?? numberValue(ipsb?.[key]);
  const hostname = stringValue(ptr?.ptr);
  return {
    hostname:
      hostname && hostname !== "Failed to get PTR record" ? hostname : null,
    isp: stringValue(ipsb?.isp) ?? null,
    organization: get("organization") ?? null,
    asn: num("asn") ?? null,
    asnOrganization:
      stringValue(geojs?.organization_name) ??
      stringValue(ipsb?.asn_organization) ??
      null,
    country: get("country") ?? null,
    countryCode: get("country_code") ?? null,
    region: get("region") ?? null,
    city: get("city") ?? null,
    postalCode: stringValue(ipsb?.postal_code) ?? null,
    timezone: get("timezone") ?? null,
    latitude: num("latitude") ?? null,
    longitude: num("longitude") ?? null,
  };
}

export { MAX_ANSWERS, MAX_RESPONSE_BYTES };
