import { describe, expect, it } from "vitest";
import {
  BasicAuthGeneratorError,
  createBasicAuthCurlCommand,
  createBasicAuthHeader,
  createBasicAuthToken,
  generateBasicAuth,
  MAX_CREDENTIAL_LENGTH,
} from "../../src/encoding/basic-auth";

describe("Basic Auth generator logic", () => {
  it("encodes ASCII and Unicode credentials", () => {
    expect(createBasicAuthToken("Aladdin", "open sesame")).toBe(
      "QWxhZGRpbjpvcGVuIHNlc2FtZQ==",
    );
    expect(createBasicAuthToken("你好", "密碼")).toBe("5L2g5aW9OuWvhueivA==");
  });

  it("creates header and cURL output", () => {
    expect(createBasicAuthHeader("Aladdin", "open sesame")).toBe(
      "Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==",
    );
    expect(
      createBasicAuthCurlCommand(
        "https://api.example.com/protected",
        "Aladdin",
        "open sesame",
      ),
    ).toBe(
      'curl -H "Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==" https://api.example.com/protected',
    );
    expect(createBasicAuthHeader("", "")).toBe("");
  });

  it("preserves username, control-character, and capacity boundaries", () => {
    expect(() => createBasicAuthHeader("bad:user", "secret")).toThrow(
      BasicAuthGeneratorError,
    );
    expect(() => createBasicAuthHeader("user", "bad\npassword")).toThrow(
      "invalid_text",
    );
    expect(() =>
      createBasicAuthHeader("x".repeat(MAX_CREDENTIAL_LENGTH), "x"),
    ).toThrow("too_large");
  });
});

it("preserves empty fields and rejects invalid Unicode scalars", () => {
  expect(createBasicAuthToken("", "secret")).toBe("OnNlY3JldA==");
  expect(createBasicAuthCurlCommand("https://example.com", "", "")).toBe("");
  for (const value of ["\u007f", "\ud800", "\udfff"])
    expect(() => createBasicAuthToken("a", value)).toThrow("invalid_text");
  expect(createBasicAuthToken("😀", "\ue000")).toBe(
    Buffer.from("😀:\ue000").toString("base64"),
  );
});

it("generates the protocol shape with UTF8 and Latin1 credentials", () => {
  expect(generateBasicAuth("Aladdin", "open sesame")).toEqual({
    value: "Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==",
    header: "Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==",
    curl: "curl --header 'Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==' 'https://example.com/'",
  });
  expect(generateBasicAuth("é", "£", "latin1").value).toBe("Basic 6Tqj");
  expect(generateBasicAuth("", "").value).toBe("Basic Og==");
  expect(() => generateBasicAuth("bad:user", "secret")).toThrow(
    "invalid_username",
  );
  expect(() => generateBasicAuth("世界", "x", "latin1")).toThrow(
    "invalid_text",
  );
  expect(() => generateBasicAuth("u", "x", "ascii" as "utf8")).toThrow(
    "invalid_text",
  );
});
