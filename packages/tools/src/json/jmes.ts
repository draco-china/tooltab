import {
  compile,
  TreeInterpreter,
  tokenize,
} from "@jmespath-community/jmespath";
import { stringify } from "lossless-json";
import { QueryError } from "./value";
import { parseNumber, parseQueryJson, queryArithmetic } from "./value";

type Ast = { type: string; [key: string]: unknown };
type Interpreter = {
  visit(node: Ast, value: unknown): unknown;
  runtime: {
    getTypeName(value: unknown): unknown;
    callFunction(name: string, args: unknown[]): unknown;
  };
};
const prototype = Object.getPrototypeOf(TreeInterpreter) as Interpreter;
const original = prototype.visit;
const runtimePrototype = Object.getPrototypeOf(
  TreeInterpreter.runtime,
) as Interpreter["runtime"];
const originalType = runtimePrototype.getTypeName;
runtimePrototype.getTypeName = function (value) {
  return typeof value === "bigint" ? 0 : originalType.call(this, value);
};
let visited = 0;
const numeric = (value: unknown): value is number | bigint =>
  typeof value === "number" || typeof value === "bigint";
prototype.visit = function (node, value) {
  if (++visited > 2_000_000) throw new QueryError("too_large");
  if (node.type === "Arithmetic") {
    const operators: Record<string, string> = {
      Plus: "+",
      Minus: "-",
      Multiply: "*",
      Star: "*",
      Divide: "/",
      Modulo: "%",
      Div: "/",
    };
    const a = this.visit(node.left as Ast, value),
      b = this.visit(node.right as Ast, value);
    if (
      node.operator === "Div" &&
      typeof a === "bigint" &&
      typeof b === "bigint"
    ) {
      if (b === 0n) throw new QueryError("invalid_query");
      const q = a / b;
      return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
    }
    const result = queryArithmetic(operators[String(node.operator)], a, b);
    return node.operator === "Div" && typeof result === "number"
      ? Math.floor(result)
      : result;
  }
  if (node.type === "Unary") {
    const n = this.visit(node.operand as Ast, value);
    if (!numeric(n)) throw new QueryError("invalid_query");
    return node.operator === "Minus" ? -n : n;
  }
  if (node.type === "Field") {
    const key = String(node.name);
    return value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.hasOwn(value, key)
      ? ((value as Record<string, unknown>)[key] ?? null)
      : null;
  }
  if (node.type === "MultiSelectHash") {
    const result = Object.create(null);
    for (const child of node.children as Ast[])
      result[String(child.name)] = this.visit(child.value as Ast, value);
    return result;
  }
  if (node.type === "Comparator") {
    const a = this.visit(node.left as Ast, value),
      b = this.visit(node.right as Ast, value);
    if (typeof a === "bigint" || typeof b === "bigint") {
      if (!numeric(a) || !numeric(b))
        return node.name === "NE" ? true : node.name === "EQ" ? false : null;
      switch (node.name) {
        case "EQ":
          return (
            a === b ||
            (typeof a === "number" &&
              Number.isSafeInteger(a) &&
              BigInt(a) === b) ||
            (typeof b === "number" &&
              Number.isSafeInteger(b) &&
              a === BigInt(b))
          );
        case "NE":
          return !(
            a === b ||
            (typeof a === "number" &&
              Number.isSafeInteger(a) &&
              BigInt(a) === b) ||
            (typeof b === "number" &&
              Number.isSafeInteger(b) &&
              a === BigInt(b))
          );
        case "GT":
          return a > b;
        case "GTE":
          return a >= b;
        case "LT":
          return a < b;
        case "LTE":
          return a <= b;
      }
    }
  }
  if (node.type === "Function") {
    const name = String(node.name),
      args = (node.children as Ast[]).map((n) => this.visit(n, value));
    if (
      ["pad_left", "pad_right"].includes(name) &&
      (typeof args[1] !== "number" || args[1] > 16 * 1024 * 1024)
    )
      throw new QueryError("too_large");
    if (
      name === "join" &&
      typeof args[0] === "string" &&
      Array.isArray(args[1])
    ) {
      const strings = args[1];
      if (
        strings.every((v) => typeof v === "string") &&
        strings.reduce(
          (n, v) => n + v.length,
          Math.max(0, strings.length - 1) * args[0].length,
        ) >
          16 * 1024 * 1024
      )
        throw new QueryError("too_large");
    }
    if (
      name === "replace" &&
      typeof args[0] === "string" &&
      typeof args[1] === "string" &&
      typeof args[2] === "string"
    ) {
      const [source, needle, replacement, count] = args;
      if (
        count !== undefined &&
        (typeof count !== "number" || count > 1_000_000)
      )
        throw new QueryError("too_large");
      const maximum =
        typeof count === "number"
          ? count
          : needle.length
            ? Math.floor(source.length / needle.length)
            : source.length + 1;
      if (
        source.length +
          maximum * Math.max(0, replacement.length - needle.length) >
        16 * 1024 * 1024
      )
        throw new QueryError("too_large");
    }
    if (name === "group_by" && args.length === 2 && Array.isArray(args[0])) {
      const result = Object.create(null);
      for (const item of args[0]) {
        const key = this.visit(args[1] as Ast, item);
        if (typeof key !== "string") throw new QueryError("invalid_query");
        result[key] ??= [];
        result[key].push(item);
      }
      return result;
    }
    if (
      ["sort_by", "min_by", "max_by"].includes(name) &&
      args.length === 2 &&
      Array.isArray(args[0])
    ) {
      const decorated = args[0].map((item) => ({
        item,
        key: this.visit(args[1] as Ast, item),
      }));
      if (decorated.some((v) => typeof v.key === "bigint")) {
        if (!decorated.every((v) => numeric(v.key)))
          throw new QueryError("invalid_query");
        decorated.sort((a, b) =>
          (a.key as number) < (b.key as number)
            ? -1
            : (a.key as number) > (b.key as number)
              ? 1
              : 0,
        );
        return name === "sort_by"
          ? decorated.map((v) => v.item)
          : name === "min_by"
            ? (decorated[0]?.item ?? null)
            : (decorated.at(-1)?.item ?? null);
      }
    }
    if (name === "merge") {
      if (
        !args.length ||
        args.some((a) => !a || typeof a !== "object" || Array.isArray(a))
      )
        throw new QueryError("invalid_query");
      return Object.assign(Object.create(null), ...args);
    }
    if (name === "to_string" && args.length === 1)
      return typeof args[0] === "string" ? args[0] : stringify(args[0]);
    if (name === "to_number" && args.length === 1) {
      const v = args[0];
      if (numeric(v)) return v;
      if (typeof v !== "string" || !v.trim()) return null;
      try {
        return parseNumber(v.trim());
      } catch (e) {
        if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v.trim()))
          throw e;
        return null;
      }
    }
    if (
      ["abs", "ceil", "floor"].includes(name) &&
      args.length === 1 &&
      typeof args[0] === "bigint"
    )
      return name === "abs" && args[0] < 0n ? -args[0] : args[0];
    if (
      ["sum", "avg", "min", "max", "sort"].includes(name) &&
      args.length === 1 &&
      Array.isArray(args[0]) &&
      args[0].every(numeric)
    ) {
      const array = args[0];
      if (array.length === 0)
        return name === "sort" ? [] : name === "sum" ? 0 : null;
      if (name === "sort")
        return [...array].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      if (name === "min" || name === "max")
        return array.reduce((a, b) =>
          name === "min" ? (a < b ? a : b) : a > b ? a : b,
        );
      const sum = array.reduce<unknown>(
        (a, b) => queryArithmetic("+", a, b),
        0n,
      );
      return name === "sum" ? sum : queryArithmetic("/", sum, array.length);
    }
    return this.runtime.callFunction(name, args);
  }
  return original.call(this, node, value);
};
export function evaluateJmes(data: unknown, expression: string): unknown {
  const tokens = tokenize(expression);
  const replacements: { start: number; end: number; value: unknown }[] = [];
  for (const token of tokens) {
    if (token.type !== "Literal") continue;
    const delimiter = expression[token.start];
    // The pinned lexer creates Literal tokens only for backtick and raw-string quotes.
    let end = token.start + 1;
    for (; end < expression.length; end++) {
      if (expression[end] === "\\") {
        end++;
        continue;
      }
      if (expression[end] === delimiter) break;
    }
    if (end >= expression.length) throw new QueryError("invalid_query");
    let value: unknown = token.value;
    if (delimiter === "`") {
      const raw = expression.slice(token.start + 1, end).replaceAll("\\`", "`");
      value = parseQueryJson(raw);
    }
    replacements.push({ start: token.start, end: end + 1, value });
  }
  const values = new Map<string, unknown>(),
    chunks: string[] = [];
  let cursor = 0;
  for (const [i, r] of replacements.entries()) {
    const marker = `__tooltab_literal_${i}`;
    values.set(marker, r.value);
    chunks.push(
      expression.slice(cursor, r.start),
      `\`${JSON.stringify(marker)}\``,
    );
    cursor = r.end;
  }
  chunks.push(expression.slice(cursor));
  const ast = compile(chunks.join("")) as unknown as Ast;
  function restore(node: unknown, depth: number) {
    if (depth > 128) throw new QueryError("too_deep");
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) restore(item, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.type === "Literal") {
      // Every literal passed to compile is one of our unique string markers.
      // Numeric precision was already checked by parseQueryJson before replacement.
      record.value = values.get(record.value as string);
      return;
    }
    for (const v of Object.values(record)) restore(v, depth + 1);
  }
  restore(ast, 0);
  visited = 0;
  return TreeInterpreter.search(
    ast as Parameters<typeof TreeInterpreter.search>[0],
    data as Parameters<typeof TreeInterpreter.search>[1],
  );
}
