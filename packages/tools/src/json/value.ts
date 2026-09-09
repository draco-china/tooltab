import { isSafeNumber, LosslessNumber, stringify } from "lossless-json";
import {
  isCollection,
  isMap,
  isScalar,
  parseDocument,
  type Scalar,
  visit,
} from "yaml";
export class QueryError extends Error {
  constructor(
    public readonly code:
      | "invalid_json"
      | "invalid_query"
      | "precision_loss"
      | "too_large"
      | "too_deep"
      | "unsupported"
      | "timeout"
      | "busy"
      | "read_failed",
  ) {
    super(code);
  }
}

export const MAX_QUERY_INPUT = 32 * 1024 * 1024,
  MAX_QUERY_OUTPUT = 128 * 1024 * 1024;

export type QueryJob = {
  kind: "jsonpath" | "jmespath";
  input: string;
  query: string;
};

export type QueryResult = {
  kind: QueryJob["kind"];
  output: string;
  paths: string | null;
  count: number;
  bytes: number;
};
export function parseNumber(raw: string): number | bigint {
  if (raw === "-0") return -0;
  const number = Number(raw);
  if (
    isSafeNumber(raw) &&
    (!Number.isInteger(number) || Number.isSafeInteger(number))
  )
    return number;
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!match) throw new QueryError("precision_loss");
  const fraction = match[3] ?? "",
    shift = Number(match[4] ?? 0) - fraction.length;
  let digits = match[2] + fraction;
  if (!Number.isSafeInteger(shift) || Math.abs(shift) > MAX_QUERY_INPUT)
    throw new QueryError("too_large");
  if (shift < 0) {
    const cut = -shift;
    if (cut > digits.length || !/^[0]*$/.test(digits.slice(-cut)))
      throw new QueryError("precision_loss");
    digits = digits.slice(0, -cut);
  } else {
    if (digits.length + shift > MAX_QUERY_INPUT)
      throw new QueryError("too_large");
    digits += "0".repeat(shift);
  }
  return BigInt(match[1] + digits);
}
export function parseQueryJson(input: string): unknown {
  if (
    input.length > MAX_QUERY_INPUT ||
    new TextEncoder().encode(input).length > MAX_QUERY_INPUT
  )
    throw new QueryError("too_large");
  let missing = false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input, (_key, value, context?: { source: string }) => {
      if (typeof value !== "number") return value;
      if (!context) {
        missing = true;
        return value;
      }
      return parseNumber(context.source);
    });
  } catch (e) {
    if (e instanceof QueryError) throw e;
    throw new QueryError("invalid_json");
  }
  if (missing) {
    const doc = parseDocument(input, {
      schema: "json",
      intAsBigInt: true,
      uniqueKeys: false,
    });
    // Native JSON.parse already validated the syntax before number recovery.
    visit(doc, (_key, node, path) => {
      // JSON.parse already validated string keys. Keep their first insertion order,
      // but visit only the last value, exactly as its reviver does.
      if (isMap(node)) {
        const first = new Map<string, (typeof node.items)[number]>();
        node.items = node.items.filter((pair) => {
          const key = (pair.key as Scalar<string>).value;
          const previous = first.get(key);
          if (previous) {
            previous.value = pair.value;
            return false;
          }
          first.set(key, pair);
          return true;
        });
      }

      if (path.filter(isCollection).length > 128)
        throw new QueryError("too_deep");
      if (
        isScalar(node) &&
        (typeof node.value === "number" || typeof node.value === "bigint")
      )
        // Parsed numeric scalars always retain their source text.
        // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
        node.value = parseNumber(node.source!);
    });
    parsed = doc.toJS({ maxAliasCount: 0 });
  }
  let count = 0;
  function clean(value: unknown, depth: number): unknown {
    if (depth > 128) throw new QueryError("too_deep");
    if (++count > 1000000) throw new QueryError("too_large");
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value))
      return Object.freeze(value.map((v) => clean(v, depth + 1)));
    const result = Object.create(null);
    for (const [key, v] of Object.entries(value))
      result[key] = clean(v, depth + 1);
    return Object.freeze(result);
  }
  return clean(parsed, 0);
}
export function formatQueryValue(value: unknown) {
  let size = 0,
    nodes = 0;
  const encoder = new TextEncoder();
  const charge = (length: number) => {
    size += length;
    if (size > MAX_QUERY_OUTPUT) throw new QueryError("too_large");
  };
  function measure(item: unknown, depth: number) {
    if (++nodes > 2_000_000) throw new QueryError("too_large");
    if (depth > 128) throw new QueryError("too_deep");
    if (item !== null && typeof item === "object") {
      const entries = Array.isArray(item)
        ? item.map((v) => [null, v] as const)
        : Object.entries(item);
      charge(2);
      if (entries.length) charge(1 + depth * 2);
      for (const [key, v] of entries) {
        charge(1 + (depth + 1) * 2);
        if (key !== null)
          charge(encoder.encode(JSON.stringify(key)).length + 2);
        measure(v, depth + 1);
      }
      if (entries.length > 1) charge(entries.length - 1);
      return;
    }
    if (
      typeof item === "number" &&
      (!Number.isFinite(item) ||
        (Number.isInteger(item) && !Number.isSafeInteger(item)))
    )
      throw new QueryError("precision_loss");
    if (
      !["string", "number", "boolean", "bigint"].includes(typeof item) &&
      item !== null
    )
      throw new QueryError("invalid_query");
    charge(
      typeof item === "bigint"
        ? item.toString().length
        : encoder.encode(JSON.stringify(item)).length,
    );
  }
  measure(value ?? null, 0);
  const output = stringify(
    value ?? null,
    (_key, v) => {
      if (
        typeof v === "number" &&
        (!Number.isFinite(v) ||
          (Number.isInteger(v) && !Number.isSafeInteger(v)))
      )
        throw new QueryError("precision_loss");
      if (
        typeof v === "function" ||
        typeof v === "symbol" ||
        typeof v === "undefined"
      )
        throw new QueryError("invalid_query");
      return typeof v === "number" && Object.is(v, -0)
        ? new LosslessNumber("-0")
        : v;
    },
    2,
  );
  // The root is non-nullish and the replacer rejects non-JSON values.
  const bytes = new TextEncoder().encode(output).length;
  if (bytes > MAX_QUERY_OUTPUT) throw new QueryError("too_large");
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  return { output: output!, bytes };
}
export function queryArithmetic(op: string, a: unknown, b: unknown): unknown {
  if (op === "+" && (typeof a === "string" || typeof b === "string")) {
    if (
      !["string", "number", "bigint", "boolean"].includes(typeof a) ||
      !["string", "number", "bigint", "boolean"].includes(typeof b)
    )
      throw new QueryError("invalid_query");
    const left = String(a),
      right = String(b);
    if (left.length + right.length > 16 * 1024 * 1024)
      throw new QueryError("too_large");
    return left + right;
  }
  if (
    !["number", "bigint"].includes(typeof a) ||
    !["number", "bigint"].includes(typeof b)
  )
    throw new QueryError("invalid_query");
  if (typeof a === "bigint" || typeof b === "bigint") {
    if (
      (typeof a === "number" && !Number.isSafeInteger(a)) ||
      (typeof b === "number" && !Number.isSafeInteger(b))
    )
      throw new QueryError("precision_loss");
    const x = BigInt(a as number),
      y = BigInt(b as number),
      size = x.toString().length + y.toString().length;
    if (
      size > 65536 ||
      (["**", "<<", ">>"].includes(op) && (y < 0n || y > 1024n)) ||
      (op === "**" && x.toString().length * Number(y) > 65536)
    )
      throw new QueryError("too_large");
    switch (op) {
      case "+":
        return x + y;
      case "-":
        return x - y;
      case "*":
        return x * y;
      case "/":
        if (!y || x % y) throw new QueryError("precision_loss");
        return x / y;
      case "%":
        return x % y;
      case "**":
        return x ** y;
      case "&":
        return x & y;
      case "|":
        return x | y;
      case "^":
        return x ^ y;
      case "<<":
        return x << y;
      case ">>":
        return x >> y;
      default:
        throw new QueryError("invalid_query");
    }
  }
  const x = a as number,
    y = b as number;
  let result: number;
  switch (op) {
    case "+":
      result = x + y;
      break;
    case "-":
      result = x - y;
      break;
    case "*":
      result = x * y;
      break;
    case "/":
      result = x / y;
      break;
    case "%":
      result = x % y;
      break;
    case "**":
      if (Math.abs(y) > 1024) throw new QueryError("too_large");
      result = x ** y;
      break;
    case "&":
      return x & y;
    case "|":
      return x | y;
    case "^":
      return x ^ y;
    case "<<":
      return x << y;
    case ">>":
      return x >> y;
    case ">>>":
      return x >>> y;
    default:
      throw new QueryError("invalid_query");
  }
  if (Number.isInteger(result) && !Number.isSafeInteger(result))
    throw new QueryError("precision_loss");
  return result;
}
