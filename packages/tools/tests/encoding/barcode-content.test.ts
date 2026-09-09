import { describe, expect, it } from "vitest";
import { classifyBarcodeContent } from "../../src/encoding/barcode-content";

describe("barcode content", () => {
  it.each([
    [" https://example.com/a?q=1 ", "url", "https://example.com/a?q=1"],
    ["http://example.com", "url", "http://example.com/"],
    ["www.example.com/path", "url", "https://www.example.com/path"],
    ["example.com?x=1", "url", "https://example.com/?x=1"],
    ["MAILTO:a@example.com", "email", "MAILTO:a@example.com"],
    ["tel:+123", "phone", "tel:+123"],
    ["sms:+123?body=Hi", "sms", "sms:+123?body=Hi"],
    ["geo:1,2", "location", "geo:1,2"],
    ["WIFI:T:WPA;S:Test;P:secret;;", "wifi", null],
    ["BEGIN:VCARD\nVERSION:3.0\nEND:VCARD", "vcard", null],
    ["BEGIN:VCALENDAR\nEND:VCALENDAR", "calendar", null],
    ["hello", "text", null],
    ["", "text", null],
    ["javascript:alert(1)", "text", null],
    ["data:text/html,test", "text", null],
    ["ftp://example.com", "text", null],
    ["mailto:a@example.com\nb@example.com", "text", null],
    ["999.999.999.999", "text", null],
    ["example.123", "text", null],
    ["https://[invalid", "text", null],
  ])("classifies %j without executing content", (input, kind, href) => {
    expect(classifyBarcodeContent(input as string)).toEqual({ kind, href });
  });
});
