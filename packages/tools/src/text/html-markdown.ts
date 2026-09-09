// Source consumers need the ambient declaration for Turndown's browser subpath.
/// <reference path="./turndown-browser.d.ts" />
import { Parser as HtmlParser } from "htmlparser2";
import { DOMParser } from "linkedom";
import Turndown from "turndown/lib/turndown.browser.es.js";
import type { z } from "zod";
import {
  MAX_MARKDOWN_INPUT,
  MAX_MARKDOWN_OUTPUT,
  MarkdownError,
  htmlToMarkdownOptionsSchema,
} from "./markdown-contract";

export function htmlToMarkdown(
  input: string,
  optionsInput: z.input<typeof htmlToMarkdownOptionsSchema> = {},
) {
  if (typeof input !== "string") throw new MarkdownError("invalid_input");
  if (new TextEncoder().encode(input).length > MAX_MARKDOWN_INPUT)
    throw new MarkdownError("too_large");
  const options = htmlToMarkdownOptionsSchema.parse(optionsInput);
  // Bound node creation before constructing Linkedom's DOM, using a maintained streaming HTML parser.
  let nodes = 0,
    depth = 0;
  const parser = new HtmlParser({
    onopentag() {
      if (++nodes > 1000000) throw new MarkdownError("too_large");
      if (++depth > 128) throw new MarkdownError("too_deep");
    },
    onclosetag() {
      depth = Math.max(0, depth - 1);
    },
    ontext() {
      if (++nodes > 1000000) throw new MarkdownError("too_large");
    },
    oncomment() {
      if (++nodes > 1000000) throw new MarkdownError("too_large");
    },
  });
  parser.end(input);

  // Linkedom is a pure parser in the computation Worker, with no resource loader.
  // Parsing into a DOM node avoids Turndown's browser DOMParser string path.
  const doc = new DOMParser().parseFromString(input, "text/html");
  const root = doc.createElement("div", {});
  // Avoid innerHTML's replaceChildren(...nodes), which overflows with many siblings.
  for (const child of doc.childNodes) root.appendChild(child);
  let count = 0;
  const stack: Array<{ node: Node; depth: number }> = [
    { node: root, depth: 0 },
  ];
  for (let current = stack.pop(); current; current = stack.pop()) {
    if (current.depth > 128) throw new MarkdownError("too_deep");
    if (++count > 1000000) throw new MarkdownError("too_large");
    for (const node of current.node.childNodes)
      stack.push({ node, depth: current.depth + 1 });
  }
  const output = new Turndown({
    headingStyle: options.headingStyle,
    bulletListMarker: options.bulletListMarker,
    codeBlockStyle: options.codeBlockStyle,
  }).turndown(root);
  if (new TextEncoder().encode(output).length > MAX_MARKDOWN_OUTPUT)
    throw new MarkdownError("too_large");
  return output;
}
