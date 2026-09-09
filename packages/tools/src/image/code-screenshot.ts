import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

export const CODE_SCREENSHOT_MAX_INPUT = 100_000;
export const CODE_SCREENSHOT_MAX_DIMENSION = 4096;
export const CODE_SCREENSHOT_MAX_PIXELS = 16_000_000;
export const codeScreenshotLanguages = [
  "auto",
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "go",
  "java",
  "javascript",
  "json",
  "markdown",
  "php",
  "python",
  "ruby",
  "rust",
  "swift",
  "typescript",
  "xml",
  "yaml",
] as const;
export type CodeLanguage = (typeof codeScreenshotLanguages)[number];
export type CodeThemeId = "nebula" | "sunrise" | "paper" | "terminal";
export type BackgroundPresetId =
  | "aurora"
  | "sunset"
  | "ocean"
  | "ember"
  | "noir";
export type CodeScreenshotOptions = {
  code: string;
  language: CodeLanguage;
  renderMode: "highlight" | "plain";
  theme: CodeThemeId;
  backgroundMode: "preset" | "solid" | "transparent" | "none";
  backgroundPreset: BackgroundPresetId;
  backgroundColor: string;
  windowStyle: "mac" | "windows" | "none";
  lineNumbers: boolean;
  fontSize: number;
  lineHeight: number;
  cardPadding: number;
  framePadding: number;
  radius: number;
  shadow: boolean;
  tabSize: number;
};

export const defaultCodeScreenshotOptions: CodeScreenshotOptions = {
  code: `const createShot = (code: string) => ({\n  code,\n  theme: "nebula",\n  formats: ["png", "svg", "webp", "html"],\n});`,
  language: "typescript",
  renderMode: "highlight",
  theme: "nebula",
  backgroundMode: "preset",
  backgroundPreset: "aurora",
  backgroundColor: "#0f172a",
  windowStyle: "mac",
  lineNumbers: true,
  fontSize: 16,
  lineHeight: 1.6,
  cardPadding: 24,
  framePadding: 48,
  radius: 18,
  shadow: true,
  tabSize: 2,
};

type TokenStyle = { color: string; italic?: boolean };
type Theme = {
  background: string;
  foreground: string;
  header: string;
  border: string;
  lineNumber: string;
  tokens: Record<string, TokenStyle>;
};
const baseTokens = (
  keyword: string,
  string: string,
  number: string,
  comment: string,
  title: string,
): Record<string, TokenStyle> => ({
  "hljs-keyword": { color: keyword },
  "hljs-built_in": { color: keyword },
  "hljs-type": { color: title },
  "hljs-literal": { color: number },
  "hljs-number": { color: number },
  "hljs-string": { color: string },
  "hljs-comment": { color: comment, italic: true },
  "hljs-title": { color: title },
  "hljs-function": { color: title },
  "hljs-attr": { color: number },
  "hljs-attribute": { color: number },
  "hljs-tag": { color: keyword },
  "hljs-name": { color: keyword },
  "hljs-meta": { color: title },
  "hljs-regexp": { color: number },
  "hljs-symbol": { color: string },
});
export const codeThemes: Record<CodeThemeId, Theme> = {
  nebula: {
    background: "#0b1020",
    foreground: "#e2e8f0",
    header: "#111827",
    border: "#263044",
    lineNumber: "#64748b",
    tokens: baseTokens("#60a5fa", "#34d399", "#fbbf24", "#94a3b8", "#c084fc"),
  },
  sunrise: {
    background: "#151117",
    foreground: "#f8fafc",
    header: "#1e1a24",
    border: "#352a3f",
    lineNumber: "#8b8b9a",
    tokens: baseTokens("#fb7185", "#4ade80", "#fbbf24", "#94a3b8", "#f472b6"),
  },
  paper: {
    background: "#f8fafc",
    foreground: "#0f172a",
    header: "#e2e8f0",
    border: "#cbd5e1",
    lineNumber: "#64748b",
    tokens: baseTokens("#0369a1", "#15803d", "#b45309", "#64748b", "#7c3aed"),
  },
  terminal: {
    background: "#0b0f0b",
    foreground: "#e5e7eb",
    header: "#0f1410",
    border: "#253028",
    lineNumber: "#6b7280",
    tokens: baseTokens("#22c55e", "#86efac", "#fbbf24", "#6b7280", "#4ade80"),
  },
};
export const backgroundPresets: Record<BackgroundPresetId, readonly string[]> =
  {
    aurora: ["#0ea5e9", "#22c55e", "#f59e0b"],
    sunset: ["#f43f5e", "#f97316", "#facc15"],
    ocean: ["#2563eb", "#0ea5e9", "#14b8a6"],
    ember: ["#7c2d12", "#ea580c", "#fb7185"],
    noir: ["#1f2937", "#0b0f1a"],
  };

