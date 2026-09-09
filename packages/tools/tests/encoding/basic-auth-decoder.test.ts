import { describe, expect, it, vi } from "vitest";
import {
  decodeBasicAuth,
  MAX_AUTH_HEADER,
} from "../../src/encoding/basic-auth";

describe("Basic Auth decoder", () => {
  it("accepts a scheme value and a complete header line", () => {
    expect(decodeBasicAuth("Basic dXNlcjpwYTpzcw==")).toEqual({
      username: "user",
      password: "pa:ss",
    });
    expect(decodeBasicAuth("Authorization: BASIC dXNlcjpwYXNz")).toEqual({
      username: "user",
      password: "pass",
    });
  });

  it("rejects malformed headers and Base64", () => {
    expect(() => decodeBasicAuth("Bearer token")).toThrow("invalid_header");
    expect(() => decodeBasicAuth("Basic !!!")).toThrow("invalid_header");
  });
});

it("enforces credential decoding boundaries", () => {
  expect(() => decodeBasicAuth("a".repeat(MAX_AUTH_HEADER + 1))).toThrow(
    "too_large",
  );
  for (const header of ["Basic Og==\n", "Basic Og==\r"])
    expect(() => decodeBasicAuth(header)).toThrow("invalid_header");
  for (const token of ["a", "=", "ab=", "Zh=="])
    expect(() => decodeBasicAuth(`Basic ${token}`)).toThrow("invalid_base64");
  expect(() => decodeBasicAuth("Basic YWJj")).toThrow("missing_separator");
  for (const token of [btoa("a:\n"), btoa("a:\x7f"), btoa("a:\xff")])
    expect(() => decodeBasicAuth(`Basic ${token}`)).toThrow("invalid_text");
  expect(decodeBasicAuth(`Basic ${btoa("é:ÿ")}`, "latin1")).toEqual({
    username: "é",
    password: "ÿ",
  });
  expect(decodeBasicAuth("Basic Og")).toEqual({ username: "", password: "" });
  expect(() => decodeBasicAuth(`Basic ${btoa("abc")}`, "utf8", 2)).toThrow(
    "too_large",
  );
  expect(
    decodeBasicAuth(`Basic ${btoa("é:ÿ")}`, "not-an-encoding" as "utf8"),
  ).toEqual({
    username: "é",
    password: "ÿ",
  });
  const atobSpy = vi.spyOn(globalThis, "atob").mockImplementationOnce(() => {
    throw new Error("decoder unavailable");
  });
  try {
    expect(() => decodeBasicAuth("Basic Og==")).toThrow("invalid_base64");
  } finally {
    atobSpy.mockRestore();
  }
});
