import { expect, it } from "vitest";
import {
  caseStyles,
  CaseConversionError,
  convertTextCases,
  MAX_CASE_INPUT,
} from "../../src/text/case";

it("produces every case style and splits acronym and camel boundaries", () => {
  const result = convertTextCases("XMLHttpRequest foo-bar");
  expect(Object.keys(result).sort()).toEqual([...caseStyles].sort());
  expect(result).toEqual({
    camel: "xmlHttpRequestFooBar",
    pascal: "XmlHttpRequestFooBar",
    snake: "xml_http_request_foo_bar",
    constant: "XML_HTTP_REQUEST_FOO_BAR",
    kebab: "xml-http-request-foo-bar",
    cobol: "XML-HTTP-REQUEST-FOO-BAR",
    dot: "xml.http.request.foo.bar",
    path: "xml/http/request/foo/bar",
    title: "Xml Http Request Foo Bar",
    sentence: "Xml http request foo bar",
    upper: "XML HTTP REQUEST FOO BAR",
    lower: "xml http request foo bar",
  });
});

it("retains Unicode and combining marks with default Unicode mappings", () => {
  const result = convertTextCases("écoleDéja 世界 Straße");
  expect(result.camel).toBe("écoleDéja世界Straße");
  expect(result.constant).toBe("ÉCOLE_DÉJA_世界_STRASSE");
  expect(convertTextCases("İ I ı i").lower).toBe("i\u0307 i ı i");
  expect(convertTextCases("e\u0301Test").snake).toBe("e\u0301test");
});

it("normalizes all supported separators and preserves other punctuation", () => {
  const result = convertTextCases("  hello,_-./\\\nWORLD! 😀 ");
  expect(result.upper).toBe("HELLO, WORLD! 😀");
  expect(result.lower).toBe("hello, world! 😀");
  expect(result.sentence).toBe("Hello, world! 😀");
  expect(convertTextCases("one\ttwo").snake).toBe("one_two");
});

it("handles empty and single scalar inputs", () => {
  expect(convertTextCases("").camel).toBe("");
  expect(convertTextCases("").pascal).toBe("");
  expect(convertTextCases("😀").snake).toBe("😀");
  expect(convertTextCases("😀").constant).toBe("😀");
});

it("handles the maximum input size without truncation", () => {
  const result = convertTextCases("a".repeat(MAX_CASE_INPUT));
  expect(result.camel).toHaveLength(MAX_CASE_INPUT);
  expect(result.upper).toHaveLength(MAX_CASE_INPUT);
});

it("rejects oversized and unpaired surrogate input", () => {
  expect(() => convertTextCases("x".repeat(MAX_CASE_INPUT + 1))).toThrow(
    CaseConversionError,
  );
  expect(() => convertTextCases("x".repeat(MAX_CASE_INPUT + 1))).toThrow(
    "too_large",
  );
  expect(() => convertTextCases("\ud800")).toThrow("invalid_unicode");
  expect(() => convertTextCases("ok\udfff")).toThrow("invalid_unicode");
});