const highlighter = hljs.newInstance();
for (const [name, definition] of Object.entries({
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  markdown,
  php,
  python,
  ruby,
  rust,
  swift,
  typescript,
  xml,
  yaml,
}))
  highlighter.registerLanguage(name, definition);

export class CodeScreenshotError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "invalid_options"
      | "too_large"
      | "unsupported"
      | "busy"
      | "timeout"
      | "render_failed"
      | "output_too_large",
  ) {
    super(code);
  }
}
const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const decodeHtml = (value: string) =>
  value.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_part, key: string) => {
    const entities: Record<string, string> = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      "#x27": "'",
      "#39": "'",
    };
    // The capture is restricted to these six entity names by the regex.
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    return entities[key]!;
  });
const safeColor = (value: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(value))
    throw new CodeScreenshotError("invalid_options");
  return value.toLowerCase();
};
export function validateCodeScreenshotOptions(value: CodeScreenshotOptions) {
  if (!value.code.trim()) throw new CodeScreenshotError("invalid_input");
  // SVG is XML: reject characters that cannot be represented faithfully.
  if (
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject XML-forbidden control characters before SVG export.
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u.test(
      value.code,
    )
  )
    throw new CodeScreenshotError("invalid_input");
  if (new TextEncoder().encode(value.code).length > CODE_SCREENSHOT_MAX_INPUT)
    throw new CodeScreenshotError("too_large");
  if (
    !codeScreenshotLanguages.includes(value.language) ||
    !Object.hasOwn(codeThemes, value.theme) ||
    !Object.hasOwn(backgroundPresets, value.backgroundPreset)
  )
    throw new CodeScreenshotError("invalid_options");
  if (
    !["highlight", "plain"].includes(value.renderMode) ||
    !["preset", "solid", "transparent", "none"].includes(
      value.backgroundMode,
    ) ||
    !["mac", "windows", "none"].includes(value.windowStyle)
  )
    throw new CodeScreenshotError("invalid_options");
  for (const [number, min, max] of [
    [value.fontSize, 10, 32],
    [value.lineHeight, 1, 2.2],
    [value.cardPadding, 8, 80],
    [value.framePadding, 0, 120],
    [value.radius, 0, 40],
    [value.tabSize, 1, 8],
  ] as const)
    if (!Number.isFinite(number) || number < min || number > max)
      throw new CodeScreenshotError("invalid_options");
  safeColor(value.backgroundColor);
}
type Segment = { text: string; classes: string[] };
function highlightedSegments(options: CodeScreenshotOptions): Segment[] {
  const code = options.code
    .replaceAll("\r\n", "\n")
    .replaceAll("\t", " ".repeat(options.tabSize));
  if (options.renderMode === "plain") return [{ text: code, classes: [] }];
  // This private instance uses fixed languages and the default safe-mode text fallback.
  const html =
    options.language === "auto"
      ? highlighter.highlightAuto(code).value
      : highlighter.highlight(code, { language: options.language }).value;
  const output: Segment[] = [],
    stack: string[][] = [[]];
  for (const part of html.split(/(<[^>]+>)/g)) {
    if (!part) continue;
    if (part.startsWith("</")) {
      stack.pop();
    } else if (part.startsWith("<span")) {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      const classes = /class="([^"]*)"/
        .exec(part)![1]!
        .split(/\s+/)
        .filter(Boolean);
      // The private emitter emits balanced spans with class attributes; text is escaped.
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      stack.push([...stack.at(-1)!, ...classes]);
    } else
      output.push({
        text: decodeHtml(part),
        // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
        classes: stack.at(-1)!,
      });
  }
  // Validated nonblank input is preserved by the fixed emitter, including its error fallback.
  return output;
}
type Styled = { text: string; color: string; italic: boolean };
function lines(options: CodeScreenshotOptions, theme: Theme): Styled[][] {
  const result: Styled[][] = [[]];
  for (const segment of highlightedSegments(options)) {
    let style: TokenStyle = { color: theme.foreground };
    for (const name of segment.classes)
      if (theme.tokens[name]) style = { ...style, ...theme.tokens[name] };
    segment.text.split("\n").forEach((text, index, all) => {
      if (text)
        result.at(-1)?.push({
          text,
          color: style.color,
          italic: !!style.italic,
        });
      if (index < all.length - 1) result.push([]);
    });
  }
  return result;
}
function gradient(options: CodeScreenshotOptions) {
  if (
    options.backgroundMode === "none" ||
    options.backgroundMode === "transparent"
  )
    return { defs: "", fill: "none" };
  if (options.backgroundMode === "solid")
    return { defs: "", fill: safeColor(options.backgroundColor) };
  const colors = backgroundPresets[options.backgroundPreset];
  const tag =
    options.backgroundPreset === "noir" ? "radialGradient" : "linearGradient";
  return {
    defs: `<${tag} id="shot-bg" x1="0" y1="0" x2="1" y2="1">${colors.map((color, index) => `<stop offset="${index / (colors.length - 1)}" stop-color="${color}"/>`).join("")}</${tag}>`,
    fill: "url(#shot-bg)",
  };
}
export type CodeScreenshotRender = {
  svg: string;
  html: string;
  width: number;
  height: number;
  lines: number;
};
export function renderCodeScreenshot(
  options: CodeScreenshotOptions,
): CodeScreenshotRender {
  validateCodeScreenshotOptions(options);
  const theme = codeThemes[options.theme],
    rows = lines(options, theme),
    lineHeight = options.fontSize * options.lineHeight;
  const longest = Math.max(
    1,
    ...rows.map((row) =>
      row.reduce((n, token) => n + [...token.text].length, 0),
    ),
  );
  const gutter = options.lineNumbers
    ? String(rows.length).length * options.fontSize * 0.62 + 22
    : 0;
  const frame = options.backgroundMode === "none" ? 0 : options.framePadding;
  const header = options.windowStyle === "none" ? 0 : 40;
  const cardWidth = Math.ceil(
    longest * options.fontSize * 0.62 + gutter + options.cardPadding * 2,
  );
  const cardHeight = Math.ceil(
    rows.length * lineHeight + options.cardPadding * 2 + header,
  );
  const width = cardWidth + frame * 2,
    height = cardHeight + frame * 2;
  if (
    width > CODE_SCREENSHOT_MAX_DIMENSION ||
    height > CODE_SCREENSHOT_MAX_DIMENSION ||
    width * height > CODE_SCREENSHOT_MAX_PIXELS
  )
    throw new CodeScreenshotError("too_large");
  const bg = gradient(options),
    cardX = frame,
    cardY = frame,
    codeX = cardX + options.cardPadding + gutter,
    bodyY = cardY + header + options.cardPadding;
  const controls =
    options.windowStyle === "mac"
      ? ["#ff5f57", "#febc2e", "#28c840"]
          .map(
            (color, i) =>
              `<circle cx="${cardX + options.cardPadding + 6 + i * 22}" cy="${cardY + 20}" r="6" fill="${color}"/>`,
          )
          .join("")
      : options.windowStyle === "windows"
        ? `<path d="M${cardX + cardWidth - 70} ${cardY + 15}h10M${cardX + cardWidth - 45} ${cardY + 15}v10h10v-10zM${cardX + cardWidth - 16} ${cardY + 15}l10 10m0-10l-10 10" fill="none" stroke="#94a3b8" stroke-width="1.5"/>`
        : "";
  const content = rows
    .map(
      (row, index) =>
        `<text x="${codeX}" y="${bodyY + index * lineHeight}" font-family="SFMono-Regular,Menlo,Monaco,Consolas,monospace" font-size="${options.fontSize}" dominant-baseline="text-before-edge" xml:space="preserve">${row.length ? row.map((token) => `<tspan fill="${token.color}"${token.italic ? ' font-style="italic"' : ""}>${escapeXml(token.text)}</tspan>`).join("") : "&#160;"}</text>`,
    )
    .join("");
  const numbers = options.lineNumbers
    ? rows
        .map(
          (_, i) =>
            `<text x="${codeX - 16}" y="${bodyY + i * lineHeight}" fill="${theme.lineNumber}" text-anchor="end" font-family="SFMono-Regular,Menlo,Monaco,Consolas,monospace" font-size="${options.fontSize}" dominant-baseline="text-before-edge">${i + 1}</text>`,
        )
        .join("")
    : "";
  const shadow =
    options.shadow && frame
      ? `<filter id="shot-shadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity=".3"/></filter>`
      : "";
  const filter = shadow ? ' filter="url(#shot-shadow)"' : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${bg.defs}${shadow}</defs><rect width="100%" height="100%" fill="${bg.fill}"/><g${filter}><rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="${options.radius}" fill="${theme.background}" stroke="${theme.border}"/><path d="M${cardX} ${cardY + header}h${cardWidth}" stroke="${theme.border}"/>${options.windowStyle === "none" ? "" : `<path d="M${cardX + options.radius} ${cardY}h${cardWidth - options.radius * 2}a${options.radius} ${options.radius} 0 0 1 ${options.radius} ${options.radius}v${header - options.radius}h-${cardWidth}v-${header - options.radius}a${options.radius} ${options.radius} 0 0 1 ${options.radius}-${options.radius}" fill="${theme.header}"/>${controls}`}${numbers}${content}</g></svg>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Code screenshot</title><style>html,body{margin:0;background:transparent}svg{display:block;max-width:100%;height:auto}</style></head><body>${svg}</body></html>`;
  return { svg, html, width, height, lines: rows.length };
}
