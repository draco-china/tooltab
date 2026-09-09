import { expect, it } from "vitest";
import {
  decodeHtmlText,
  encodeHtmlText,
  MAX_CODEC_ENCODED,
  MAX_CODEC_TEXT,
  TextCodecError,
} from "../../src/encoding/html";

it("round trips HTML text with named and non-ASCII entities", () => {
  const source = '<div class="hello">Hello & 世界</div>';
  const encoded = encodeHtmlText(source, "named", "non-ascii");
  expect(encoded).toContain("&lt;div class=&quot;hello&quot;&gt;");
  expect(encoded).toContain("&#x4e16;");
  expect(decodeHtmlText(encoded)).toBe(source);
});

it("supports minimal, decimal, hex, and all-special ranges", () => {
  expect(encodeHtmlText("A © &", "decimal", "non-ascii")).toBe(
    "A &#169; &#38;",
  );
  expect(encodeHtmlText("A © &", "hex", "non-ascii")).toBe("A &#xA9; &#x26;");
  expect(encodeHtmlText("abc 123-_.©~", "named", "all-special")).toBe(
    "abc 123&#x2d;&lowbar;&period;&copy;&#x7E;",
  );
  expect(encodeHtmlText("plain", "named", "minimal")).toBe("plain");
  expect(encodeHtmlText("'\"&<>")).toBe("&apos;&quot;&amp;&lt;&gt;");
});

it("keeps unknown and invalid entities unchanged while decoding valid forms", () => {
  expect(
    decodeHtmlText(
      "&amp; &lt; &#169; &#xA9; &#x1F600; &unknown; &#0; &#xD800; &#x110000;",
    ),
  ).toBe("& < © © 😀 &unknown; &#0; &#xD800; &#x110000;");
  expect(decodeHtmlText("&copy &bad!; &amp")).toBe("&copy &bad!; &amp");
});

it("rejects invalid Unicode, options, and oversized input", () => {
  expect(() => encodeHtmlText("\uD800")).toThrow(
    new TextCodecError("invalid_unicode"),
  );
  expect(() => decodeHtmlText("\uD800")).toThrow("invalid_unicode");
  expect(() => encodeHtmlText("x", "bad" as never)).toThrow("invalid_option");
  expect(() => encodeHtmlText("x", "named", "bad" as never)).toThrow(
    "invalid_option",
  );
  expect(() => encodeHtmlText("x".repeat(MAX_CODEC_TEXT + 1))).toThrow(
    "too_large",
  );
  expect(() => decodeHtmlText("x".repeat(MAX_CODEC_ENCODED + 1))).toThrow(
    "too_large",
  );
});

it("preserves overflowing numeric references without throwing", () => {
  for (const entity of [`&#${"9".repeat(400)};`, `&#x${"F".repeat(400)};`])
    expect(decodeHtmlText(entity)).toBe(entity);
});
