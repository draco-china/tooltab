import { describe, expect, it } from "vitest";
import {
  architecture,
  detectBrowser,
  type DeviceHintBrand,
} from "../../src/network/device-hints";

describe("detectBrowser", () => {
  it.each([
    ["Edg/120.0", "Edge"],
    ["Microsoft Edge 120", "Edge"],
    ["OPR/105.0", "Opera"],
    ["Opera/105.0", "Opera"],
    ["Firefox/121.0", "Firefox"],
    ["Chrome/121.0", "Chrome"],
    ["CriOS/121.0", "Chrome"],
    ["Google Chrome 121", "Chrome"],
    ["Safari/605.1", "Safari"],
  ])("detects %s as %s", (userAgent, expected) => {
    expect(detectBrowser(userAgent)).toBe(expected);
  });

  it("uses brands when the user agent has no browser marker", () => {
    const brands: readonly DeviceHintBrand[] = [{ brand: "Google Chrome" }];
    expect(detectBrowser("custom-client", brands)).toBe("Chrome");
  });

  it.each([
    ["Edg/120 Chrome/120 Safari/605", "Edge"],
    ["OPR/105 Chrome/120 Safari/605", "Opera"],
    ["Firefox/121 Chrome/120 Safari/605", "Firefox"],
    ["Chrome/120 Safari/605", "Chrome"],
    ["Safari/605", "Safari"],
  ])("keeps detector precedence for %s", (userAgent, expected) => {
    expect(detectBrowser(userAgent)).toBe(expected);
  });

  it.each(["", "custom-client", "Mozilla/5.0"])(
    "returns undefined for unknown user agent %j",
    (userAgent) => {
      expect(detectBrowser(userAgent)).toBeUndefined();
    },
  );
});

describe("architecture", () => {
  it.each([
    ["aarch64", "ARM64"],
    ["arm64", "ARM64"],
    ["armv8", "ARM"],
    ["x86_64", "x86_64"],
    ["x64", "x86_64"],
    ["Win64", "x86_64"],
    ["i686", "x86"],
    ["i386", "x86"],
    ["x86", "x86"],
  ])("detects %s as %s", (userAgent, expected) => {
    expect(architecture(userAgent)).toBe(expected);
  });

  it("returns a trimmed explicit architecture before user agent hints", () => {
    expect(architecture("arm64", "  custom-arch  ")).toBe("custom-arch");
  });

  it.each([undefined, "", " \t\n "])(
    "falls back when explicit architecture is empty (%j)",
    (explicit) => {
      expect(architecture("arm64", explicit)).toBe("ARM64");
    },
  );

  it.each(["", "custom-client"])(
    "returns undefined for unknown or empty user agent %j",
    (userAgent) => {
      expect(architecture(userAgent)).toBeUndefined();
    },
  );
});
