import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vitest";
import { qrPayload, classifyQr } from "../../src/encoding/qr-payload";

const payloadError = (value: unknown, code: string) => {
  expect(() => qrPayload(value as never)).toThrowError(
    expect.objectContaining({ code }),
  );
};

describe("qrPayload", () => {
  test("builds all eight payload types with exact wire formats", () => {
    expect(qrPayload({ type: "text", text: "Hello, QR!" })).toBe("Hello, QR!");
    expect(qrPayload({ type: "phone", phone: "  +1 555 0100  " })).toBe(
      "tel:+1 555 0100",
    );
    expect(
      qrPayload({ type: "sms", phone: " +1 555 ", message: "Hi QR & 世界" }),
    ).toBe("sms:+1 555?body=Hi%20QR%20%26%20%E4%B8%96%E7%95%8C");
    expect(
      qrPayload({
        type: "email",
        to: " user@example.com ",
        subject: "Hello QR",
        body: "Line 1 & 2",
      }),
    ).toBe("mailto:user@example.com?subject=Hello+QR&body=Line+1+%26+2");
    expect(
      qrPayload({
        type: "wifi",
        ssid: "Cafe;WiFi\\\n",
        password: "p;ass,word",
        security: "WPA",
        hidden: true,
      }),
    ).toBe("WIFI:T:WPA;S:Cafe\\;WiFi\\\\\\n;P:p\\;ass\\,word;H:true;;");
    expect(
      qrPayload({
        type: "contact",
        firstName: "Jane",
        lastName: "Doe",
        organization: "Acme, Inc.",
        title: "Engineer",
        phone: "+1;555",
        email: "jane@example.com",
        website: "https://example.com",
        address: "1 Main St, City",
      }),
    ).toBe(
      "BEGIN:VCARD\nVERSION:3.0\nN:Doe;Jane;;;\nFN:Jane Doe\nORG:Acme\\, Inc.\nTITLE:Engineer\nTEL;TYPE=CELL:+1\\;555\nEMAIL:jane@example.com\nURL:https\\://example.com\nADR:;;1 Main St\\, City;;;;\nEND:VCARD",
    );
    expect(
      qrPayload({
        type: "location",
        latitude: " 12.5 ",
        longitude: "-45.25",
        altitude: "100",
      }),
    ).toBe("geo:12.5,-45.25,100");
    expect(
      qrPayload({
        type: "calendar",
        title: "Meet; now",
        start: "2024-01-02T03:04:05Z",
        end: "2024-01-02T04:04:05+01:00",
        location: "A:B, C",
        description: "Line 1\nLine 2",
      }),
    ).toBe(
      "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ToolTab//QR Generator//EN\nBEGIN:VEVENT\nSUMMARY:Meet\\; now\nLOCATION:A:B\\, C\nDESCRIPTION:Line 1\\nLine 2\nDTSTART:20240102T030405Z\nDTEND:20240102T030405Z\nEND:VEVENT\nEND:VCALENDAR",
    );
  });

  test("applies schema defaults and trims only fields that require it", () => {
    expect(qrPayload({ type: "wifi", ssid: " Office " })).toBe(
      "WIFI:T:WPA;S: Office ;;",
    );
    expect(qrPayload({ type: "email", to: "person@example.com" })).toBe(
      "mailto:person@example.com",
    );
    expect(qrPayload({ type: "contact", firstName: "Ada" })).toContain(
      "FN:Ada",
    );
  });

  test("uses the running Temporal timezone for local calendar values", () => {
    const value = "2030-06-01T12:34:56";
    const instant = Temporal.PlainDateTime.from(value)
      .toZonedDateTime(Temporal.Now.timeZoneId())
      .toInstant()
      .toString({ smallestUnit: "second" })
      .replaceAll(/[-:]/g, "");
    expect(
      qrPayload({ type: "calendar", title: "Local", start: value }),
    ).toContain(`DTSTART:${instant}`);
  });

  test("rejects empty content, malformed schema, lone surrogates, and invalid dates", () => {
    payloadError({ type: "text", text: "" }, "missing_content");
    payloadError({ type: "phone", phone: "   " }, "missing_content");
    payloadError(
      { type: "sms", phone: "   ", message: "body" },
      "missing_content",
    );
    payloadError({ type: "email", to: " " }, "missing_content");
    payloadError({ type: "wifi", ssid: "" }, "missing_content");
    payloadError({ type: "contact" }, "missing_content");
    payloadError({ type: "calendar", title: "", start: "" }, "missing_content");
    payloadError(
      { type: "calendar", title: "Broken", start: "not-a-date" },
      "invalid_date",
    );
    expect(() =>
      qrPayload({ type: "text", text: "\ud800" } as never),
    ).toThrowError(expect.objectContaining({ name: "ZodError" }));
    expect(() =>
      qrPayload({ type: "text", text: "x", extra: true } as never),
    ).toThrowError(expect.objectContaining({ name: "ZodError" }));
  });

  test("enforces finite geographic bounds", () => {
    for (const content of [
      { type: "location", latitude: "90.001", longitude: "0" },
      { type: "location", latitude: "0", longitude: "180.001" },
      { type: "location", latitude: "NaN", longitude: "0" },
      { type: "location", latitude: "0", longitude: "Infinity" },
      {
        type: "location",
        latitude: "0",
        longitude: "0",
        altitude: "not-number",
      },
    ])
      payloadError(content, "invalid_location");
    expect(
      qrPayload({ type: "location", latitude: "-90", longitude: "180" }),
    ).toBe("geo:-90,180");
  });
});

