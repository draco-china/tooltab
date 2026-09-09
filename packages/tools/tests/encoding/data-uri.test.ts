import { describe, expect, it } from "vitest";
import {
  DataUriError,
  decodeChunks,
  fileDataUri,
  filenameFor,
  MAX_DATA_FILE,
  MAX_DATA_URI,
  mediaType,
  parseDataUri,
  previewKind,
  safeFilename,
  textPreview,
  uriMediaType,
} from "../../src/encoding/data-uri";

const decode = (s: string) => Buffer.concat([...decodeChunks(parseDataUri(s))]);
it("preserves percent-encoded binary bytes and literal plus signs", () => {
  expect([...decode("data:application/octet-stream,%FF%00A+")]).toEqual([
    255, 0, 65, 43,
  ]);
  expect(decode("data:,Hello%20world").toString()).toBe("Hello world");
  expect([...decode("data:application/octet-stream,%E9")]).toEqual([233]);
});
it("supports defaults, shorthand and charset parameters", () => {
  expect(parseDataUri("data:base64,SGVsbG8=")).toMatchObject({
    mimeType: "text/plain;charset=US-ASCII",
    encoding: "base64",
  });
  expect(parseDataUri("data:;charset=utf-8,abc").mimeType).toBe(
    "text/plain;charset=utf-8",
  );
  expect(
    textPreview(Uint8Array.of(233), "text/plain;charset=iso-8859-1").text,
  ).toBe("é");
  expect(
    textPreview(Uint8Array.of(65), "text/plain;charset=unknown")
      .charsetFallback,
  ).toBe(true);
});
it("decodes whitespace and escaped base64 without accepting corrupt tail bits", () => {
  expect(decode("data:;base64,SGV s\nbG8=").toString()).toBe("Hello");
  expect([...decode("data:;base64,%2Fw%3D%3D")]).toEqual([255]);
  for (const s of ["Zh==", "A", "AA===", "a-b_", "SGV=sbG8="])
    expect(() => decode(`data:;base64,${s}`)).toThrow();
});
it("handles arbitrary files including every byte and empty files", () => {
  const bytes = Uint8Array.from({ length: 200000 }, (_, i) => i % 256);
  expect(decode(fileDataUri(bytes))).toEqual(Buffer.from(bytes));
  expect(fileDataUri(new Uint8Array())).toBe(
    "data:application/octet-stream;base64,",
  );
  expect(decode("data:;base64,").length).toBe(0);
});
it("rejects malformed percent, surrogate, MIME and unsafe filenames", () => {
  for (const s of [
    "data:,%GG",
    "data:,%A",
    "data:,\ud800",
    "data:text/plain;bad,abc",
    "data:text/plain\r\nX:yes,abc",
  ])
    expect(() => decode(s)).toThrow();
  expect(() => safeFilename("../secret", "data.bin")).toThrow();
  expect(filenameFor("application/vnd.api+json")).toBe("data.json");
});
it("decodes escaped MIME parameter values and re-escapes them when encoding", () => {
  const p = parseDataUri("data:text/plain;foo=a%3Bb;charset=%75tf-8,hello");
  expect(p.mimeType).toBe('text/plain;foo="a;b";charset=utf-8');
  expect(fileDataUri(Uint8Array.of(65), 'text/plain;foo="a;b"')).toBe(
    "data:text/plain;foo=a%3Bb;base64,QQ==",
  );
  expect(() => parseDataUri("data:text/plain;foo=%0D%0A,hello")).toThrow(
    "invalid_mime",
  );
});

