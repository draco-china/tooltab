import { describe, expect, it } from "vitest";
import {
  htmlToMarkdownOptionsSchema,
  MAX_MARKDOWN_INPUT,
  type MarkdownError,
} from "@workspace/tools/text/markdown-contract";
import { htmlToMarkdown } from "@workspace/tools/text/html-markdown";

const fixtures = [
  {
    input: "",
    options: {
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    },
    output: "",
  },
  {
    input: "",
    options: {
      headingStyle: "setext",
      bulletListMarker: "+",
      codeBlockStyle: "indented",
    },
    output: "",
  },
  {
    input:
      '<h1>Hello &amp; 世界</h1><p>A <strong>bold</strong> <a href="https://example.com">link</a>.</p>',
    options: {
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    },
    output: "# Hello & 世界\n\nA **bold** [link](https://example.com).",
  },
  {
    input:
      '<h1>Hello &amp; 世界</h1><p>A <strong>bold</strong> <a href="https://example.com">link</a>.</p>',
    options: {
      headingStyle: "setext",
      bulletListMarker: "+",
      codeBlockStyle: "indented",
    },
    output:
      "Hello & 世界\n==========\n\nA **bold** [link](https://example.com).",
  },
  {
    input:
      "<ul><li>One</li><li>Two</li></ul><pre><code>const x = 1;</code></pre>",
    options: {
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    },
    output: "-   One\n-   Two\n\n```\nconst x = 1;\n```",
  },
  {
    input:
      "<ul><li>One</li><li>Two</li></ul><pre><code>const x = 1;</code></pre>",
    options: {
      headingStyle: "setext",
      bulletListMarker: "+",
      codeBlockStyle: "indented",
    },
    output: "+   One\n+   Two\n\n    const x = 1;",
  },
  {
    input: "<!-- ignored --><script>alert(1)</script><p>Safe text</p>",
    options: {
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    },
    output: "alert(1)\n\nSafe text",
  },
  {
    input: "<!-- ignored --><script>alert(1)</script><p>Safe text</p>",
    options: {
      headingStyle: "setext",
      bulletListMarker: "+",
      codeBlockStyle: "indented",
    },
    output: "alert(1)\n\nSafe text",
  },
  {
    input: "<div><p>Unclosed<div>Nested</div>",
    options: {
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    },
    output: "Unclosed\n\nNested",
  },
  {
    input: "<div><p>Unclosed<div>Nested</div>",
    options: {
      headingStyle: "setext",
      bulletListMarker: "+",
      codeBlockStyle: "indented",
    },
    output: "Unclosed\n\nNested",
  },
  {
    input: "<table><tr><th>A</th></tr><tr><td>B</td></tr></table>",
    options: {
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    },
    output: "A\n\nB",
  },
  {
    input: "<table><tr><th>A</th></tr><tr><td>B</td></tr></table>",
    options: {
      headingStyle: "setext",
      bulletListMarker: "+",
      codeBlockStyle: "indented",
    },
    output: "A\n\nB",
  },
] as const;

function expectCode(action: () => unknown, code: MarkdownError["code"]) {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

describe("html to markdown fixtures", () => {
  it.each(fixtures)(
    "matches the baseline output for fixture $input",
    ({ input, options, output }) => {
      expect(htmlToMarkdown(input, options)).toBe(output);
    },
  );

  it("handles entities and malformed HTML through the real parsers", () => {
    expect(
      htmlToMarkdown("<p>&lt;safe&gt; &quot;quoted&quot; &amp; copied</p>"),
    ).toBe('<safe\\> "quoted" & copied');
    expect(htmlToMarkdown("<p>one<div>two</div>")).toBe("one\n\ntwo");
  });
});

describe("html to markdown options and limits", () => {
  it("applies defaults and rejects invalid options", () => {
    expect(htmlToMarkdownOptionsSchema.parse({})).toEqual({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    });
    expect(() =>
      htmlToMarkdownOptionsSchema.parse({ headingStyle: "invalid" }),
    ).toThrow();
    expect(() =>
      htmlToMarkdownOptionsSchema.parse({ bulletListMarker: "/" }),
    ).toThrow();
    expect(() =>
      htmlToMarkdownOptionsSchema.parse({ codeBlockStyle: "indented-block" }),
    ).toThrow();
    expect(() => htmlToMarkdownOptionsSchema.parse({ extra: true })).toThrow();
  });

  it("rejects non-string and input over 32 MiB", () => {
    expectCode(() => htmlToMarkdown(null as never), "invalid_input");
    expectCode(
      () => htmlToMarkdown("x".repeat(MAX_MARKDOWN_INPUT + 1)),
      "too_large",
    );
  });

  it("enforces DOM text-node depth as well as opening-tag depth", () => {
    const allowed = `${"<div>".repeat(127)}text${"</div>".repeat(127)}`;
    expect(htmlToMarkdown(allowed)).toBe("text");
    const tooDeep = `${"<div>".repeat(128)}text${"</div>".repeat(128)}`;
    expectCode(() => htmlToMarkdown(tooDeep), "too_deep");
    expectCode(() => htmlToMarkdown("<div>".repeat(129)), "too_deep");
    expect(htmlToMarkdown("<div>".repeat(128) + "</div>".repeat(128))).toBe("");
  });

  it("enforces the million-node streaming limit before DOM construction", () => {
    const overLimit = "<!--x-->".repeat(1_000_001);
    expectCode(() => htmlToMarkdown(overLimit), "too_large");
  }, 15000);
});

it("enforces streaming node limits for element and text callbacks", () => {
  expectCode(() => htmlToMarkdown("<br>".repeat(1_000_001)), "too_large");
  expectCode(
    () => htmlToMarkdown(`${"<!--x-->".repeat(1_000_000)}x`),
    "too_large",
  );
});

it("handles many sibling nodes without spreading them into function arguments", () => {
  expect(htmlToMarkdown(`${"<!--x-->".repeat(100_000)}<p>Kept</p>`)).toBe(
    "Kept",
  );
});

it("counts the container in the constructed DOM node limit", () => {
  // The streaming parser accepts exactly one million comments; the DOM adds the container.
  expectCode(() => htmlToMarkdown("<!--x-->".repeat(1_000_000)), "too_large");
});

it("moves document-type and document element siblings without losing content", () => {
  expect(
    htmlToMarkdown(
      "<!doctype html><html><head><title>Title</title></head><body><p>Body</p></body></html>",
    ),
  ).toBe("Title\n\nBody");
});

it("rejects real Markdown output expanded beyond 128 MiB", () => {
  // Each enclosing blockquote adds a prefix to every preserved code line.
  const input =
    "<blockquote>".repeat(124) +
    "<pre><code>" +
    "x\n".repeat(540_000) +
    "</code></pre>" +
    "</blockquote>".repeat(124);
  expect(new TextEncoder().encode(input).length).toBe(1_083_124);
  expectCode(() => htmlToMarkdown(input), "too_large");
}, 30000);
