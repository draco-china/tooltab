import { z } from "zod";
export const formatterLanguages = [
  "javascript",
  "jsx",
  "typescript",
  "tsx",
  "flow",
  "json",
  "json-stringify",
  "json5",
  "jsonc",
  "html",
  "angular",
  "vue",
  "svelte",
  "lwc",
  "mjml",
  "handlebars",
  "xml",
  "css",
  "postcss",
  "scss",
  "less",
  "markdown",
  "mdx",
  "yaml",
  "graphql",
] as const;
export const prettierOptionsSchema = z.strictObject({
  language: z.enum(formatterLanguages).default("javascript"),
  printWidth: z.number().int().min(40).max(200).default(80),
  tabWidth: z.number().int().min(1).max(8).default(2),
  useTabs: z.boolean().default(false),
  semi: z.boolean().default(true),
  singleQuote: z.boolean().default(false),
  trailingComma: z.enum(["none", "es5", "all"]).default("es5"),
});
export type FormatterLanguage = (typeof formatterLanguages)[number];
export type PrettierOptions = z.output<typeof prettierOptionsSchema>;

type Language = {
  parser: string;
  extensions: readonly [string, ...string[]];
  script?: boolean;
  quote?: boolean;
};
// LWC is explicitly selected: ordinary .html files must not auto-detect as LWC.
export const languageConfigurations: {
  [K in FormatterLanguage]: Omit<Language, "extensions"> & {
    extensions: K extends "lwc" ? readonly [] : Language["extensions"];
  };
} = {
  javascript: {
    parser: "babel",
    extensions: [".js", ".mjs", ".cjs"],
    script: true,
  },
  jsx: {
    parser: "babel",
    extensions: [".jsx"],
    script: true,
  },
  typescript: {
    parser: "typescript",
    extensions: [".ts", ".cts", ".mts"],
    script: true,
  },
  tsx: {
    parser: "typescript",
    extensions: [".tsx"],
    script: true,
  },
  flow: {
    parser: "flow",
    extensions: [".js.flow"],
    script: true,
  },
  json: {
    parser: "json",
    extensions: [".json"],
  },
  "json-stringify": {
    parser: "json-stringify",
    extensions: [".importmap"],
  },
  json5: {
    parser: "json5",
    extensions: [".json5"],
  },
  jsonc: {
    parser: "jsonc",
    extensions: [".jsonc"],
  },
  html: {
    parser: "html",
    extensions: [".html", ".htm", ".xhtml"],
    quote: true,
  },
  angular: {
    parser: "angular",
    extensions: [".component.html"],
    quote: true,
  },
  vue: {
    parser: "vue",
    extensions: [".vue"],
    quote: true,
  },
  svelte: {
    parser: "svelte",
    extensions: [".svelte"],
    quote: true,
  },
  lwc: {
    parser: "lwc",
    extensions: [],
    quote: true,
  },
  mjml: {
    parser: "mjml",
    extensions: [".mjml"],
    quote: true,
  },
  handlebars: {
    parser: "glimmer",
    extensions: [".hbs", ".handlebars", ".mustache"],
    quote: true,
  },
  xml: {
    parser: "xml",
    extensions: [
      ".xml",
      ".svg",
      ".rss",
      ".atom",
      ".xsd",
      ".wsdl",
      ".xsl",
      ".xslt",
    ],
    quote: true,
  },
  css: {
    parser: "css",
    extensions: [".css"],
    quote: true,
  },
  postcss: {
    parser: "css",
    extensions: [".postcss", ".pcss"],
    quote: true,
  },
  scss: {
    parser: "scss",
    extensions: [".scss"],
    quote: true,
  },
  less: {
    parser: "less",
    extensions: [".less"],
    quote: true,
  },
  markdown: {
    parser: "markdown",
    extensions: [".md", ".markdown"],
  },
  mdx: {
    parser: "mdx",
    extensions: [".mdx"],
    script: true,
  },
  yaml: {
    parser: "yaml",
    extensions: [".yaml", ".yml"],
  },
  graphql: {
    parser: "graphql",
    extensions: [".graphql", ".gql", ".graphqls"],
  },
};
export function detectFormatterLanguage(
  filename: string,
): FormatterLanguage | null {
  const normalized = filename.toLowerCase().replaceAll("\\", "/");
  const name = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (["package.json", "package-lock.json", "composer.json"].includes(name))
    return "json-stringify";
  let found: FormatterLanguage | null = null;
  let length = 0;
  for (const [language, config] of Object.entries(languageConfigurations))
    for (const ext of config.extensions)
      if (name.endsWith(ext) && ext.length > length) {
        found = language as FormatterLanguage;
        length = ext.length;
      }
  return found;
}
export function formatterFilename(language: FormatterLanguage) {
  return `formatted${language === "json-stringify" ? ".json" : language === "angular" || language === "lwc" ? ".html" : languageConfigurations[language].extensions[0]}`;
}
