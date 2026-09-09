import { expect, it } from "vitest";
import {
  MAX_URL_INPUT,
  transformUrl,
  UrlCodecError,
} from "../../src/encoding/url";

it("preserves URI delimiters only in whole-URI mode", () => {
  const input = "https://example.test/中文?q=😀&x=1#标题";
  expect(transformUrl(input, "encode", "uri")).toBe(
    "https://example.test/%E4%B8%AD%E6%96%87?q=%F0%9F%98%80&x=1#%E6%A0%87%E9%A2%98",
  );
  expect(transformUrl("a/b?x=1&y=2", "encode")).toBe("a%2Fb%3Fx%3D1%26y%3D2");
  for (const mode of ["uri", "component"] as const) {
    expect(
      transformUrl(transformUrl(input, "encode", mode), "decode", mode),
    ).toBe(input);
    expect(transformUrl("", "encode", mode)).toBe("");
  }
  expect(transformUrl("%2F", "decode", "uri")).toBe("%2F");
  expect(transformUrl("%2F", "decode")).toBe("/");
  expect(transformUrl("a+b", "decode")).toBe("a+b");
});
it("rejects malformed Unicode and percent encodings", () => {
  for (const input of ["\ud800", "\udfff"])
    for (const operation of ["encode", "decode"] as const)
      expect(() => transformUrl(input, operation)).toThrow("invalid_unicode");
  for (const input of ["%", "%GG", "%C0%AF", "%ED%A0%80"])
    for (const mode of ["uri", "component"] as const)
      expect(() => transformUrl(input, "decode", mode)).toThrow(
        "invalid_encoding",
      );
  expect(() => transformUrl("", "bad" as never)).toThrow(
    "Invalid URL codec option",
  );
  expect(() => transformUrl("", "encode", "bad" as never)).toThrow(
    "Invalid URL codec option",
  );
});
it("enforces input capacity before options and encoding", () => {
  expect(transformUrl("a".repeat(MAX_URL_INPUT), "encode")).toHaveLength(
    MAX_URL_INPUT,
  );
  expect(() =>
    transformUrl("a".repeat(MAX_URL_INPUT + 1), "bad" as never),
  ).toThrow(UrlCodecError);
  expect(() => transformUrl("a".repeat(MAX_URL_INPUT + 1), "encode")).toThrow(
    "too_large",
  );
});