describe("classifyQr", () => {
  test.each([
    [
      "https://example.com/a?q=1",
      { kind: "url", href: "https://example.com/a?q=1" },
    ],
    ["HTTP://EXAMPLE.COM", { kind: "url", href: "http://example.com/" }],
    ["example.com/path", { kind: "url", href: "https://example.com/path" }],
    ["mailto:a@example.com", { kind: "email", href: "mailto:a@example.com" }],
    ["tel:+1555", { kind: "phone", href: "tel:+1555" }],
    ["sms:+1555", { kind: "sms", href: "sms:+1555" }],
    ["geo:1,2", { kind: "location", href: "geo:1,2" }],
    ["WIFI:T:WPA;S:test;;", { kind: "wifi", href: null }],
    ["BEGIN:VCARD\nVERSION:3.0", { kind: "vcard", href: null }],
    ["BEGIN:VCALENDAR\nVERSION:2.0", { kind: "calendar", href: null }],
    ["ordinary text", { kind: "text", href: null }],
  ] as const)("classifies %s", (data, expected) => {
    expect(classifyQr(data)).toEqual(expected);
  });

  test("rejects unsafe schemes, multiline URI prefixes, and malformed domains", () => {
    for (const value of [
      "javascript:alert(1)",
      "ftp://example.com/file",
      "tel:123\n456",
      "mailto:a@example.com\nbody",
      "not a domain.example",
      "example..com",
    ])
      expect(classifyQr(value)).toEqual({ kind: "text", href: null });
  });
});

test("supports a phone-only SMS", () => {
  expect(qrPayload({ type: "sms", phone: " +123 " })).toBe("sms:+123");
});

test.each([
  [{ organization: "Acme" }, "FN:Acme\nORG:Acme"],
  [{ email: "a@example.com" }, "FN:a@example.com\nEMAIL:a@example.com"],
  [{ phone: "+123" }, "FN:+123\nTEL;TYPE=CELL:+123"],
  [{ title: "Engineer" }, "TITLE:Engineer"],
] as const)(
  "encodes contacts without personal names: %j",
  (fields, expected) => {
    expect(qrPayload({ type: "contact", ...fields })).toBe(
      `BEGIN:VCARD\nVERSION:3.0\nN:;;;;\n${expected}\nEND:VCARD`,
    );
  },
);

test.each([
  { latitude: " ", longitude: "1" },
  { latitude: "1", longitude: " " },
])("requires both location coordinates: %j", (fields) => {
  expect(() => qrPayload({ type: "location", ...fields })).toThrowError(
    "missing_content",
  );
});
