import { Marked, Tokenizer, Renderer } from "marked";

/** Conservative prefix guards avoid JSC repeatedly scanning the whole remaining rope
 * for complex regexes that cannot match. All matching grammar remains Marked's. */
class GuardedTokenizer extends Tokenizer {
  override hr(source: string) {
    if (!/^ {0,3}[-_*]/.test(source.slice(0, 4))) return;
    return super.hr(source);
  }
  override blockquote(source: string) {
    if (!/^ {0,3}>/.test(source.slice(0, 4))) return;
    return super.blockquote(source);
  }
  override html(source: string) {
    if (!/^ {0,3}</.test(source.slice(0, 4))) return;
    return super.html(source);
  }
  override table(source: string) {
    const newline = source.indexOf("\n");
    if (
      newline < 0 ||
      !/^ {0,3}[|:-]/.test(source.slice(newline + 1, newline + 5))
    )
      return;
    return super.table(source);
  }
  override lheading(source: string) {
    const blank = source.indexOf("\n\n");
    const paragraph = blank < 0 ? source : source.slice(0, blank + 1);
    if (!/\n {0,3}[=-]/.test(paragraph)) return;
    return super.lheading(source);
  }
}
const markdownEngine = new Marked().setOptions({
  gfm: true,
  breaks: false,
  tokenizer: new GuardedTokenizer(),
});

import { escapeHtml, textContent, slugifyHeading } from "./markdown-heading";
import {
  MAX_MARKDOWN_INPUT,
  MAX_MARKDOWN_OUTPUT,
  MarkdownError,
} from "./markdown-contract";
function checkInput(input: string, limit: number) {
  if (typeof input !== "string") throw new MarkdownError("invalid_input");
  if (new TextEncoder().encode(input).length > limit)
    throw new MarkdownError("too_large");
}
function checkOutput(html: string) {
  if (new TextEncoder().encode(html).length > MAX_MARKDOWN_OUTPUT)
    throw new MarkdownError("too_large");
}
export function renderMarkdown(input: string) {
  checkInput(input, MAX_MARKDOWN_INPUT);
  const html = markdownEngine.parse(input, {
    gfm: true,
    breaks: false,
  }) as string;
  checkOutput(html);
  return html;
}

/** Independent implementation of the audited heading/outline and reading statistics behavior. */
export function analyzeMarkdown(input: string, fallback: string) {
  // Generated Markdown can be larger than the original 32 MiB user input.
  checkInput(input, MAX_MARKDOWN_OUTPUT);
  const toc: Array<{ id: string; text: string; level: number }> = [],
    counts = new Map<string, number>(),
    ids = new Set<string>(),
    renderer = new Renderer();
  renderer.heading = function (token) {
    const html = this.parser.parseInline(token.tokens),
      label = textContent(html) || fallback;
    const base = slugifyHeading(label);
    let previous = counts.get(base) ?? 0;
    let id = previous ? `${base}-${previous}` : base;
    while (ids.has(id)) id = `${base}-${++previous}`;
    counts.set(base, previous + 1);
    ids.add(id);
    toc.push({ id, text: label, level: token.depth });
    return `<h${token.depth} id="${id}">${html || escapeHtml(fallback)}</h${token.depth}>\n`;
  };
  const tokens = markdownEngine.lexer(input);
  let links = 0,
    images = 0;
  markdownEngine.walkTokens(tokens, (token) => {
    if (token.type === "link") links++;
    if (token.type === "image") images++;
  });
  const html = markdownEngine.parser(tokens, { renderer }),
    plainText = textContent(html),
    words =
      plainText.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  checkOutput(html);
  return {
    html,
    plainText,
    toc,
    documentTitle: toc[0]?.text ?? fallback,
    stats: {
      words,
      characters: plainText.length,
      headings: toc.length,
      links,
      images,
      readTimeMinutes: Math.ceil(words / 200),
    },
  };
}
