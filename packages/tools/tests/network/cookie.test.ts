import { expect, it } from "vitest";
import {
  HttpTextError,
  MAX_HTTP_TEXT,
  parseCookieHeaders,
} from "../../src/network/cookie";

it("parses Cookie pairs, preserves raw fragments, and reports invalid pairs", () => {
  const result = parseCookieHeaders(
    "Cookie: a=1; a=2; token=a=b; percent=%E4; broken\n\n",
    "cookie",
  );
  expect(result.cookies).toEqual([
    { name: "a", value: "1", attributes: [], raw: "a=1" },
    { name: "a", value: "2", attributes: [], raw: " a=2" },
    { name: "token", value: "a=b", attributes: [], raw: " token=a=b" },
    { name: "percent", value: "%E4", attributes: [], raw: " percent=%E4" },
  ]);
  expect(result.invalid).toEqual([
    { fragment: " broken", reason: "invalid_cookie_pair" },
  ]);
});

it("supports quoted values and rejects invalid cookie names or controls", () => {
  expect(parseCookieHeaders('a="hello-world"; b=', "cookie").cookies).toEqual([
    {
      name: "a",
      value: '"hello-world"',
      attributes: [],
      raw: 'a="hello-world"',
    },
    { name: "b", value: "", attributes: [], raw: " b=" },
  ]);
  const result = parseCookieHeaders(
    "bad name=x; ctl=ok\u0001; =missing",
    "cookie",
  );
  expect(result.cookies).toEqual([]);
  expect(result.invalid).toHaveLength(3);
  expect(
    result.invalid.every(({ reason }) => reason === "invalid_cookie_pair"),
  ).toBe(true);
});

it("parses Set-Cookie attributes, Expires commas, flags, and raw lines", () => {
  const result = parseCookieHeaders(
    "Set-Cookie: sid=abc; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/; X-Test=one; X-Test=two; Secure\nSet-Cookie: b=2; HttpOnly",
    "set-cookie",
  );
  expect(result.cookies).toHaveLength(2);
  expect(result.cookies[0]).toEqual({
    name: "sid",
    value: "abc",
    attributes: [
      {
        name: "Expires",
        value: "Wed, 09 Jun 2027 10:18:14 GMT",
        raw: " Expires=Wed, 09 Jun 2027 10:18:14 GMT",
      },
      { name: "Path", value: "/", raw: " Path=/" },
      { name: "X-Test", value: "one", raw: " X-Test=one" },
      { name: "X-Test", value: "two", raw: " X-Test=two" },
      { name: "Secure", value: null, raw: " Secure" },
    ],
    raw: "Set-Cookie: sid=abc; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/; X-Test=one; X-Test=two; Secure",
  });
  expect(result.cookies[1]?.attributes).toEqual([
    { name: "HttpOnly", value: null, raw: " HttpOnly" },
  ]);
});

it("reports invalid attributes without dropping the cookie", () => {
  const result = parseCookieHeaders(
    "a=1; Path=/; Broken Name=x; SameSite=Lax,other; Expires=never; ctl=ok\u007f",
    "set-cookie",
  );
  expect(result.cookies[0]?.name).toBe("a");
  expect(result.cookies[0]?.attributes).toEqual([
    { name: "Path", value: "/", raw: " Path=/" },
  ]);
  expect(result.invalid).toEqual([
    { fragment: " Broken Name=x", reason: "invalid_attribute" },
    { fragment: " SameSite=Lax,other", reason: "invalid_attribute" },
    { fragment: " Expires=never", reason: "invalid_attribute" },
    { fragment: " ctl=ok\u007f", reason: "invalid_attribute" },
  ]);
});

it("distinguishes header types and rejects combined Set-Cookie values", () => {
  expect(parseCookieHeaders("Cookie: a=1", "set-cookie").invalid).toEqual([
    { fragment: "Cookie: a=1", reason: "wrong_header_type" },
  ]);
  const combined = parseCookieHeaders("Set-Cookie: a=1, b=2", "set-cookie");
  expect(combined.cookies).toEqual([]);
  expect(combined.invalid).toEqual([
    { fragment: "Set-Cookie: a=1, b=2", reason: "invalid_cookie_pair" },
  ]);
  expect(parseCookieHeaders("\n  \r\n", "cookie")).toEqual({
    cookies: [],
    invalid: [],
  });
});

it("enforces header type and input capacity before parsing", () => {
  expect(() => parseCookieHeaders("x", "other" as "cookie")).toThrow(
    new HttpTextError("invalid_header"),
  );
  expect(() =>
    parseCookieHeaders("x".repeat(MAX_HTTP_TEXT + 1), "cookie"),
  ).toThrow("too_large");
  expect(() =>
    parseCookieHeaders("x".repeat(MAX_HTTP_TEXT + 1), "other" as "cookie"),
  ).toThrow("too_large");
});
