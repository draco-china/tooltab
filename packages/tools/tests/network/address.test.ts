import punycode from "punycode/";
import { expect, it, vi } from "vitest";
import {
  buildUrl,
  convertDomain,
  ipv6ToMac,
  macToIpv6,
  parseUrl,
} from "../../src/network/address";

it("derives RFC4291 modified EUI64 values and accepts all MAC spellings", () => {
  for (const mac of [
    "00:11:22:33:44:55",
    "00-11-22-33-44-55",
    "0011.2233.4455",
    "001122334455",
  ])
    expect(macToIpv6(mac, " en0 ").ipv6).toBe("fe80::211:22ff:fe33:4455%en0");
  expect(macToIpv6("AA:BB:CC:DD:EE:FF").ipv6).toBe("fe80::a8bb:ccff:fedd:eeff");
  for (const bad of ["00:11-22:33:44:55", "00112233445G", "00112233445566"])
    expect(() => macToIpv6(bad)).toThrow("invalid_mac");
  expect(() => macToIpv6("001122334455", "eth0 bad")).toThrow("invalid_zone");
});
it("reverses valid EUI64 identifiers but does not infer arbitrary IPv6 MACs", () => {
  expect(
    ipv6ToMac("FE80:0000:0000:0000:A8BB:CCFF:FEDD:EEFF%eth0"),
  ).toMatchObject({ convertible: true, mac: "AA:BB:CC:DD:EE:FF" });
  expect(ipv6ToMac("2001:db8::211:22ff:fe33:4455").mac).toBe(
    "00:11:22:33:44:55",
  );
  expect(ipv6ToMac("::ffff:192.0.2.128").convertible).toBe(false);
  for (const s of [
    "2001:::1",
    "1::2::3",
    "::ffff:192.0.2.999",
    "1:2:3:4:5:6:7:8::",
    "::%",
  ])
    expect(() => ipv6ToMac(s)).toThrow();
});
it("matches raw RFC3492 domain vectors and preserves variation selectors", () => {
  expect(convertDomain("bücher.de").ascii).toBe("xn--bcher-kva.de");
  expect(convertDomain("xn--bcher-kva.de", "unicode").unicode).toBe(
    "bücher.de",
  );
  expect(convertDomain("🕸️.com").ascii).toBe("xn--v86c4184b.com");
  expect(convertDomain("example。com.").ascii).toBe("example.com.");
  expect(convertDomain("")).toEqual({ ascii: "", unicode: "" });
  for (const s of [
    "xn--b.com",
    "xn--a-.com",
    "example..com",
    "-a.com",
    `${"a".repeat(64)}.com`,
    "\u0080.com",
    "bad domain",
  ])
    expect(
      () => convertDomain(s, s.startsWith("xn--") ? "unicode" : "ascii"),
      s,
    ).toThrow();
  expect(() => convertDomain("\uD800")).toThrow("invalid_unicode");
});
it("parses and rebuilds escaped separators, credentials and ordered empty/duplicate parameters", () => {
  const input =
    "https://u:p%3Aa@example.com:8443/a%2Fb/blue%20mug?x=1&x=2&=&empty=#hello%20world";
  const parsed = parseUrl(input);
  expect(parsed.draft.password).toBe("p:a");
  expect(parsed.draft.pathname).toBe("/a%2Fb/blue%20mug");
  expect(parsed.queryCount).toBe(4);
  expect(buildUrl(parsed.draft).url).toBe(input);
  expect(
    buildUrl({
      ...parsed.draft,
      queryEntries: [
        { key: "tag", value: "a b" },
        { key: "tag", value: "c" },
      ],
    }).url,
  ).toContain("?tag=a+b&tag=c");
  expect(parseUrl("https://example.com/blue mug").url).toBe(
    "https://example.com/blue%20mug",
  );
});
it("handles opaque and file URLs and rejects invalid structured ports/authority/encoding", () => {
  for (const input of [
    "mailto:hello@example.com?subject=Hi",
    "file:///tmp/a%20b",
    "urn:example:animal:ferret:nose",
  ])
    expect(buildUrl(parseUrl(input).draft).url).toBe(input);
  const d = parseUrl("https://example.com/").draft;
  for (const patch of [
    { port: "0" },
    { port: "65536" },
    { hostname: "example.com:8443" },
    { hostname: "evil@host" },
    { pathname: "/bad%zz" },
  ])
    expect(() => buildUrl({ ...d, ...patch })).toThrow();
  expect(() => parseUrl("https://example.com/?bad=%FF")).toThrow("invalid_url");
  expect(() =>
    buildUrl({ ...d, queryEntries: [{ key: "a", value: "x".repeat(100000) }] }),
  ).toThrow("too_large");
});
it("rejects ACE labels containing alternate domain separators", async () => {
  const { default: punycode } = await import("punycode/");
  for (const separator of ["。", "．", "｡"]) {
    const ace = `xn--${punycode.encode(`a${separator}b`)}`;
    expect(() => convertDomain(ace, "unicode")).toThrow("invalid_domain");
    expect(() => convertDomain(ace, "ascii")).toThrow("invalid_domain");
  }
  expect(() => macToIpv6("001122334455", " ".repeat(101))).toThrow("too_large");
});
it("rejects path controls before WHATWG setters silently remove them", () => {
  const draft = parseUrl("https://example.com/").draft;
  expect(() => buildUrl({ ...draft, pathname: "/a\nb" })).toThrow(
    "invalid_url",
  );
});

