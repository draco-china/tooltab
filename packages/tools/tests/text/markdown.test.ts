import { describe, expect, test } from "vitest";
import { MarkdownError } from "../../src/text/markdown-contract";
import { analyzeMarkdown, renderMarkdown } from "../../src/text/markdown";
import {
  escapeHtml,
  slugifyHeading,
  textContent,
} from "../../src/text/markdown-heading";

const cases = [
  {
    input: "",
    rendered: "",
    analysis: {
      html: "",
      plainText: "",
      toc: [],
      documentTitle: "Untitled",
      stats: {
        words: 0,
        characters: 0,
        headings: 0,
        links: 0,
        images: 0,
        readTimeMinutes: 0,
      },
    },
  },
  {
    input:
      "# Café &amp; 世界\n\n# Café &amp; 世界\n\n[link](https://example.com) ![image](a.png)",
    rendered:
      '<h1>Café &amp; 世界</h1>\n<h1>Café &amp; 世界</h1>\n<p><a href="https://example.com">link</a> <img src="a.png" alt="image"></p>\n',
    analysis: {
      html: '<h1 id="cafe-世界">Café &amp; 世界</h1>\n<h1 id="cafe-世界-1">Café &amp; 世界</h1>\n<p><a href="https://example.com">link</a> <img src="a.png" alt="image"></p>\n',
      plainText: "Café & 世界 Café & 世界 link",
      toc: [
        { id: "cafe-世界", text: "Café & 世界", level: 1 },
        { id: "cafe-世界-1", text: "Café & 世界", level: 1 },
      ],
      documentTitle: "Café & 世界",
      stats: {
        words: 5,
        characters: 24,
        headings: 2,
        links: 1,
        images: 1,
        readTimeMinutes: 1,
      },
    },
  },
  {
    input: "---\n\n> Quote\n\n<div>HTML</div>",
    rendered:
      "<hr>\n<blockquote>\n<p>Quote</p>\n</blockquote>\n<div>HTML</div>",
    analysis: {
      html: "<hr>\n<blockquote>\n<p>Quote</p>\n</blockquote>\n<div>HTML</div>",
      plainText: "Quote HTML",
      toc: [],
      documentTitle: "Untitled",
      stats: {
        words: 2,
        characters: 10,
        headings: 0,
        links: 0,
        images: 0,
        readTimeMinutes: 1,
      },
    },
  },
  {
    input: "Heading\n=======\n\nA | B\n--|--\nx | y",
    rendered:
      "<h1>Heading</h1>\n<table>\n<thead>\n<tr>\n<th>A</th>\n<th>B</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>x</td>\n<td>y</td>\n</tr>\n</tbody></table>\n",
    analysis: {
      html: '<h1 id="heading">Heading</h1>\n<table>\n<thead>\n<tr>\n<th>A</th>\n<th>B</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>x</td>\n<td>y</td>\n</tr>\n</tbody></table>\n',
      plainText: "Heading A B x y",
      toc: [{ id: "heading", text: "Heading", level: 1 }],
      documentTitle: "Heading",
      stats: {
        words: 5,
        characters: 15,
        headings: 1,
        links: 0,
        images: 0,
        readTimeMinutes: 1,
      },
    },
  },
  {
    input: "Plain paragraph\nnext line\n\nsecond paragraph",
    rendered: "<p>Plain paragraph\nnext line</p>\n<p>second paragraph</p>\n",
    analysis: {
      html: "<p>Plain paragraph\nnext line</p>\n<p>second paragraph</p>\n",
      plainText: "Plain paragraph next line second paragraph",
      toc: [],
      documentTitle: "Untitled",
      stats: {
        words: 6,
        characters: 42,
        headings: 0,
        links: 0,
        images: 0,
        readTimeMinutes: 1,
      },
    },
  },
  {
    input: "- [x] Task\n- [ ] Other\n\n```js\nconst a = 1;\n```",
    rendered:
      '<ul>\n<li><input checked="" disabled="" type="checkbox"> Task</li>\n<li><input disabled="" type="checkbox"> Other</li>\n</ul>\n<pre><code class="language-js">const a = 1;\n</code></pre>\n',
    analysis: {
      html: '<ul>\n<li><input checked="" disabled="" type="checkbox"> Task</li>\n<li><input disabled="" type="checkbox"> Other</li>\n</ul>\n<pre><code class="language-js">const a = 1;\n</code></pre>\n',
      plainText: "Task Other const a = 1;",
      toc: [],
      documentTitle: "Untitled",
      stats: {
        words: 5,
        characters: 23,
        headings: 0,
        links: 0,
        images: 0,
        readTimeMinutes: 1,
      },
    },
  },
  {
    input:
      "# <span></span>\n\n## !!!\n\nDon’t split compound-words or under_scores.",
    rendered:
      "<h1><span></span></h1>\n<h2>!!!</h2>\n<p>Don’t split compound-words or under_scores.</p>\n",
    analysis: {
      html: '<h1 id="untitled"><span></span></h1>\n<h2 id="section">!!!</h2>\n<p>Don’t split compound-words or under_scores.</p>\n',
      plainText: "!!! Don’t split compound-words or under_scores.",
      toc: [
        { id: "untitled", text: "Untitled", level: 1 },
        { id: "section", text: "!!!", level: 2 },
      ],
      documentTitle: "Untitled",
      stats: {
        words: 5,
        characters: 47,
        headings: 2,
        links: 0,
        images: 0,
        readTimeMinutes: 1,
      },
    },
  },
  {
    input: "Title\n---\n\n~~deleted~~ and **bold** <em>em</em>",
    rendered:
      "<h2>Title</h2>\n<p><del>deleted</del> and <strong>bold</strong> <em>em</em></p>\n",
    analysis: {
      html: '<h2 id="title">Title</h2>\n<p><del>deleted</del> and <strong>bold</strong> <em>em</em></p>\n',
      plainText: "Title deleted and bold em",
      toc: [{ id: "title", text: "Title", level: 2 }],
      documentTitle: "Title",
      stats: {
        words: 5,
        characters: 25,
        headings: 1,
        links: 0,
        images: 0,
        readTimeMinutes: 1,
      },
    },
  },
] as const;

