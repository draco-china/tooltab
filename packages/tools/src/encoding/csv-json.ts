import Papa from "papaparse";
export const MAX_INPUT_BYTES = 32 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
export const MAX_ROWS = 1000000;
export const MAX_CELLS = 4000000;
export type CsvJsonKind = "csv-to-json" | "json-to-csv";
export class CsvJsonError extends Error {
  constructor(
    public code:
      | "invalid_input"
      | "precision_loss"
      | "invalid_options"
      | "too_large"
      | "timeout"
      | "unsupported"
      | "busy"
      | "artifact_required"
      | "read_failed",
    public row?: number,
  ) {
    super(code);
  }
}
export const CSV_DEFAULTS = {
  noHeader: false,
  headersText: "",
  delimiter: ",",
  quoteChar: '"',
  trim: true,
  checkType: false,
  skipEmptyLines: "none" as "none" | "true" | "greedy",
  escapeChar: '"',
  newline: "",
  preview: 0,
  comments: "",
  fastMode: false,
  skipFirstNLines: 0,
  delimitersToGuessText: "",
  includeColumns: "",
  ignoreColumns: "",
  indentSize: 2,
};
export const JSON_DEFAULTS = {
  delimiter: ",",
  quoteChar: '"',
  includeHeaderRow: true,
  escapeFormulae: true,
};
export type CsvOptions = typeof CSV_DEFAULTS;
export type JsonOptions = typeof JSON_DEFAULTS;
export type CsvJsonJob =
  | { kind: "csv-to-json"; input: string; options?: Partial<CsvOptions> }
  | { kind: "json-to-csv"; input: string; options?: Partial<JsonOptions> };
