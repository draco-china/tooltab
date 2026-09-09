import { escapeHtml } from "@workspace/tools/text/markdown-heading";
import { EXPORT_BASE_STYLES, EXPORT_THEME_STYLES } from "./export-styles";
import type { PreviewTheme } from "./preview-options";
export function outlineHtml(items: readonly { id: string; text: string }[]) {
  return `<nav aria-label="Outline"><ol>${items.map((item) => `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.text)}</a></li>`).join("")}</ol></nav>`;
}
export function createExportHtmlDocument(options: {
  title: string;
  html: string;
  theme: PreviewTheme;
  language: string;
  direction: "ltr" | "rtl";
}) {
  return `<!doctype html><html lang="${escapeHtml(options.language)}" dir="${options.direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.title)}</title><style>${EXPORT_BASE_STYLES}${EXPORT_THEME_STYLES[options.theme]}</style></head><body><main><article>${options.html}</article></main></body></html>`;
}
