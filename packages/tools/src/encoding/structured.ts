import { keepLastJsonKeys, stringifyExactJson } from "./json-object";
import { isSafeNumber } from "lossless-json";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parseTOML, traverseNodes } from "toml-eslint-parser";
import {
  isScalar,
  LineCounter,
  parseDocument,
  stringify as stringifyYaml,
  visit,
} from "yaml";
export const FORMATS = ["json", "yaml", "toml"] as const;
export type StructuredFormat = (typeof FORMATS)[number];
export const MAX_STRUCTURED_INPUT = 32 * 1024 * 1024,
  MAX_STRUCTURED_OUTPUT = 128 * 1024 * 1024;
export type StructuredJob = {
  input: string;
  from: StructuredFormat;
  to: StructuredFormat;
};
export class StructuredError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "precision_loss"
      | "unsupported_value"
      | "too_large"
      | "too_deep"
      | "alias_expansion"
      | "unsupported"
      | "timeout"
      | "busy"
      | "read_failed",
    public readonly line?: number,
    public readonly column?: number,
  ) {
    super(code);
  }
}
function safeNumber(raw: string) {
  const value = raw.replaceAll("_", "").replace(/^\+/, "");
  if (!isSafeNumber(value)) throw new StructuredError("precision_loss");
}
function read(input: string, format: StructuredFormat): unknown {
  if (format === "json") {
    let missingSource = false;
    const value = JSON.parse(
      input,
      (_key, value, context?: { source: string }) => {
        if (typeof value !== "number") return value;
        if (!context?.source) {
          missingSource = true;
          return value;
        }
        if (context.source === "-0") return -0;
        if (/^-?\d+$/.test(context.source)) return BigInt(context.source);
        safeNumber(context.source);
        return value;
      },
    );
    if (!missingSource) return value;
    // Older engines still validate JSON natively, then use the standard YAML
    // JSON-schema AST to retain numeric tokens without rounding.
  }
  if (format === "toml") {
    const ast = parseTOML(input, { tomlVersion: "1.1.0" });
    const dates: { start: number; end: number; text: string }[] = [];
    let depth = 0;
    traverseNodes(ast, {
      enterNode(node) {
        if (++depth > 128) throw new StructuredError("too_deep");
        if (node.type !== "TOMLValue") return;
        if (node.kind === "float" && !/^[+-]?(?:inf|nan)$/i.test(node.number))
          safeNumber(node.number);
        if ("datetime" in node)
          dates.push({
            start: node.range[0],
            end: node.range[1],
            text: JSON.stringify(
              node.datetime.replace(" ", "T").replace(/z$/, "Z"),
            ),
          });
      },
      leaveNode() {
        depth--;
      },
    });
    // Both TOML destinations represent dates as text. Rewrite only validated AST
    // date tokens, preserving arbitrary fractional precision and the UTC offset.
    const chunks: string[] = [];
    let cursor = 0;
    for (const date of dates.sort((a, b) => a.start - b.start)) {
      chunks.push(input.slice(cursor, date.start), date.text);
      cursor = date.end;
    }
    chunks.push(input.slice(cursor));
    return parseToml(chunks.join(""), {
      integersAsBigInt: true,
      maxDepth: 128,
    });
  }
  const lineCounter = new LineCounter();
  // Native validation has already accepted JSON whitespace; YAML indentation differs.
  const doc = parseDocument(format === "json" ? input.trim() : input, {
    lineCounter,
    schema: format === "json" ? "json" : "core",
    intAsBigInt: true,
    keepSourceTokens: true,
    prettyErrors: false,
    logLevel: "silent",
    stringKeys: true,
    uniqueKeys: format !== "json",
    customTags: format === "json" ? [] : ["timestamp", "binary", "merge"],
  });
  if (doc.errors.length || doc.warnings.length) {
    const error = doc.errors[0] ?? doc.warnings[0];
    const position = error.linePos?.[0] ?? lineCounter.linePos(error.pos[0]);
    throw new StructuredError("invalid_input", position?.line, position?.col);
  }
  visit(doc, (_key, node, path) => {
    if (format === "json") keepLastJsonKeys(node);
    if (path.length > 128) throw new StructuredError("too_deep");
    if (!isScalar(node)) return;
    if (node.source === "-0") node.value = -0;
    if (
      typeof node.value === "number" &&
      node.source &&
      !/^[+-]?\.(?:inf|nan)$/i.test(node.source)
    )
      safeNumber(node.source);
    if (node.value instanceof Date && node.source) {
      const raw = node.source;
      if (/\.\d{3}\d*[1-9]/.test(raw))
        throw new StructuredError("precision_loss");
      const clock = /(?:[Tt]|[ \t]+)(\d{1,2}):(\d{1,2}):(\d{1,2})(\.\d+)?/.exec(
        raw,
      );
      if (
        clock &&
        (Number(clock[1]) > 23 ||
          Number(clock[2]) > 59 ||
          Number(clock[3]) > 59)
      )
        throw new StructuredError("invalid_input");
      const offset = /[+-](\d{1,2})(?::(\d{2}))?$/.exec(raw);
      if (clock && offset && (Number(offset[1]) > 23 || Number(offset[2]) > 59))
        throw new StructuredError("invalid_input");
      // The timestamp resolver only creates Dates from a yyyy-m-d prefix;
      // malformed explicit tags are rejected with doc.errors above.
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      const [, y, m, d] = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw)!;
      const date = new Date(0);
      date.setUTCFullYear(Number(y), Number(m) - 1, Number(d));
      if (
        date.getUTCMonth() !== Number(m) - 1 ||
        date.getUTCDate() !== Number(d)
      )
        throw new StructuredError("invalid_input");
      // Construct from validated fields: the dependency shifts early years
      // by 1900 and misinterprets offsets below thirty minutes as hours.
      if (clock) {
        date.setUTCHours(
          Number(clock[1]),
          Number(clock[2]),
          Number(clock[3]),
          Math.round(Number(clock[4] ?? 0) * 1000),
        );
        if (offset) {
          const minutes = Number(offset[1]) * 60 + Number(offset[2] ?? 0);
          date.setTime(
            date.getTime() - (offset[0][0] === "+" ? 1 : -1) * minutes * 60_000,
          );
        }
      }
      node.value = date;
    }
  });
  try {
    return doc.toJS({ maxAliasCount: 100 });
  } catch {
    throw new StructuredError("alias_expansion");
  }
}
function normalize(value: unknown, target: StructuredFormat) {
  let count = 0,
    strings = 0;
  const active = new Set<object>();
  function walk(v: unknown, depth: number): unknown {
    if (depth > 128) throw new StructuredError("too_deep");
    if (++count > 1_000_000) throw new StructuredError("too_large");
    if (v === null) {
      if (target === "toml") throw new StructuredError("unsupported_value");
      return null;
    }
    if (typeof v === "string") {
      strings += v.length;
      if (strings > MAX_STRUCTURED_OUTPUT)
        throw new StructuredError("too_large");
      return v;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v) && target === "json")
        throw new StructuredError("unsupported_value");
      return v;
    }
    if (typeof v === "bigint") {
      if (target === "toml" && (v < -(1n << 63n) || v >= 1n << 63n))
        throw new StructuredError("unsupported_value");
      return v;
    }
    if (typeof v === "boolean") return v;
    if (v instanceof Date) {
      // read() constructs dates from validated four-digit calendar/clock fields.
      // JSON cannot create Date values, and TOML dates are preserved as strings.
      return target === "toml" ? v : v.toISOString();
    }
    if (
      !v ||
      typeof v !== "object" ||
      v instanceof Uint8Array ||
      v instanceof Set ||
      v instanceof Map
    )
      throw new StructuredError("unsupported_value");
    if (active.has(v)) throw new StructuredError("alias_expansion");
    active.add(v);
    try {
      if (Array.isArray(v)) return v.map((item) => walk(item, depth + 1));
      const result: Record<string, unknown> = Object.create(null);
      for (const [key, item] of Object.entries(v))
        result[key] = walk(item, depth + 1);
      return result;
    } finally {
      active.delete(v);
    }
  }
  return walk(value, 0);
}
export function convertStructured(job: StructuredJob) {
  if (
    !FORMATS.includes(job.from) ||
    !FORMATS.includes(job.to) ||
    job.from === job.to
  )
    throw new StructuredError("invalid_input");
  if (
    job.input.length > MAX_STRUCTURED_INPUT ||
    new TextEncoder().encode(job.input).length > MAX_STRUCTURED_INPUT
  )
    throw new StructuredError("too_large");
  if (/[\uD800-\uDFFF]/u.test(job.input))
    throw new StructuredError("invalid_input");
  if (!job.input.trim()) return { output: "", bytes: 0 };
  try {
    const value = normalize(read(job.input, job.from), job.to);
    if (
      job.to === "toml" &&
      (!value || typeof value !== "object" || Array.isArray(value))
    )
      throw new StructuredError("unsupported_value");
    // normalize rejects undefined and unsupported runtime values. Each serializer
    // therefore returns a string (YAML only returns undefined for undefined input).
    const output =
      job.to === "json"
        ? stringifyExactJson(value)
        : job.to === "toml"
          ? stringifyToml(value as Parameters<typeof stringifyToml>[0], {
              numbersAsFloat: true,
            })
          : stringifyYaml(value, {
              lineWidth: 120,
              aliasDuplicateObjects: false,
            });
    const bytes = new TextEncoder().encode(output).length;
    if (bytes > MAX_STRUCTURED_OUTPUT) throw new StructuredError("too_large");
    return { output, bytes };
  } catch (error) {
    if (error instanceof StructuredError) throw error;
    // Native JSON and the fixed TOML/YAML parsers throw Error subclasses.
    // Callers supply text only, with no custom parser or serialization hooks.
    const e = error as Error & {
      line?: number;
      lineNumber?: number;
      column?: number;
    };
    const position = /position (\d+)/i.exec(e.message);
    let line = e.lineNumber ?? e.line,
      column = e.column;
    if (position) {
      const before = job.input.slice(0, Number(position[1]));
      line = before.split("\n").length;
      column = before.length - before.lastIndexOf("\n");
    }
    throw new StructuredError("invalid_input", line, column);
  }
}