describe("markdown core", () => {
  test.each(cases)(
    "matches the frozen render and analysis fixture",
    (fixture) => {
      expect(renderMarkdown(fixture.input)).toBe(fixture.rendered);
      expect(analyzeMarkdown(fixture.input, "Untitled")).toEqual(
        fixture.analysis,
      );
    },
  );

  test("preserves guarded Markdown prefixes and their valid forms", () => {
    expect(renderMarkdown("not hr\n  x")).toBe("<p>not hr\n  x</p>\n");
    expect(renderMarkdown("not quote\n  x")).toBe("<p>not quote\n  x</p>\n");
    expect(renderMarkdown("not html\n  <b>x</b>")).toBe(
      "<p>not html\n  <b>x</b></p>\n",
    );
    expect(renderMarkdown("A | B\nfoo")).toBe("<p>A | B\nfoo</p>\n");
    expect(renderMarkdown("- - -")).toBe("<hr>\n");
    expect(renderMarkdown("> quote")).toBe(
      "<blockquote>\n<p>quote</p>\n</blockquote>\n",
    );
    expect(renderMarkdown("<div>x</div>")).toBe("<div>x</div>");
  });

  test("counts Unicode words and rounds reading time up per 200 words", () => {
    const result = analyzeMarkdown(`${"词 ".repeat(200)}尾`, "Untitled");
    expect(result.stats).toMatchObject({
      words: 201,
      readTimeMinutes: 2,
      headings: 0,
      links: 0,
      images: 0,
    });
  });

  test("rejects non-string and UTF-8 input above the limit", () => {
    expect(() => renderMarkdown(null as never)).toThrowError(
      expect.objectContaining({ code: "invalid_input" }),
    );
    expect(() => analyzeMarkdown(42 as never, "Untitled")).toThrowError(
      expect.objectContaining({ code: "invalid_input" }),
    );
    expect(() => renderMarkdown("x".repeat(32 * 1024 * 1024 + 1))).toThrowError(
      new MarkdownError("too_large"),
    );
    expect(() =>
      analyzeMarkdown("x".repeat(128 * 1024 * 1024 + 1), "Untitled"),
    ).toThrowError(new MarkdownError("too_large"));
  });
});

describe("markdown heading helpers", () => {
  test.each([
    ["", "section"],
    ["!!!", "section"],
    ["Café &amp; 世界", "cafe-世界"],
    ["a--b", "a-b"],
    ["<b>X</b>", "x"],
  ])("slugifies %j", (value, expected) => {
    expect(slugifyHeading(value)).toBe(expected);
  });

  test("escapes all HTML-sensitive characters and extracts decoded text", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
    expect(textContent("<p>Caf&eacute; &amp; <strong>世界</strong></p>")).toBe(
      "Café & 世界",
    );
  });
});

test("escapes fallback text for an empty heading", () => {
  expect(analyzeMarkdown("#\n", "<Fallback &>")).toMatchObject({
    html: '<h1 id="section">&lt;Fallback &amp;&gt;</h1>\n',
    toc: [{ id: "section", text: "<Fallback &>", level: 1 }],
    documentTitle: "<Fallback &>",
  });
});

test("bounds real HTML expansion from escaped inline code", () => {
  const input = `\`${"&".repeat(27_000_000)}\``;
  expect(new TextEncoder().encode(input).length).toBe(27_000_002);
  expect(() => renderMarkdown(input)).toThrowError(
    new MarkdownError("too_large"),
  );
}, 15000);

test.each([
  ["# A\n# A\n# A-1", ["a", "a-1", "a-1-1"]],
  ["# A-1\n# A\n# A", ["a-1", "a", "a-2"]],
  ["# A-1\n# A-2\n# A\n# A\n# A", ["a-1", "a-2", "a", "a-3", "a-4"]],
])("keeps heading anchors unique for %j", (input, ids) => {
  const result = analyzeMarkdown(input as string, "Untitled");
  expect(result.toc.map((item) => item.id)).toEqual(ids);
  expect(
    [...result.html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]),
  ).toEqual(ids);
});
