import { expect, it } from "vitest";
import {
  CidrError,
  cover,
  formatIp,
  mergeLines,
  mergeCidrs,
  normalizeIpCidr,
  parseCidr,
  parseIp,
  prepareMerge,
  rangeToCidrs,
} from "../../src/network/cidr";

it("parses IPv4 independent integer and mask vectors", () => {
  expect(parseCidr("192.168.10.34/24")).toMatchObject({
    canonicalCidr: "192.168.10.0/24",
    netmask: "255.255.255.0",
    wildcardMask: "0.0.0.255",
    startInteger: "3232238080",
    endInteger: "3232238335",
    addressCount: "256",
    usableAddressCount: "254",
    firstUsable: "192.168.10.1",
    lastUsable: "192.168.10.254",
  });
  expect(parseCidr("10.0.0.0/31").usableAddressCount).toBe("2");
  expect(parseCidr("10.0.0.1/32").usableAddressCount).toBe("1");
});
it("handles entire IPv6 and IPv4 universes without enumeration", () => {
  expect(parseCidr("::/0").addressCount).toBe(
    "340282366920938463463374607431768211456",
  );
  expect(
    rangeToCidrs("::", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff").cidrs,
  ).toEqual(["::/0"]);
  expect(rangeToCidrs("0.0.0.0", "255.255.255.255").cidrs).toEqual([
    "0.0.0.0/0",
  ]);
  expect(parseCidr("2001:db8::1/64")).toMatchObject({
    broadcastAddress: null,
    netmask: null,
    addressCount: "18446744073709551616",
    canonicalCidr: "2001:db8::/64",
  });
});
it("normalizes decimal leading zeros and IPv4-tail IPv6", () => {
  expect(normalizeIpCidr("010.000.001.001")).toBe("10.0.1.1");
  expect(normalizeIpCidr("::ffff:192.168.0.1")).toBe("::ffff:c0a8:1");
  expect(normalizeIpCidr("2001:0db8:0:1:0:0:0:1")).toBe("2001:db8:0:1::1");
  for (const invalid of [
    "1.2.3",
    "0x7f.0.0.1",
    "1:2:3:4:5:6:7:8::",
    "2001:::1",
    "fe80::1%en0",
    "[::1]",
    "::ffff:999.0.0.1",
  ])
    expect(() => parseIp(invalid)).toThrow(CidrError);
});
it("covers inclusive unaligned ranges minimally", () => {
  expect(rangeToCidrs("192.168.1.10", "192.168.1.25").cidrs).toEqual([
    "192.168.1.10/31",
    "192.168.1.12/30",
    "192.168.1.16/29",
    "192.168.1.24/31",
  ]);
  expect(rangeToCidrs("::1", "::7").cidrs).toEqual([
    "::1/128",
    "::2/127",
    "::4/126",
  ]);
  expect(() => rangeToCidrs("::", "1.1.1.1")).toThrow("mixed_family");
  expect(() => rangeToCidrs("::2", "::1")).toThrow("reversed");
});
it("merges, subtracts, sorts and deduplicates mixed families", () => {
  expect(
    mergeCidrs(
      "192.168.1.0/24,192.168.0.0/24 192.168.0.0/25\n2001:db8::/126",
      "2001:db8::1/128",
    ).cidrs,
  ).toEqual(["192.168.0.0/23", "2001:db8::/128", "2001:db8::2/127"]);
  expect(mergeCidrs("10.0.0.0/24", "10.0.0.64/26").cidrs).toEqual([
    "10.0.0.0/26",
    "10.0.0.128/25",
  ]);
  expect(mergeCidrs("::/0", "::/0").cidrs).toEqual([]);
  expect(mergeCidrs("::/0", "::1/128").blockCount).toBe(128);
});
it("preserves group and original line for all invalid entries", () => {
  try {
    mergeCidrs("10.0.0.0/24\r\ninvalid, /24", "\n::/129");
    throw Error("expected");
  } catch (e) {
    expect((e as CidrError).issues).toEqual([
      { group: "merge", line: 2, value: "invalid" },
      { group: "merge", line: 2, value: "/24" },
      { group: "exclude", line: 2, value: "::/129" },
    ]);
  }
});
it("handles 200000 CIDRs and strict capacity", () => {
  const input = Array(200000).fill("::/0").join("\n");
  expect(mergeCidrs(input, "").cidrs).toEqual(["::/0"]);
  expect(() => mergeCidrs(`${input}\n::/0`, "")).toThrow("too_large");
});

it("covers public boundary errors and exposed interval iterators", () => {
  expect(() => parseIp("x".repeat(101))).toThrow("invalid_ip");
  expect(() => parseIp("1::2::3")).toThrow("invalid_ip");
  expect(formatIp(1n, 6)).toBe("::1");
  expect(normalizeIpCidr("10.0.0.7/24")).toBe("10.0.0.0/24");
  for (const value of [
    "x",
    "1.1.1.1",
    "1.1.1.1/33",
    "1.1.1.1/24/2",
    "x/24",
    "x".repeat(111),
  ])
    expect(() => parseCidr(value)).toThrow("invalid_cidr");
  expect([...cover(2n, 1n, 4)]).toEqual([]);
  expect(() => prepareMerge("", "")).toThrow("missing_merge");
  const prepared = prepareMerge("::1/128 ::1/128", "1.1.1.1/32");
  expect([...mergeLines(prepared)]).toEqual(["::1/128"]);
  expect(mergeCidrs("10.0.0.0/24 10.0.0.0/25", "").cidrs).toEqual([
    "10.0.0.0/24",
  ]);
  expect(mergeCidrs("10.0.0.0/24", "10.0.0.0/25").cidrs).toEqual([
    "10.0.0.128/25",
  ]);
  expect(() => prepareMerge("x".repeat(10_000_001), "")).toThrow("too_large");
});

it("normalizes either input order and subtracts disjoint exclusions once", () => {
  for (const source of [
    "10.0.0.0/26 10.0.0.128/26 10.0.0.64/26",
    "10.0.0.128/26 10.0.0.64/26 10.0.0.0/26",
  ]) {
    expect(
      mergeCidrs(source, "10.0.0.0/27 10.0.0.32/27 10.0.0.128/26").cidrs,
    ).toEqual(["10.0.0.64/26"]);
  }
});