describe("MIME and URI validation", () => {
  it.each([
    ["hello", "invalid_uri"],
    ["data:text/plain", "invalid_uri"],
    [`data:${"x".repeat(4092)},hello`, "invalid_uri"],
    ["data:no-slash,hello", "invalid_mime"],
    ['data:text/plain;name="unterminated,hello', "invalid_mime"],
    ['data:text/plain;name="escaped\\,hello', "invalid_mime"],
    ["data:text/plain;=value,hello", "invalid_mime"],
    ["data:text/plain;name=%GG,hello", "invalid_mime"],
    ["data:text/plain;name=%FF,hello", "invalid_mime"],
    ["data:text/plain;name=%00,hello", "invalid_mime"],
  ])("rejects %s with %s", (input, code) => {
    expect(() => parseDataUri(input)).toThrow(
      new DataUriError(code as "invalid_uri" | "invalid_mime"),
    );
  });

  it("preserves escaped quotes and semicolons inside quoted MIME parameters", () => {
    const type = 'TEXT/PLAIN;name="a; b\\"c\\\\d"';
    expect(mediaType(type)).toEqual({
      mimeType: type.replace("TEXT/PLAIN", "text/plain"),
      mediaType: "text/plain",
    });
    const encoded = uriMediaType(type);
    expect(encoded).toBe("text/plain;name=a%3B%20b%22c%5Cd");
    expect(parseDataUri(`data:${encoded},A`).mimeType).toBe(
      type.replace("TEXT/PLAIN", "text/plain"),
    );
    expect(parseDataUri("DATA:text/plain;base64,QQ==")).toMatchObject({
      mimeType: "text/plain",
      encoding: "base64",
    });
  });

  it.each([
    "text/plain;name=",
    "text/plain;name=a b",
    "text/plain;name=a,b",
    "text/plain;name=\\",
    `text/plain;x=${"a".repeat(4096)}`,
  ])("rejects invalid media type %s", (type) => {
    expect(() => mediaType(type)).toThrow(new DataUriError("invalid_mime"));
  });
});

