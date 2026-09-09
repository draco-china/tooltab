import { textmateThemeToMonacoTheme } from "@shikijs/monaco";
import oneDarkPro from "@shikijs/themes/one-dark-pro";
import oneLight from "@shikijs/themes/one-light";
import { createHighlighterCore, type LanguageRegistration } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type {
  HighlightToken,
  HighlightWorkerRequest,
  MonacoThemeData,
} from "./code-highlighter.types";

const aliases: Record<string, string> = {
  html: "xml",
  svg: "xml",
  toml: "ini",
  ics: "properties",
  shell: "bash",
  sh: "bash",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
};

const languageLoaders: Record<
  string,
  () => Promise<{ default: LanguageRegistration[] }>
> = {
  bash: () => import("@shikijs/langs/bash"),
  css: () => import("@shikijs/langs/css"),
  csv: () => import("@shikijs/langs/csv"),
  ini: () => import("@shikijs/langs/ini"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  markdown: () => import("@shikijs/langs/markdown"),
  properties: () => import("@shikijs/langs/properties"),
  python: () => import("@shikijs/langs/python"),
  sql: () => import("@shikijs/langs/sql"),
  typescript: () => import("@shikijs/langs/typescript"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
};

const highlighterPromise = createHighlighterCore({
  themes: [oneDarkPro, oneLight],
  langs: [],
  engine: createJavaScriptRegexEngine(),
});
const loadedLanguages = new Set<string>();
const themes = new Map<string, MonacoThemeData>();

self.onmessage = async ({ data }: MessageEvent<HighlightWorkerRequest>) => {
  try {
    const highlighter = await highlighterPromise;
    const themeName = data.theme === "dark" ? "one-dark-pro" : "one-light";
    const theme = getTheme(highlighter.getTheme(themeName));
    if (data.kind === "theme") {
      self.postMessage({ id: data.id, kind: "theme", theme });
      return;
    }

    const language =
      aliases[data.language.toLowerCase()] ?? data.language.toLowerCase();
    const loader = languageLoaders[language];
    if (!loader) {
      self.postMessage(
        data.kind === "highlight"
          ? { id: data.id, kind: "highlight", lines: plainLines(data.code) }
          : { id: data.id, kind: "tokens", data: [] },
      );
      return;
    }
    if (!loadedLanguages.has(language)) {
      await highlighter.loadLanguage((await loader()).default);
      loadedLanguages.add(language);
    }
    const lines = highlighter.codeToTokens(data.code, {
      lang: language,
      theme: themeName,
    }).tokens as HighlightToken[][];
    self.postMessage(
      data.kind === "highlight"
        ? { id: data.id, kind: "highlight", lines }
        : {
            id: data.id,
            kind: "tokens",
            data: toSemanticTokens(lines, theme.semanticColors),
          },
    );
  } catch (error) {
    self.postMessage({
      id: data.id,
      kind: "error",
      error:
        error instanceof Error ? error.message : "Unable to highlight code",
    });
  }
};

function getTheme(
  source: Awaited<typeof highlighterPromise> extends infer H
    ? H extends { getTheme(name: string): infer T }
      ? T
      : never
    : never,
) {
  const cached = themes.get(source.name);
  if (cached) return cached;
  const base = textmateThemeToMonacoTheme(source) as MonacoThemeData;
  const colors = new Set<string>();
  for (const rule of base.rules) {
    const color = normalizeColor(rule.foreground);
    if (color) colors.add(color);
  }
  const foreground = normalizeColor(base.colors["editor.foreground"]);
  if (foreground) colors.add(foreground);
  const result = { ...base, semanticColors: [...colors].sort() };
  themes.set(source.name, result);
  return result;
}

function toSemanticTokens(lines: HighlightToken[][], colors: string[]) {
  const indexes = new Map(colors.map((color, index) => [color, index]));
  const data: number[] = [];
  let previousLine = 0;
  let previousStart = 0;
  lines.forEach((tokens, line) => {
    let column = 0;
    for (const token of tokens) {
      const length = token.content.length;
      const type = indexes.get(normalizeColor(token.color) ?? "");
      if (type !== undefined && length > 0 && token.content.trim()) {
        const deltaLine = line - previousLine;
        data.push(
          deltaLine,
          deltaLine === 0 ? column - previousStart : column,
          length,
          type,
          (token.fontStyle ?? 0) & 7,
        );
        previousLine = line;
        previousStart = column;
      }
      column += length;
    }
  });
  return data;
}

function normalizeColor(value: unknown) {
  if (typeof value !== "string") return undefined;
  const color = value.replace(/^#/, "").toLowerCase();
  return /^[\da-f]{6}(?:[\da-f]{2})?$/.test(color) ? color : undefined;
}

function plainLines(code: string): HighlightToken[][] {
  return code.split("\n").map((content) => [{ content }]);
}
