import definitions from "./invisible-data.json";
import { TextUtilityError, textBuilder, validateText } from "./shared";
export const INVISIBLE_CATEGORIES = [
  "zero-width",
  "bidi-control",
  "space-like",
  "format",
] as const;
export type InvisibleCategory = (typeof INVISIBLE_CATEGORIES)[number];
export const INVISIBLE_DEFINITIONS = definitions.entries;
const entries = new Map(
  definitions.entries.map((entry) => [entry.code, entry]),
);
export type InvisibleFinding = {
  index: number;
  line: number;
  column: number;
  utf16Offset: number;
  code: string;
  name: string;
  category: string;
  token: string;
};
export function scanInvisible(
  input: string,
  categories: readonly string[] = INVISIBLE_CATEGORIES,
) {
  validateText(input);
  if (
    !Array.isArray(categories) ||
    categories.some(
      (c) => !INVISIBLE_CATEGORIES.includes(c as InvisibleCategory),
    )
  )
    throw new TextUtilityError("invalid_options");
  const enabled = new Set(categories),
    cleaned = textBuilder(),
    annotated = textBuilder(),
    report = textBuilder();
  const counts: Record<InvisibleCategory, number> = {
    "zero-width": 0,
    "bidi-control": 0,
    "space-like": 0,
    format: 0,
  };
  const findings: InvisibleFinding[] = [];
  let index = 0,
    offset = 0,
    line = 1,
    column = 1,
    last = 0,
    previousCR = false,
    total = 0;
  for (const char of input) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const entry = entries.get(char.codePointAt(0)!);
    if (entry && enabled.has(entry.category)) {
      const token = `[[${entry.short}]]`,
        record = {
          index: index + 1,
          line,
          column,
          utf16Offset: offset,
          code: `U+${entry.code.toString(16).toUpperCase().padStart(4, "0")}`,
          name: entry.name,
          category: entry.category,
          token,
        };
      counts[entry.category as InvisibleCategory]++;
      total++;
      if (findings.length < 500) findings.push(record);
      cleaned.append(input.slice(last, offset));
      annotated.append(input.slice(last, offset));
      annotated.append(token);
      last = offset + char.length;
      if (total === 1)
        report.append(
          "index\tline\tcolumn\tutf16Offset\tcode\tname\tcategory\ttoken\n",
        );
      else report.append("\n");
      report.append(
        `${record.index}\t${line}\t${column}\t${offset}\t${record.code}\t${entry.name}\t${entry.category}\t${token}`,
      );
    }
    if (char === "\r") {
      line++;
      column = 1;
      previousCR = true;
    } else if (char === "\n") {
      if (!previousCR) line++;
      column = 1;
      previousCR = false;
    } else {
      column++;
      previousCR = false;
    }
    index++;
    offset += char.length;
  }
  cleaned.append(input.slice(last));
  annotated.append(input.slice(last));
  return {
    kind: "invisible" as const,
    findings,
    findingsTruncated: total > findings.length,
    total,
    counts,
    codePoints: index,
    cleanedCodePoints: index - total,
    cleanedText: cleaned.finish(),
    annotatedText: annotated.finish(),
    findingsTsv: report.finish(),
    unicodeVersion: definitions.unicodeVersion,
    scopeSize: entries.size,
  };
}
