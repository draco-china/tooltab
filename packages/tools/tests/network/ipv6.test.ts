import { expect, it, vi } from "vitest";
import {
  derivePrefixes,
  formatIPv6,
  generateGlobalId,
  parseSubnetId,
  prefixFromBytes,
} from "../../src/network/ipv6";

it("formats RFC 5952 addresses and validates word arrays", () => {
  expect(formatIPv6([0, 0, 0, 0, 0, 0, 0, 0])).toBe("::");
  expect(formatIPv6([0x2001, 0xdb8, 0, 1, 0, 0, 0, 1])).toBe("2001:db8:0:1::1");
  expect(formatIPv6([1, 0, 0, 2, 0, 0, 3, 4])).toBe("1::2:0:0:3:4");
  expect(formatIPv6([1, 2, 3, 4, 5, 6, 7, 8])).toBe("1:2:3:4:5:6:7:8");
  for (const words of [
    [0],
    [0, 0, 0, 0, 0, 0, 0, 0x10000],
    [0, 0, 0, 0, 0, 0, 0, 0.5],
  ])
    expect(() => formatIPv6(words)).toThrow("Invalid IPv6 words");
});

it("creates and derives ULA prefixes from exactly five secure bytes", () => {
  expect(parseSubnetId("aBc")).toBe(0xabc);
  expect(parseSubnetId("xyz")).toBeNull();
  expect(prefixFromBytes(new Uint8Array([0, 1, 2, 3, 255]))).toBe("00010203ff");
  expect(() => prefixFromBytes(new Uint8Array(4))).toThrow();
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(255),
  });
  expect(generateGlobalId()).toBe("ffffffffff");
  vi.stubGlobal("crypto", undefined);
  expect(generateGlobalId).toThrow("Secure randomness unavailable");
  expect(derivePrefixes("00010203ff", 0xabc)).toEqual({
    prefix: "fd00:102:3ff::/48",
    firstSubnet: "fd00:102:3ff::/64",
    lastSubnet: "fd00:102:3ff:ffff::/64",
    selectedSubnet: "fd00:102:3ff:abc::/64",
  });
  expect(derivePrefixes("00010203ff").selectedSubnet).toBe("fd00:102:3ff::/64");
  expect(() => derivePrefixes("bad", 0)).toThrow("Invalid ULA input");
  expect(() => derivePrefixes("00010203ff", -1)).toThrow("Invalid ULA input");
  expect(() => derivePrefixes("00010203ff", 65536)).toThrow(
    "Invalid ULA input",
  );
  expect(() => derivePrefixes("00010203ff", 0.5)).toThrow("Invalid ULA input");
  vi.unstubAllGlobals();
});
