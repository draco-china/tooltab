import { QueryError } from "./value";

import { JSONPath } from "jsonpath-plus";
import { parseNumber, queryArithmetic } from "./value";

type Ast = { type: string; [key: string]: unknown };
type ParserConstructor = new (code: string) => { ast: Ast };
// Pinned JSONPath Plus10.4.0 exposes its standard JSEP parser through safeVm.
// Its evaluator is deliberately not used: computed subs and method access differ.
const Parser = (
  JSONPath.prototype as unknown as { safeVm: { Script: ParserConstructor } }
).safeVm.Script;
const MAX_STEPS = 2_000_000,
  MAX_STRING = 16 * 1024 * 1024,
  MAX_ITEMS = 1_000_000;
const FORBIDDEN = new Set([
  "constructor",
  "prototype",
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "call",
  "apply",
  "bind",
]);
export function createFilterEvaluator() {
  let steps = 0,
    allocated = 0;
  const cache = new Map<string, Ast>();
  const charge = (value: unknown) => {
    allocated +=
      typeof value === "string"
        ? value.length
        : Array.isArray(value)
          ? value.length * 8
          : 0;
    if (allocated > 128 * 1024 * 1024) throw new QueryError("too_large");
    return value;
  };
  function property(ast: Ast, subs: Record<string, unknown>): string {
    const value = ast.computed
      ? evaluate(ast.property as Ast, subs)
      : (ast.property as Ast).name;
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "bigint"
    )
      throw new QueryError("invalid_query");
    return String(value);
  }
  function member(ast: Ast, subs: Record<string, unknown>) {
    const obj = evaluate(ast.object as Ast, subs),
      key = property(ast, subs);
    if (obj === null || obj === undefined)
      throw new QueryError("invalid_query");
    if (Object.hasOwn(Object(obj), key)) {
      const value = (Object(obj) as Record<string, unknown>)[key];
      if (typeof value === "function") throw new QueryError("invalid_query");
      return value;
    }
    return undefined;
  }
  function call(ast: Ast, subs: Record<string, unknown>): unknown {
    const callee = ast.callee as Ast;
    if (callee.type !== "MemberExpression")
      throw new QueryError("invalid_query");
    const obj = evaluate(callee.object as Ast, subs),
      key = property(callee, subs);
    if (FORBIDDEN.has(key)) throw new QueryError("invalid_query");
    const args = (ast.arguments as Ast[]).map((a) => evaluate(a, subs));
    if (obj instanceof RegExp && (key === "test" || key === "exec")) {
      if (
        args.length !== 1 ||
        typeof args[0] !== "string" ||
        args[0].length > MAX_STRING
      )
        throw new QueryError("invalid_query");
      obj.lastIndex = 0;
      return charge(
        key === "test"
          ? RegExp.prototype.test.call(obj, args[0])
          : RegExp.prototype.exec.call(obj, args[0]),
      );
    }
    if (typeof obj === "string") {
      if (
        obj.length > MAX_STRING ||
        args.some(
          (v) =>
            !(
              typeof v === "string" ||
              typeof v === "number" ||
              v === undefined
            ),
        )
      )
        throw new QueryError("invalid_query");
      const allowed = [
        "includes",
        "startsWith",
        "endsWith",
        "indexOf",
        "lastIndexOf",
        "charAt",
        "charCodeAt",
        "codePointAt",
        "slice",
        "substring",
        "toLowerCase",
        "toUpperCase",
        "trim",
        "trimStart",
        "trimEnd",
        "normalize",
      ];
      if (!allowed.includes(key)) throw new QueryError("invalid_query");
      const fn = (
        String.prototype as unknown as Record<
          string,
          (...args: unknown[]) => unknown
        >
      )[key];
      return charge(Reflect.apply(fn, obj, args));
    }
    if (Array.isArray(obj)) {
      if (
        obj.length > MAX_ITEMS ||
        !["includes", "indexOf", "lastIndexOf", "slice", "at", "join"].includes(
          key,
        )
      )
        throw new QueryError("invalid_query");
      if (key === "join") {
        const separator = args[0] === undefined ? "," : args[0];
        if (
          typeof separator !== "string" ||
          obj.some(
            (v) =>
              v !== null &&
              !["string", "number", "bigint", "boolean", "undefined"].includes(
                typeof v,
              ),
          )
        )
          throw new QueryError("invalid_query");
        const size =
          obj.reduce((n: number, v) => n + String(v ?? "").length, 0) +
          separator.length * Math.max(0, obj.length - 1);
        if (size > MAX_STRING) throw new QueryError("too_large");
      } else if (
        args.some((v) => typeof v === "object" || typeof v === "function")
      )
        throw new QueryError("invalid_query");
      const fn = (
        Array.prototype as unknown as Record<
          string,
          (...args: unknown[]) => unknown
        >
      )[key];
      return charge(Reflect.apply(fn, obj, args));
    }
    throw new QueryError("invalid_query");
  }
  function evaluate(ast: Ast, subs: Record<string, unknown>): unknown {
    if (++steps > MAX_STEPS) throw new QueryError("too_large");
    switch (ast.type) {
      case "Literal": {
        return typeof ast.value === "number"
          ? parseNumber(String(ast.raw))
          : ast.value;
      }
      case "Identifier":
        if (Object.hasOwn(subs, String(ast.name)))
          return subs[String(ast.name)];
        throw new QueryError("invalid_query");
      case "MemberExpression":
        return member(ast, subs);
      case "CallExpression":
        return call(ast, subs);
      case "Compound": {
        let result: unknown;
        for (const node of ast.body as Ast[]) result = evaluate(node, subs);
        return result;
      }
      case "ArrayExpression":
        return charge((ast.elements as Ast[]).map((a) => evaluate(a, subs)));
      case "ConditionalExpression":
        return evaluate(
          (evaluate(ast.test as Ast, subs)
            ? ast.consequent
            : ast.alternate) as Ast,
          subs,
        );
      case "UnaryExpression": {
        const a = evaluate(ast.argument as Ast, subs);
        switch (ast.operator) {
          case "!":
            return !a;
          case "typeof":
            return typeof a;
          case "void":
            return undefined;
          case "+":
            if (typeof a === "bigint") throw new QueryError("precision_loss");
            if (typeof a !== "number") throw new QueryError("invalid_query");
            return a;
          case "-":
            if (typeof a === "bigint") return -a;
            if (typeof a === "number") return -a;
            throw new QueryError("invalid_query");
          default:
            if (ast.operator === "~" && typeof a === "number") return ~a;
            throw new QueryError("invalid_query");
        }
      }
      case "BinaryExpression":
      case "LogicalExpression": {
        const a = evaluate(ast.left as Ast, subs);
        if (ast.operator === "&&") return a && evaluate(ast.right as Ast, subs);
        if (ast.operator === "||") return a || evaluate(ast.right as Ast, subs);
        if (ast.operator === "??") return a ?? evaluate(ast.right as Ast, subs);
        const b = evaluate(ast.right as Ast, subs);
        if (ast.operator === "===") return a === b;
        if (ast.operator === "!==") return a !== b;
        if (ast.operator === "==" || ast.operator === "!=") {
          const primitive = (v: unknown) =>
            v === null || !["object", "function", "symbol"].includes(typeof v);
          let equal = a === b;
          if (primitive(a) && primitive(b)) {
            // biome-ignore lint/suspicious/noDoubleEquals: JSONPath loose equality requires primitive coercion, with object hooks excluded.
            equal = a == b;
          }
          return ast.operator === "==" ? equal : !equal;
        }
        if (
          !["number", "bigint", "string"].includes(typeof a) ||
          !["number", "bigint", "string"].includes(typeof b)
        )
          throw new QueryError("invalid_query");
        // Comparisons follow primitive JSON values; neither side can invoke coercion hooks.
        const x = a as number,
          y = b as number;
        switch (ast.operator) {
          case "<":
            return x < y;
          case "<=":
            return x <= y;
          case ">":
            return x > y;
          case ">=":
            return x >= y;
          default:
            // Arithmetic owns its operator whitelist and rejects unknown operators.
            return charge(queryArithmetic(String(ast.operator), a, b));
        }
      }
      default:
        throw new QueryError("invalid_query");
    }
  }
  return (code: string, context: object) => {
    const subs = context as Record<string, unknown>;
    if (code.length > 65536) throw new QueryError("too_large");
    let ast = cache.get(code);
    if (!ast) {
      ast = new Parser(code).ast;
      cache.set(code, ast);
    }
    return evaluate(ast, subs);
  };
}