it("rejects concrete boundary inputs for MAC, domain and URL operations", () => {
  expect(() => macToIpv6("x".repeat(101))).toThrow("too_large");
  expect(() => ipv6ToMac("x".repeat(201))).toThrow("too_large");
  expect(() => ipv6ToMac("fe80::1%bad zone")).toThrow("invalid_zone");
  expect(() => convertDomain("example.com", "bad" as never)).toThrow(
    "invalid_domain",
  );
  expect(() => convertDomain("x".repeat(254))).toThrow("invalid_domain");
  expect(() => parseUrl("https://example.com/%zz")).toThrow("invalid_url");
  expect(() => parseUrl("https://example.com/\u0000")).toThrow("invalid_url");
  const draft = parseUrl("https://example.com/").draft;
  expect(() => buildUrl({ ...draft, protocol: "1bad" })).toThrow("invalid_url");
  expect(() =>
    buildUrl({ ...draft, protocol: "mailto", opaque: true, hostname: "x" }),
  ).toThrow("invalid_url");
  expect(() => buildUrl({ ...draft, hostname: "" })).toThrow("invalid_url");
  expect(() =>
    buildUrl({
      ...draft,
      queryEntries: Array(1001).fill({ key: "a", value: "b" }),
    }),
  ).toThrow("too_large");
});

it("builds structured hierarchical and opaque URLs while rejecting every authority boundary", () => {
  const base = parseUrl("https://example.com/").draft;
  expect(
    buildUrl({
      ...base,
      username: "user",
      password: "p:a",
      port: "8443",
      pathname: "relative path",
      queryEntries: [{ key: "a", value: "b c" }],
      fragment: "a b",
    }).url,
  ).toBe("https://user:p%3Aa@example.com:8443/relative%20path?a=b+c#a%20b");
  expect(
    buildUrl({
      ...base,
      protocol: "mailto",
      hostname: "",
      pathname: "hello world?#",
      opaque: true,
      queryEntries: [],
      fragment: "",
    }).url,
  ).toBe("mailto:hello%20world%3F%23");
  expect(() =>
    buildUrl({ ...base, protocol: "file", hostname: "", username: "u" }),
  ).toThrow("invalid_url");
  for (const patch of [
    { protocol: "http\n" },
    { port: "abc" },
    { port: "0" },
    { port: "65536" },
    { hostname: "bad host" },
    { hostname: "::1" },
    { pathname: "/bad%zz" },
  ])
    expect(() => buildUrl({ ...base, ...patch })).toThrow();
  expect(() => buildUrl({ ...base, fragment: "x".repeat(100001) })).toThrow(
    "too_large",
  );
  expect(() =>
    buildUrl({ ...base, hostname: "a".repeat(99990), pathname: "/1234567890" }),
  ).toThrow("too_large");
});

it("covers URL parser and domain length boundaries", () => {
  expect(() => parseUrl("http://[")).toThrow("invalid_url");
  expect(() => ipv6ToMac("not-an-ipv6")).toThrow("invalid_ipv6");
  expect(ipv6ToMac("2001:db8::").convertible).toBe(false);
  expect(ipv6ToMac("1:2:3:4:5:6:7:8").convertible).toBe(false);
  const longDomain = [
    "a".repeat(63),
    "b".repeat(63),
    "c".repeat(63),
    "d".repeat(63),
  ].join(".");
  expect(() => convertDomain(longDomain)).toThrow("invalid_domain");
  const query = Array.from({ length: 1001 }, (_, index) => `k${index}=v`).join(
    "&",
  );
  expect(() => parseUrl(`https://example.com/?${query}`)).toThrow("too_large");
  expect(() =>
    buildUrl({
      ...parseUrl("https://example.com/").draft,
      pathname: " ".repeat(40_000),
    }),
  ).toThrow("too_large");
  expect(() =>
    buildUrl({
      ...parseUrl("mailto:hello@example.com").draft,
      opaque: true,
      pathname: "//host/path",
      hostname: "",
      port: "",
      username: "",
      password: "",
    }),
  ).toThrow("invalid_url");
});

it("maps unexpected punycode failures to invalid domain", () => {
  const encode = vi.spyOn(punycode, "encode").mockImplementation(() => {
    throw new Error("punycode failure");
  });
  expect(() => convertDomain("é.example")).toThrow("invalid_domain");
  encode.mockRestore();
});
