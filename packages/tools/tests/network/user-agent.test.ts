import { expect, it } from "vitest";
import {
  MAX_UA_LENGTH,
  parseUserAgent,
  UserAgentError,
} from "../../src/network/user-agent";

const desktop =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36";
const mobile =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

it("returns complete desktop browser, OS, engine and CPU data", () => {
  expect(parseUserAgent(desktop)).toEqual({
    ua: desktop,
    browser: { name: "Chrome", version: "115.0.0.0", major: "115" },
    os: { name: "Windows", version: "10" },
    engine: { name: "Blink", version: "115.0.0.0" },
    device: { type: null, vendor: null, model: null },
    cpu: { architecture: "amd64" },
  });
});

it("returns complete mobile device data and nulls unknown fields", () => {
  expect(parseUserAgent(mobile)).toEqual({
    ua: mobile,
    browser: { name: "Mobile Safari", version: "17.0", major: "17" },
    os: { name: "iOS", version: "17.0" },
    engine: { name: "WebKit", version: "605.1.15" },
    device: { type: "mobile", vendor: "Apple", model: "iPhone" },
    cpu: { architecture: null },
  });
  expect(parseUserAgent("custom-client")).toEqual({
    ua: "custom-client",
    browser: { name: null, version: null, major: null },
    os: { name: null, version: null },
    engine: { name: null, version: null },
    device: { type: null, vendor: null, model: null },
    cpu: { architecture: null },
  });
});

it("trims whitespace and returns null for empty input", () => {
  expect(parseUserAgent("  custom-client  ")?.ua).toBe("custom-client");
  expect(parseUserAgent(" \t\n ")).toBeNull();
});

it("rejects control characters, DEL and isolated surrogates", () => {
  for (const input of [
    "hello\nworld",
    "hello\x7fworld",
    "hello\ud800world",
    "hello\udc00world",
  ])
    expect(() => parseUserAgent(input)).toThrow(UserAgentError);
  expect(() => parseUserAgent("hello\nworld")).toThrow(
    expect.objectContaining({
      name: "DeveloperParserError",
      code: "invalid_input",
    }),
  );
});

it("enforces the 500 UTF-16 code-unit limit", () => {
  expect(parseUserAgent("😀".repeat(250))?.ua).toBe("😀".repeat(250));
  expect(() => parseUserAgent("😀".repeat(251))).toThrow(
    expect.objectContaining({ code: "too_large" }),
  );
  expect(parseUserAgent("a".repeat(MAX_UA_LENGTH))?.ua).toHaveLength(
    MAX_UA_LENGTH,
  );
  expect(() => parseUserAgent("a".repeat(MAX_UA_LENGTH + 1))).toThrow(
    expect.objectContaining({
      code: "too_large",
      name: "DeveloperParserError",
    }),
  );
});
