import hljs from "highlight.js/lib/common";
import js from "highlight.js/lib/languages/javascript";
import sql from "highlight.js/lib/languages/sql";
import xml from "highlight.js/lib/languages/xml";
import { formatterFilename } from "@workspace/tools/format/prettier-config";
import { formatPrettier } from "@workspace/tools/format/prettier";
import {
  formatAndLintSql,
  sqlLintSchema,
  sqlOptionsSchema,
} from "@workspace/tools/format/sql";
import {
  FORMATTER_INPUT_LIMIT,
  FORMATTER_OUTPUT_LIMIT,
  FormatterError,
} from "@workspace/tools/format/contract";
import { prettierOptionsSchema } from "@workspace/tools/format/prettier-config";
import {
  FORMATTER_PREVIEW_LIMIT,
  type FormatterJob,
  type FormatterResult,
} from "./types";

hljs.registerLanguage("javascript", js);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("xml", xml);
export async function executeFormatter(
  job: FormatterJob,
): Promise<FormatterResult> {
  if (typeof job.input !== "string" || /\p{Cs}/u.test(job.input))
    throw new FormatterError("invalid_input");
  if (new TextEncoder().encode(job.input).length > FORMATTER_INPUT_LIMIT)
    throw new FormatterError("too_large");
  let output: string,
    issues: FormatterResult["issues"] = [],
    formatError: string | null = null,
    filename = "formatted.sql";
  if (job.kind === "prettier") {
    const options = prettierOptionsSchema.parse(job.options);
    filename = formatterFilename(options.language);
    output = await formatPrettier(job.input, options);
  } else if (job.kind === "sql")
    ({ output, issues, formatError } = formatAndLintSql(
      job.input,
      sqlOptionsSchema.parse(job.options),
      sqlLintSchema.parse(job.lint),
    ));
  else throw new FormatterError("invalid_options");
  const bytes = new TextEncoder().encode(output).length;
  if (
    bytes > FORMATTER_OUTPUT_LIMIT ||
    new TextEncoder().encode(JSON.stringify(issues)).length + bytes >
      FORMATTER_OUTPUT_LIMIT
  )
    throw new FormatterError("too_large");
  const highlighted = hljs.highlight(output.slice(0, FORMATTER_PREVIEW_LIMIT), {
    language:
      job.kind === "sql" ? "sql" : highlightLanguage(job.options.language),
    ignoreIllegals: true,
  }).value;
  return {
    output,
    bytes,
    filename,
    highlighted,
    previewLimited: output.length > FORMATTER_PREVIEW_LIMIT,
    issues,
    formatError,
  };
}

function highlightLanguage(language: string) {
  const markup = ["html", "angular", "vue", "svelte", "lwc", "mjml", "xml"];
  const mapped = markup.includes(language)
    ? "xml"
    : language === "jsx" || language === "flow"
      ? "javascript"
      : language === "tsx"
        ? "typescript"
        : language.startsWith("json")
          ? "json"
          : language === "postcss" || language === "scss" || language === "less"
            ? "css"
            : language === "mdx"
              ? "markdown"
              : language;
  return hljs.getLanguage(mapped) ? mapped : "plaintext";
}