export type CsvJsonResult = {
  output: string;
  rows: number;
  columns: number;
  bytes: number;
  limited: boolean;
  renamedHeaders: Record<string, string>;
};
const encoder = new TextEncoder();
export function decodeWhitespace(value: string) {
  return value
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n");
}
function delimiter(value: string, auto: boolean, quote: string) {
  const d = decodeWhitespace(value);
  if (auto && (!d || d === "auto")) return "";
  if (!d || d.length > 32 || /[\r\n\uFEFF]/.test(d) || d.includes(quote))
    throw new CsvJsonError("invalid_options");
  return d;
}
function quote(value: string) {
  const q = value || '"';
  if (q.length !== 1 || /[\r\n\uFEFF]/.test(q) || /[\uD800-\uDFFF]/.test(q))
    throw new CsvJsonError("invalid_options");
  return q;
}
function boundedOutput() {
  const chunks: string[] = [];
  let bytes = 0;
  return {
    add(text: string) {
      bytes += encoder.encode(text).length;
      if (bytes > MAX_OUTPUT_BYTES) throw new CsvJsonError("too_large");
      chunks.push(text);
    },
    finish() {
      return { output: chunks.join(""), bytes };
    },
  };
}
function inputCheck(input: string) {
  if (
    typeof input !== "string" ||
    input.length > MAX_INPUT_BYTES ||
    encoder.encode(input).length > MAX_INPUT_BYTES
  )
    throw new CsvJsonError("too_large");
  if (
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
      input,
    )
  )
    throw new CsvJsonError("invalid_input");
}
export function convertCsvJson(job: CsvJsonJob): CsvJsonResult {
  inputCheck(job.input);
  return job.kind === "csv-to-json"
    ? fromCsv(job.input, job.options)
    : fromJson(job.input, job.options);
}
function fromCsv(input: string, options?: Partial<CsvOptions>): CsvJsonResult {
  const o = { ...CSV_DEFAULTS, ...options };
  for (const key of ["noHeader", "trim", "checkType", "fastMode"] as const)
    if (typeof o[key] !== "boolean") throw new CsvJsonError("invalid_options");
  for (const key of [
    "headersText",
    "delimiter",
    "quoteChar",
    "escapeChar",
    "newline",
    "comments",
    "delimitersToGuessText",
    "includeColumns",
    "ignoreColumns",
  ] as const)
    if (typeof o[key] !== "string" || o[key].length > 8192)
      throw new CsvJsonError("invalid_options");
  if (
    !["none", "true", "greedy"].includes(o.skipEmptyLines) ||
    !Number.isInteger(o.indentSize) ||
    o.indentSize < 0 ||
    o.indentSize > 8 ||
    !Number.isInteger(o.preview) ||
    o.preview < 0 ||
    o.preview > MAX_ROWS ||
    !Number.isInteger(o.skipFirstNLines) ||
    o.skipFirstNLines < 0 ||
    o.skipFirstNLines > MAX_ROWS
  )
    throw new CsvJsonError("invalid_options");
  const q = quote(o.quoteChar),
    e = quote(o.escapeChar),
    d = delimiter(o.delimiter, true, q);
  const nl = decodeWhitespace(o.newline);
  if (
    !["", "auto", "\n", "\r", "\r\n"].includes(nl) ||
    (o.comments === d && d) ||
    o.comments.includes(q) ||
    /[\r\n]/.test(o.comments)
  )
    throw new CsvJsonError("invalid_options");
  let include: RegExp | undefined, ignore: RegExp | undefined;
  try {
    include = o.includeColumns ? new RegExp(o.includeColumns) : undefined;
    ignore = o.ignoreColumns ? new RegExp(o.ignoreColumns) : undefined;
  } catch {
    throw new CsvJsonError("invalid_options");
  }
  let custom: string[] | undefined;
  if (o.noHeader && o.headersText) {
    custom = o.headersText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!custom.length || !d || custom.length > 1000)
      throw new CsvJsonError("invalid_options");
    input =
      Papa.unparse([custom], { delimiter: d, quoteChar: q, escapeChar: e }) +
      (nl && nl !== "auto" ? nl : "\n") +
      input;
  }
  const header = !o.noHeader || !!custom;
  let protoMarker = "__TOOLTAB_PROTO__";
  while (input.includes(protoMarker)) protoMarker += "_";
  const restoreHeader = (key: string) =>
    key.startsWith(protoMarker)
      ? `__proto__${key.slice(protoMarker.length)}`
      : key;
  const guesses = o.delimitersToGuessText
    ? [
        ...new Set(
          o.delimitersToGuessText
            .split(",")
            .map((v, i) => (!v && i === 0 ? "," : decodeWhitespace(v.trim())))
            .filter(Boolean),
        ),
      ].map((v) => delimiter(v, false, q))
    : undefined;
  const out = boundedOutput();
  const pad = " ".repeat(o.indentSize);
  let rows = 0,
    columns = 0,
    cells = 0;
  let renamedHeaders: Record<string, string> = {};
  out.add("[");
  if (input.trim())
    Papa.parse<Record<string, unknown> | unknown[]>(input, {
      delimiter: d,
      newline: !nl || nl === "auto" ? undefined : (nl as "\r" | "\n" | "\r\n"),
      quoteChar: q,
      escapeChar: e,
      header,
      transformHeader: (s) => {
        const name = o.trim ? s.trim() : s;
        return name === "__proto__" ? protoMarker : name;
      },
      transform: (s) => {
        const value = o.trim ? s.trim() : s;
        const numeric = value.trim();
        if (
          o.checkType &&
          /^-?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?$/.test(numeric)
        ) {
          const n = Number(numeric);
          if (Math.abs(n) < 2 ** 53) {
            const normalized = numeric
              .replace(/^\+/, "")
              .replace(/^(-?)\./, "$10.")
              .replace(/\.(?=[eE]|$)/, ".0");
            if (decimalValue(normalized) !== decimalValue(String(n)))
              throw new CsvJsonError("precision_loss");
          }
        }
        return value;
      },
      dynamicTyping: o.checkType,
      skipEmptyLines:
        o.skipEmptyLines === "none"
          ? false
          : o.skipEmptyLines === "true"
            ? true
            : "greedy",
      preview: o.preview,
      comments: o.comments || false,
      fastMode: o.fastMode,
      skipFirstNLines: o.skipFirstNLines,
      delimitersToGuess: guesses,
      step(result) {
        if (result.errors.length)
          throw new CsvJsonError(
            "invalid_input",
            // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
            (result.errors[0]!.row ?? rows) + 1,
          );
        const row = header
          ? Object.fromEntries(
              Object.entries(result.data).map(([key, value]) => [
                restoreHeader(key),
                value,
              ]),
            )
          : result.data;
        const keys = Object.keys(row);
        columns = Math.max(columns, keys.length);
        cells += keys.length;
        if (columns > 1000 || ++rows > MAX_ROWS || cells > MAX_CELLS)
          throw new CsvJsonError("too_large");
        renamedHeaders = result.meta.renamedHeaders
          ? Object.fromEntries(
              Object.entries(result.meta.renamedHeaders).map(([key, value]) => [
                restoreHeader(key),
                restoreHeader(value),
              ]),
            )
          : renamedHeaders;
        const filtered =
          header && (include || ignore)
            ? Object.fromEntries(
                keys
                  .filter(
                    (k) => (!include || include.test(k)) && !ignore?.test(k),
                  )
                  .map((k) => [k, (row as Record<string, unknown>)[k]]),
              )
            : row;
        const text = JSON.stringify(filtered, null, o.indentSize);
        out.add(
          (rows > 1 ? "," : "") +
            (pad ? `\n${pad}${text.replace(/\n/g, `\n${pad}`)}` : text),
        );
      },
    });
  out.add(rows && pad ? "\n]" : "]");
  return {
    ...out.finish(),
    rows,
    columns,
    limited: o.preview > 0 && rows >= o.preview,
    renamedHeaders,
  };
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function fromJson(
  input: string,
  options?: Partial<JsonOptions>,
): CsvJsonResult {
  const o = { ...JSON_DEFAULTS, ...options };
  if (
    typeof o.quoteChar !== "string" ||
    typeof o.delimiter !== "string" ||
    typeof o.includeHeaderRow !== "boolean" ||
    typeof o.escapeFormulae !== "boolean"
  )
    throw new CsvJsonError("invalid_options");
  const q = quote(o.quoteChar),
    d = delimiter(o.delimiter, false, q);
  let value: unknown;
  try {
    validateJsonNumbers(input);
    value = JSON.parse(input.replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error instanceof CsvJsonError) throw error;
    throw new CsvJsonError("invalid_input");
  }
  let data: unknown[], fields: string[] | undefined;
  if (Array.isArray(value)) data = value;
  else if (
    isRecord(value) &&
    Array.isArray(value.data) &&
    Array.isArray(value.fields) &&
    value.fields.every((v) => typeof v === "string")
  ) {
    data = value.data;
    fields = value.fields;
  } else throw new CsvJsonError("invalid_input");
  if (data.length > MAX_ROWS || (fields && fields.length > 1000))
    throw new CsvJsonError("too_large");
  if (data.length && !Array.isArray(data[0]) && !isRecord(data[0]))
    throw new CsvJsonError("invalid_input");
  const objectRows = data.length > 0 && isRecord(data[0]);
  if (!fields && objectRows)
    fields = Object.keys(data[0] as Record<string, unknown>);
  let cells = 0,
    columns = fields?.length ?? 0;
  const out = boundedOutput();
  let wrote = false;
  const config = {
    delimiter: d,
    quoteChar: q,
    escapeChar: q,
    header: false,
    escapeFormulae: o.escapeFormulae,
  };
  function write(row: unknown[]) {
    const s = Papa.unparse([row], config);
    out.add((wrote ? "\r\n" : "") + s);
    wrote = true;
  }
  if (fields && o.includeHeaderRow) write(fields);
  for (const row of data) {
    if (objectRows ? !isRecord(row) : !Array.isArray(row))
      throw new CsvJsonError("invalid_input");
    const values = fields
      ? fields.map((key, i) =>
          objectRows
            ? Object.hasOwn(row as object, key)
              ? (row as Record<string, unknown>)[key]
              : undefined
            : (row as unknown[])[i],
        )
      : (row as unknown[]);
    columns = Math.max(columns, values.length);
    cells += values.length;
    if (columns > 1000 || cells > MAX_CELLS)
      throw new CsvJsonError("too_large");
    write(values);
  }
  return {
    ...out.finish(),
    rows: data.length,
    columns,
    limited: false,
    renamedHeaders: {},
  };
}

