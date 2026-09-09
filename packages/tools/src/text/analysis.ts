import { diffArrays, diffWordsWithSpace } from "diff";
export const MAX_TEXT_BYTES = 16 * 1024 * 1024;
export const MAX_RESULT_BYTES = 128 * 1024 * 1024;
export const MAX_DIFF_LINES = 200000;
export const PREVIEW_CHARACTERS = 5000;
export const DISPLAY_MATCHES = 200;
export const DISPLAY_ROWS = 1000;
export class TextAnalysisError extends Error {
  constructor(
    public code:
      | "invalid_input"
      | "invalid_options"
      | "invalid_pattern"
      | "too_large"
      | "timeout"
      | "unsupported"
      | "busy"
      | "artifact_required"
      | "read_failed",
    public detail?: string,
  ) {
    super(code);
  }
}
export type AnalysisJob =
  | {
      kind: "diff";
      original: string;
      modified: string;
      ignoreCase?: boolean;
      ignoreWhitespace?: boolean;
      hideUnchanged?: boolean;
    }
  | {
      kind: "regex";
      input: string;
      pattern: string;
      flags?: string;
      replacement?: string;
    };
export type DiffToken = { kind: "equal" | "add" | "remove"; value: string };
export type DiffSide = {
  lineNumber: number | null;
  text: string;
  tokens: DiffToken[];
};
export type DiffRow = {
  kind: "equal" | "add" | "remove" | "replace";
  original: DiffSide;
  modified: DiffSide;
};
export type DiffResult = {
  kind: "diff";
  rows: DiffRow[];
  rowsTruncated: boolean;
  unifiedText: string;
  stats: {
    originalLineCount: number;
    modifiedLineCount: number;
    unchanged: number;
    changed: number;
    added: number;
    removed: number;
  };
};
export type Match = {
  index: number;
  end: number;
  match: string;
  groups: (string | null)[];
  namedGroups: Record<string, string | null>;
};
export type RegexResult = {
  kind: "regex";
  flags: string;
  matches: Match[];
  matchesTruncated: boolean;
  segments: { text: string; isMatch: boolean; index: number }[];
  previewTruncated: boolean;
  replacementOutput: string;
  replacementJson: string | null;
  matchesTsv: string;
  matchesPreviewText: string;
  summary: { matchCount: number; groupCount: number; zeroLengthCount: number };
};
export type AnalysisResult = DiffResult | RegexResult;
const encoder = new TextEncoder();
export function assertText(input: string, limit = MAX_TEXT_BYTES) {
  if (typeof input !== "string") throw new TextAnalysisError("invalid_input");
  if (input.length > limit || encoder.encode(input).length > limit)
    throw new TextAnalysisError("too_large");
  if (
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
      input,
    )
  )
    throw new TextAnalysisError("invalid_input");
}
export function clipText(text: string, limit: number) {
  let end = Math.min(text.length, limit);
  const last = text.charCodeAt(end - 1),
    next = text.charCodeAt(end);
  if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff)
    end--;
  return text.slice(0, end);
}
function collector() {
  let bytes = 0,
    previousHigh = false;
  const parts: string[] = [];
  return {
    add(text: string) {
      const first = text.charCodeAt(0);
      bytes +=
        encoder.encode(text).length -
        (previousHigh && first >= 0xdc00 && first <= 0xdfff ? 2 : 0);
      if (text.length) {
        const last = text.charCodeAt(text.length - 1);
        previousHigh = last >= 0xd800 && last <= 0xdbff;
      }
      if (bytes > MAX_RESULT_BYTES) throw new TextAnalysisError("too_large");
      parts.push(text);
    },
    text() {
      return parts.join("");
    },
  };
}
export function analyzeText(job: AnalysisJob): AnalysisResult {
  return job.kind === "diff" ? compareText(job) : testRegex(job);
}
export function splitLines(text: string) {
  return text === "" ? [] : text.replace(/\r\n?/g, "\n").split("\n");
}
function compareText(job: Extract<AnalysisJob, { kind: "diff" }>): DiffResult {
  assertText(job.original);
  assertText(job.modified);
  if (
    (job.ignoreCase !== undefined && typeof job.ignoreCase !== "boolean") ||
    (job.ignoreWhitespace !== undefined &&
      typeof job.ignoreWhitespace !== "boolean")
  )
    throw new TextAnalysisError("invalid_options");
  const old = splitLines(job.original),
    next = splitLines(job.modified);
  if (old.length > MAX_DIFF_LINES || next.length > MAX_DIFF_LINES)
    throw new TextAnalysisError("too_large");
  const normalize = (s: string) => {
    if (job.ignoreWhitespace) s = s.replace(/\s/g, "");
    return job.ignoreCase ? s.toLowerCase() : s;
  };
  const changes = diffArrays(old.map(normalize), next.map(normalize), {
    timeout: 9000,
  });
  if (!changes) throw new TextAnalysisError("timeout");
  const rows: DiffRow[] = [];
  let a = 0,
    b = 0,
    rowCount = 0,
    visibleCount = 0,
    previewRemaining = 65536,
    clipped = false;
  const stats = {
      originalLineCount: old.length,
      modifiedLineCount: next.length,
      unchanged: 0,
      changed: 0,
      added: 0,
      removed: 0,
    },
    report = collector();
  const side = (text: string | undefined, index: number): DiffSide => ({
    lineNumber: text === undefined ? null : index + 1,
    text: text ?? "",
    tokens: text ? [{ kind: "equal", value: text }] : [],
  });
  function emit(
    kind: DiffRow["kind"],
    left: string | undefined,
    right: string | undefined,
  ) {
    const visible = !(job.hideUnchanged && kind === "equal");
    if (visible) visibleCount++;
    const retain =
      visible && rows.length < DISPLAY_ROWS && previewRemaining > 0;
    const prefix = (text: string | undefined) => {
      if (!retain) return undefined;
      const value =
        text === undefined
          ? undefined
          : clipText(text, Math.min(5000, previewRemaining));
      previewRemaining -= value?.length ?? 0;
      if (value !== text) clipped = true;
      return value;
    };
    const original = side(prefix(left), a),
      modified = side(prefix(right), b);
    if (kind === "replace" && retain) {
      const pieces = diffWordsWithSpace(original.text, modified.text, {
        timeout: 1000,
      });
      if (!pieces) throw new TextAnalysisError("timeout");
      original.tokens = pieces
        .filter((p) => !p.added)
        .map((p) => ({ kind: p.removed ? "remove" : "equal", value: p.value }));
      modified.tokens = pieces
        .filter((p) => !p.removed)
        .map((p) => ({ kind: p.added ? "add" : "equal", value: p.value }));
    } else if (kind === "remove")
      original.tokens = original.text
        ? [{ kind: "remove", value: original.text }]
        : [];
    else if (kind === "add")
      modified.tokens = modified.text
        ? [{ kind: "add", value: modified.text }]
        : [];
    if (retain) rows.push({ kind, original, modified });
    if (rowCount++) report.add("\n");
    if (kind === "equal") {
      stats.unchanged++;
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      report.add(`  ${left!}`);
    } else if (kind === "replace") {
      stats.changed++;
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      report.add(`- ${left!}\n+ ${right!}`);
    } else if (kind === "add") {
      stats.added++;
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      report.add(`+ ${right!}`);
    } else {
      stats.removed++;
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      report.add(`- ${left!}`);
    }
    if (left !== undefined) a++;
    if (right !== undefined) b++;
  }
  for (let i = 0; i < changes.length; ) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const change = changes[i]!;
    if (!change.added && !change.removed) {
      for (let n = 0; n < change.value.length; n++)
        emit("equal", old[a], next[b]);
      i++;
      continue;
    }
    let removed = 0,
      added = 0;
    while (i < changes.length) {
      const c = changes[i];
      if (!c || (!c.added && !c.removed)) break;
      if (c.removed) removed += c.value.length;
      else added += c.value.length;
      i++;
    }
    for (let n = 0; n < Math.max(removed, added); n++)
      emit(
        n < removed && n < added ? "replace" : n < removed ? "remove" : "add",
        n < removed ? old[a] : undefined,
        n < added ? next[b] : undefined,
      );
  }
  return {
    kind: "diff",
    rows,
    rowsTruncated: clipped || visibleCount > rows.length,
    unifiedText: report.text(),
    stats,
  };
}
export function normalizeFlags(flags: string) {
  if (typeof flags !== "string" || /[^gimsuy]/.test(flags))
    throw new TextAnalysisError("invalid_options");
  return [..."gimsuy"].filter((f) => flags.includes(f)).join("");
}
/** ECMAScript GetSubstitution for a string replacement, emitted in bounded pieces. */
function replacementParts(
  template: string,
  input: string,
  match: RegExpExecArray,
  append: (s: string) => void,
) {
  let plain = "";
  const flush = () => {
    if (plain) {
      append(plain);
      plain = "";
    }
  };
  for (let i = 0; i < template.length; i++) {
    if (template[i] !== "$" || i + 1 === template.length) {
      plain += template[i];
      continue;
    }
    const token = template[i + 1];
    let value: string | undefined;
    if (token === "$") {
      value = "$";
      i++;
    } else if (token === "&") {
      value = match[0];
      i++;
    } else if (token === "`") {
      flush();
      append(input.slice(0, match.index));
      i++;
      continue;
    } else if (token === "'") {
      flush();
      append(input.slice(match.index + match[0].length));
      i++;
      continue;
    } else if (token === "<" && match.groups) {
      const end = template.indexOf(">", i + 2);
      if (end >= 0) {
        value = Object.hasOwn(match.groups, template.slice(i + 2, end))
          ? (match.groups[template.slice(i + 2, end)] ?? "")
          : "";
        i = end;
      }
    } else if (token && /\d/.test(token)) {
      let number = Number(token),
        width = 1;
      const next = template[i + 2];
      if (next && /\d/.test(next) && Number(token + next) < match.length) {
        number = Number(token + next);
        width = 2;
      }
      if (number > 0 && number < match.length) {
        value = match[number] ?? "";
        i += width;
      }
    }
    if (value === undefined) plain += "$";
    else {
      flush();
      append(value);
    }
  }
  flush();
}
function testRegex(job: Extract<AnalysisJob, { kind: "regex" }>): RegexResult {
  assertText(job.input);
  assertText(job.pattern, 65536);
  const replacement = job.replacement ?? "";
  assertText(replacement, 1024 * 1024);
  const flags = normalizeFlags(job.flags ?? "g");
  let regex: RegExp;
  try {
    regex = new RegExp(job.pattern, flags);
  } catch (error) {
    throw new TextAnalysisError(
      "invalid_pattern",
      error instanceof Error ? error.message.slice(0, 300) : undefined,
    );
  }
  const matches: Match[] = [],
    report = collector(),
    output = collector();
  const summary = { matchCount: 0, groupCount: 0, zeroLengthCount: 0 };
  let cursor = 0;
  // Upstream treats blank expressions as idle, not an empty-string matcher.
  if (job.pattern.trim())
    while (true) {
      const match = regex.exec(job.input);
      if (!match) break;
      const record: Match = {
        index: match.index,
        end: match.index + match[0].length,
        match: match[0],
        groups: match.slice(1).map((v) => v ?? null),
        namedGroups: Object.fromEntries(
          Object.entries(match.groups ?? {}).map(([k, v]) => [k, v ?? null]),
        ),
      };
      summary.matchCount++;
      summary.groupCount += record.groups.length;
      if (!record.match) summary.zeroLengthCount++;
      if (matches.length < DISPLAY_MATCHES) matches.push(record);
      if (summary.matchCount === 1)
        report.add("match\tstart\tend\ttext\tgroups\tnamedGroups\n");
      else report.add("\n");
      report.add(
        `${summary.matchCount}\t${record.index}\t${record.end}\t${JSON.stringify(record.match)}\t${JSON.stringify(record.groups)}\t${JSON.stringify(record.namedGroups)}`,
      );
      output.add(job.input.slice(cursor, record.index));
      replacementParts(replacement, job.input, match, (s) => output.add(s));
      cursor = record.end;
      if (!regex.global) break;
      if (record.end === record.index) {
        const code = job.input.codePointAt(regex.lastIndex);
        regex.lastIndex +=
          regex.unicode && code !== undefined && code > 0xffff ? 2 : 1;
      }
    }
  output.add(job.input.slice(cursor));
  const preview = clipText(job.input, PREVIEW_CHARACTERS);
  const segments: RegexResult["segments"] = [];
  let position = 0;
  for (const [index, match] of matches.entries()) {
    if (match.index >= preview.length) break;
    if (match.end === match.index) continue;
    if (match.index > position)
      segments.push({
        text: preview.slice(position, match.index),
        isMatch: false,
        index: position,
      });
    segments.push({
      text: preview.slice(match.index, Math.min(match.end, preview.length)),
      isMatch: true,
      index,
    });
    position = Math.min(match.end, preview.length);
  }
  if (position < preview.length)
    segments.push({
      text: preview.slice(position),
      isMatch: false,
      index: position,
    });
  const replacementOutput = output.text();
  const replacementJson =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
      replacementOutput,
    )
      ? JSON.stringify(replacementOutput)
      : null;
  if (replacementJson) assertText(replacementJson, MAX_RESULT_BYTES);
  return {
    kind: "regex",
    flags,
    matches,
    matchesTruncated: summary.matchCount > DISPLAY_MATCHES,
    segments,
    previewTruncated: job.input.length > PREVIEW_CHARACTERS,
    replacementOutput,
    replacementJson,
    matchesTsv: report.text(),
    matchesPreviewText: clipText(JSON.stringify(matches, null, 2), 65536),
    summary,
  };
}