it.each(["%", "%0", "%xz"])(
  "rejects incomplete or nonhex escape %s",
  (payload) => {
    expect(() => decode(`data:,${payload}`)).toThrow(
      new DataUriError("invalid_percent"),
    );
  },
);
it.each(["\ud800", "\ud800A", "\ud800\ue000", "\udc00", "\udfff"])(
  "rejects an unpaired UTF-16 surrogate %s",
  (payload) => {
    expect(() => decode(`data:,${payload}`)).toThrow(
      new DataUriError("invalid_unicode"),
    );
  },
);
it("encodes Unicode scalars and retains bytes across all percent decoder chunk boundaries", () => {
  for (const payload of [
    "%FF".repeat(65536),
    "A".repeat(65536),
    `${"A".repeat(65535)}é😀中`,
  ]) {
    const result = decode(`data:,${payload}`);
    const expected = payload.startsWith("%")
      ? Buffer.alloc(65536, 255)
      : Buffer.from(payload);
    expect(result).toEqual(expected);
  }
});
it("accepts each allowed base64 whitespace and rejects corrupt streamed and final blocks", () => {
  expect(decode("data:;base64,\t\n\f\r QQ== ")).toEqual(Buffer.from("A"));
  for (const payload of [
    "é",
    "AA=",
    `${"A".repeat(65535)}=AAAA`,
    `${"!".repeat(65536)}AAAA`,
  ]) {
    expect(() => decode(`data:;base64,${payload}`)).toThrow(
      new DataUriError("invalid_base64"),
    );
  }
});
it("uses the generic binary MIME for an explicitly empty file type", () => {
  expect(fileDataUri(Uint8Array.of(0, 255), "")).toBe(
    "data:application/octet-stream;base64,AP8=",
  );
});
it.each([
  ["image/svg+xml", "svg"],
  ["image/jpeg", "jpg"],
  ["audio/mpeg", "mp3"],
  ["text/plain;charset=utf-8", "txt"],
  ["application/custom+xml", "xml"],
  ["application/x-custom", "custom"],
  ["application/json", "json"],
  ["invalid", "bin"],
  ["application/long-extension-name", "bin"],
])("provides an appropriate safe extension for %s", (type, extension) => {
  expect(filenameFor(type)).toBe(`data.${extension}`);
});
it("trims safe filenames and uses the caller fallback only for empty names", () => {
  expect(safeFilename("  report.txt  ", "data.bin")).toBe("report.txt");
  expect(safeFilename("   ", "data.bin")).toBe("data.bin");
  expect(safeFilename("a".repeat(255), "data.bin")).toHaveLength(255);
});
it.each([".", "..", "a".repeat(256), "a/b", "a\\b", "a:b", "a\0b", "a\u007fb"])(
  "rejects unsafe filename %s",
  (name) => {
    expect(() => safeFilename(name, "data.bin")).toThrow(
      new DataUriError("invalid_uri"),
    );
  },
);
it.each([
  ["image/png", "image"],
  ["audio/wav", "audio"],
  ["video/mp4", "video"],
  ["text/plain", "text"],
  ["application/json", "text"],
  ["application/xml", "text"],
  ["application/javascript", "text"],
  ["application/pdf", "none"],
])("selects the correct preview for %s", (type, kind) => {
  expect(previewKind(type)).toBe(kind);
});
it("reports charset, invalid-label fallback, and truncated Unicode previews", () => {
  expect(
    textPreview(Uint8Array.of(233), 'text/plain;charset="iso-8859-1"'),
  ).toEqual({
    text: "é",
    charset: "windows-1252",
    charsetFallback: false,
    truncated: false,
  });
  expect(textPreview(Uint8Array.of(65), 'text/plain;charset=""')).toEqual({
    text: "A",
    charset: "utf-8",
    charsetFallback: false,
    truncated: false,
  });
  expect(textPreview(Uint8Array.of(65), "text/plain;charset=unknown")).toEqual({
    text: "A",
    charset: "utf-8",
    charsetFallback: true,
    truncated: false,
  });
  expect(textPreview(Uint8Array.of(0xe2, 0x82), "text/plain", true)).toEqual({
    text: "",
    charset: "utf-8",
    charsetFallback: false,
    truncated: true,
  });
  expect(textPreview(Uint8Array.of(0xe2, 0x82), "text/plain").text).toBe("�");
  expect(
    textPreview(new TextEncoder().encode("a".repeat(100001)), "text/plain"),
  ).toEqual({
    text: "a".repeat(100000),
    charset: "utf-8",
    charsetFallback: false,
    truncated: true,
  });
});
it("rejects oversized source URIs and file bytes before decoding or encoding", () => {
  expect(() => parseDataUri("a".repeat(MAX_DATA_URI + 1))).toThrow(
    new DataUriError("too_large"),
  );
  expect(() => fileDataUri(new Uint8Array(MAX_DATA_FILE + 1))).toThrow(
    new DataUriError("too_large"),
  );
});
it("enforces the decoded byte limit on streamed percent data without retaining chunks", () => {
  let decoded = 0;
  const parsed = parseDataUri(`data:,${"A".repeat(MAX_DATA_FILE + 1)}`);
  expect(() => {
    for (const chunk of decodeChunks(parsed)) {
      expect(chunk[0]).toBe(65);
      decoded += chunk.length;
    }
  }).toThrow(new DataUriError("too_large"));
  expect(decoded).toBe(MAX_DATA_FILE);
}, 30000);

it.each([
  ["final block", () => `${"AAAA".repeat(Math.floor(MAX_DATA_FILE / 3))}AAA=`],
  [
    "streamed block",
    () => "AAAA".repeat(Math.ceil((MAX_DATA_FILE + 49152) / 3)),
  ],
])(
  "rejects base64 exceeding the decoded byte limit in its %s",
  (_name, payload) => {
    let decoded = 0;
    expect(() => {
      for (const chunk of decodeChunks(
        parseDataUri(`data:;base64,${payload()}`),
      )) {
        expect(chunk[0]).toBe(0);
        expect(chunk.at(-1)).toBe(0);
        decoded += chunk.length;
      }
    }).toThrow(new DataUriError("too_large"));
    expect(decoded).toBeLessThanOrEqual(MAX_DATA_FILE);
    expect(decoded).toBeGreaterThan(MAX_DATA_FILE - 65536);
  },
  30000,
);