/** Compare decimal values without losing the input token to IEEE-754 rounding. */
function decimalValue(token: string) {
  // All callers pre-validate numeric tokens: the CSV transform regex and the
  // JSON number scanner both reject anything this grammar cannot parse.
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token)!;
  const rawExponent = match[4] ?? "0";
  if (rawExponent.length > 8) throw new CsvJsonError("precision_loss");
  let digits = (match[2] + (match[3] ?? "")).replace(/^0+/, "");
  if (!digits) return "0";
  let exponent = BigInt(rawExponent) - BigInt((match[3] ?? "").length);
  const zeros = /0+$/.exec(digits)?.[0].length ?? 0;
  if (zeros) {
    digits = digits.slice(0, -zeros);
    exponent += BigInt(zeros);
  }
  return `${match[1]}${digits}e${exponent}`;
}
function validateJsonNumbers(input: string) {
  const tokens = /"(?:[^"\\]|\\[\s\S])*"|[^\s{}[\],:]+|[{}[\],:]/g;
  let depth = 0;
  for (const match of input.matchAll(tokens)) {
    const token = match[0];
    if (token === "{" || token === "[") {
      if (++depth > 256) throw new CsvJsonError("too_large");
    } else if (token === "}" || token === "]") depth--;
    else if (/^-?\d/.test(token)) {
      const value = Number(token);
      if (
        !Number.isFinite(value) ||
        decimalValue(token) !== decimalValue(String(value))
      )
        throw new CsvJsonError("precision_loss");
    }
  }
}
