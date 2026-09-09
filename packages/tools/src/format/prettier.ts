// Source consumers need this ambient declaration for the untyped browser subpath.
/// <reference path="./plugins.d.ts" />
import type { Plugin } from "prettier";
import * as prettier from "prettier/standalone";
import {
  languageConfigurations,
  prettierOptionsSchema,
  type PrettierOptions,
} from "./prettier-config";
import type { z } from "zod";
import {
  FORMATTER_INPUT_LIMIT,
  FORMATTER_OUTPUT_LIMIT,
  FormatterError,
} from "./contract";

const loaders = {
  angular: () => import("prettier/plugins/angular"),
  babel: () => import("prettier/plugins/babel"),
  estree: () => import("prettier/plugins/estree"),
  flow: () => import("prettier/plugins/flow"),
  glimmer: () => import("prettier/plugins/glimmer"),
  graphql: () => import("prettier/plugins/graphql"),
  html: () => import("prettier/plugins/html"),
  markdown: () => import("prettier/plugins/markdown"),
  postcss: () => import("prettier/plugins/postcss"),
  typescript: () => import("prettier/plugins/typescript"),
  yaml: () => import("prettier/plugins/yaml"),
  xml: () => import("@prettier/plugin-xml"),
  svelte: () => import("prettier-plugin-svelte/browser"),
};
type PluginKey = keyof typeof loaders;
function keys(language: PrettierOptions["language"]): PluginKey[] {
  if (
    ["javascript", "jsx", "json", "json-stringify", "json5", "jsonc"].includes(
      language,
    )
  )
    return ["babel", "estree"];
  if (language === "typescript" || language === "tsx")
    return ["typescript", "estree"];
  if (language === "flow") return ["flow", "estree"];
  if (language === "svelte") return ["svelte", "babel", "typescript", "estree"];
  if (language === "angular")
    return ["html", "angular", "babel", "estree", "typescript"];
  if (language === "vue")
    return ["html", "babel", "typescript", "estree", "postcss"];
  if (["html", "lwc", "mjml"].includes(language))
    return ["html", "babel", "estree", "postcss"];
  if (["css", "postcss", "scss", "less"].includes(language)) return ["postcss"];
  if (language === "handlebars") return ["glimmer"];
  if (language === "markdown" || language === "mdx")
    return ["markdown", "babel", "typescript", "estree", "html"];
  return [language as "xml" | "yaml" | "graphql"];
}
export async function formatPrettier(
  input: string,
  optionsInput: z.input<typeof prettierOptionsSchema> = {},
) {
  if (typeof input !== "string" || /\p{Cs}/u.test(input))
    throw new FormatterError("invalid_input");
  if (new TextEncoder().encode(input).length > FORMATTER_INPUT_LIMIT)
    throw new FormatterError("too_large");
  const options = prettierOptionsSchema.parse(optionsInput);
  let output: string;
  try {
    const plugins: Plugin[] = await Promise.all(
      keys(options.language).map(async (key) => {
        const module = await loaders[key]();
        return "default" in module ? module.default : module;
      }),
    );
    const config = languageConfigurations[options.language];
    output = await prettier.format(input, {
      parser: config.parser,
      plugins,
      printWidth: options.printWidth,
      tabWidth: options.tabWidth,
      useTabs: options.useTabs,
      ...(config.script
        ? {
            semi: options.semi,
            singleQuote: options.singleQuote,
            trailingComma: options.trailingComma,
          }
        : config.quote
          ? { singleQuote: options.singleQuote }
          : {}),
    });
  } catch (error) {
    // Only fixed bundled parsers/plugins are loaded; callers cannot supply hooks.
    // Their parse failures and native import failures are Error instances.
    const message = (error as Error).message.slice(0, 16384);
    const loc = message.match(/\((\d+):(\d+)\)/);
    throw new FormatterError(
      "parse_error",
      message,
      loc ? Number(loc[1]) : undefined,
      loc ? Number(loc[2]) : undefined,
    );
  }
  if (new TextEncoder().encode(output).length > FORMATTER_OUTPUT_LIMIT)
    throw new FormatterError("too_large");
  return output;
}
