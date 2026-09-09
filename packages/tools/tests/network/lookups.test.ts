import { describe, expect, it } from "vitest";
import {
  DNS_RECORD_TYPES,
  MAX_ANSWERS,
  NetworkLookupError,
  RESOLVERS,
  dohUrl,
  isPublicIp,
  mergeIpMetadata,
  normalizeDomain,
  normalizeIp,
  parseDnsResponse,
  parseLookupTarget,
  reverseDomain,
} from "../../src/network/lookups";

describe("network lookup pure domain rules", () => {
  it("normalizes domains and both IP families", () => {
    expect(normalizeDomain("https://EXAMPLE.com/path")).toBe("example.com");
    expect(normalizeDomain(" example.com. ")).toBe("example.com");
    expect(normalizeIp("192.0.2.1")).toMatchObject({
      address: "192.0.2.1",
      family: 4,
    });
    expect(normalizeIp("[2001:db8::1]")).toMatchObject({
      address: "2001:db8::1",
      family: 6,
    });
    expect(parseLookupTarget("https://example.com/a")).toMatchObject({
      kind: "domain",
      normalized: "example.com",
    });
    expect(parseLookupTarget("8.8.8.8")).toMatchObject({
      kind: "ip",
      normalized: "8.8.8.8",
    });
  });

  it("rejects invalid domain, IP and target inputs with original codes", () => {
    expect(() => normalizeDomain("localhost")).toThrow("invalid_domain");
    expect(() => normalizeDomain("-bad.example")).toThrow("invalid_domain");
    expect(() => normalizeIp("127.0.0.1:80")).toThrow("invalid_ip");
    expect(() => parseLookupTarget("not a target")).toThrow("invalid_target");
    expect(() => normalizeDomain("x".repeat(2049))).toThrow(
      new NetworkLookupError("invalid_domain"),
    );
  });

  it("builds RFC reverse names for IPv4 and IPv6", () => {
    expect(reverseDomain("1.2.3.4")).toBe("4.3.2.1.in-addr.arpa");
    expect(reverseDomain("2001:db8::1")).toBe(
      "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa",
    );
  });

  it("classifies private, reserved and public IPv4/IPv6 ranges", () => {
    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.0.0.1",
      "192.168.1.1",
      "198.18.0.1",
      "203.0.113.1",
      "224.0.0.1",
      "2001:db8::1",
    ])
      expect(isPublicIp(address), address).toBe(false);
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("2001:4860:4860::8888")).toBe(true);
  });
});

describe("DNS response and resolver contracts", () => {
  it("normalizes a valid response, flags and unknown codes/types", () => {
    const result = parseDnsResponse({
      Status: 99,
      TC: true,
      RD: true,
      RA: true,
      AD: true,
      CD: true,
      Comment: "x".repeat(5000),
      Answer: [
        { name: "example.com.", type: 1, TTL: 300, data: "93.184.216.34" },
        { name: "example.com.", type: 999, TTL: 0, data: "opaque" },
      ],
    });
    expect(result).toMatchObject({
      statusLabel: "RCODE 99",
      comment: "x".repeat(4096),
      flags: { tc: true, rd: true, ra: true, ad: true, cd: true },
      answers: [
        { type: "A", typeCode: 1 },
        { type: "999", typeCode: 999 },
      ],
    });
  });

  it("accepts empty answers and rejects malformed or oversized responses", () => {
    expect(parseDnsResponse({ Status: 0, Answer: undefined }).answers).toEqual(
      [],
    );
    expect(() => parseDnsResponse(null)).toThrow("invalid_response");
    expect(() => parseDnsResponse({ Status: -1 })).toThrow("invalid_response");
    expect(() => parseDnsResponse({ Status: 0, Answer: [null] })).toThrow(
      "invalid_response",
    );
    expect(() =>
      parseDnsResponse({
        Status: 0,
        Answer: Array.from({ length: MAX_ANSWERS + 1 }, () => ({
          name: "x",
          type: 1,
          TTL: 1,
          data: "1.1.1.1",
        })),
      }),
    ).toThrow("invalid_response");
    expect(() =>
      parseDnsResponse({
        Status: 0,
        Answer: [{ name: "x", type: 1, TTL: -1, data: "1.1.1.1" }],
      }),
    ).toThrow("invalid_response");
    expect(() =>
      parseDnsResponse({
        Status: 0,
        Answer: [{ name: "x", type: 1, TTL: 1, data: "x".repeat(16385) }],
      }),
    ).toThrow("invalid_response");
  });

  it("builds fixed resolver URLs without network access", () => {
    expect(DNS_RECORD_TYPES).toContain("HTTPS");
    expect(Object.keys(RESOLVERS)).toEqual(["cloudflare", "google", "alidns"]);
    expect(dohUrl("cloudflare", "example.com", "A")).toBe(
      "https://cloudflare-dns.com/dns-query?name=example.com&type=A",
    );
    expect(dohUrl("google", "example.com", "AAAA", true, true)).toBe(
      "https://dns.google/resolve?name=example.com&type=AAAA&do=1&cd=1",
    );
  });
});

describe("IP metadata merge", () => {
  it("retains provider precedence, trims values and handles PTR fallback", () => {
    expect(
      mergeIpMetadata(
        {
          country: " United States ",
          city: "Mountain View",
          latitude: "37.4",
          organization_name: "Geo Org",
        },
        {
          isp: "Google LLC",
          asn: 15169,
          asn_organization: "ISP Org",
          postal_code: "94043",
        },
        { ptr: "dns.google." },
      ),
    ).toMatchObject({
      hostname: "dns.google.",
      isp: "Google LLC",
      country: "United States",
      asn: 15169,
      asnOrganization: "Geo Org",
      latitude: 37.4,
    });
    expect(
      mergeIpMetadata(undefined, undefined, {
        ptr: "Failed to get PTR record",
      }).hostname,
    ).toBeNull();
  });
});

it("keeps address classification boundaries distinct around excluded IPv4 ranges", () => {
  for (const address of [
    "100.63.255.255",
    "100.128.0.0",
    "169.253.255.255",
    "169.255.0.0",
    "172.15.255.255",
    "172.32.0.0",
    "198.17.255.255",
    "198.20.0.0",
    "198.52.0.0",
    "203.1.0.0",
  ]) {
    expect(isPublicIp(address), address).toBe(true);
  }
  for (const address of [
    "100.127.255.255",
    "172.31.255.255",
    "198.19.0.0",
    "198.51.100.1",
    "::1",
    "fe80::1",
    "fc00::1",
  ]) {
    expect(isPublicIp(address), address).toBe(false);
  }
});
