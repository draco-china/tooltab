import {
  htmlToMarkdownOptionsSchema,
  type HtmlToMarkdownOptions,
} from "@workspace/tools/text/markdown-contract";
export const MAX_PREVIEW_SOURCE = 100000;
export type MarkdownJob = {
  kind: "preview" | "to-html" | "to-markdown";
  input: string;
  sanitize: boolean;
  theme: "clean" | "slate";
  language: string;
  direction: "ltr" | "rtl";
} & HtmlToMarkdownOptions;
export const markdownDefaults = {
  sanitize: true,
  theme: "clean",
  language: "en-US",
  direction: "ltr",
  ...htmlToMarkdownOptionsSchema.parse({}),
} as const;
export type MarkdownResult = {
  kind: MarkdownJob["kind"];
  output: string;
  document: string | null;
  preview: string;
  previewWithOutline: string;
  printDocument: string;
  printWithOutline: string;
  highlighted: string;
  previewLimited: boolean;
  toc: { id: string; text: string; level: number }[];
  stats: {
    words: number;
    characters: number;
    headings: number;
    links: number;
    images: number;
    readTimeMinutes: number;
  };
  bytes: number;
};
