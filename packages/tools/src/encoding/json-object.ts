import { LosslessNumber } from "lossless-json";
import { isMap, type Scalar } from "yaml";

/** Native JSON has string keys: preserve first position and last value before visiting children. */
export function keepLastJsonKeys(node: unknown): void {
  if (!isMap(node)) return;
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

/** Serialize normalized JSON data without interpreting user keys as library metadata. */
export function stringifyExactJson(value: unknown, indentSize = 2): string {
  function write(value: unknown, depth: number): string {
    if (typeof value === "bigint" || value instanceof LosslessNumber)
      return value.toString();
    if (typeof value === "number" && Object.is(value, -0)) return "-0";
    if (value === null || typeof value !== "object")
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      return JSON.stringify(value)!;
    const array = Array.isArray(value);
    const entries = array
      ? value.map((item) => write(item, depth + 1))
      : Object.entries(value).map(
          ([key, item]) =>
            `${JSON.stringify(key)}:${indentSize ? " " : ""}${write(item, depth + 1)}`,
        );
    const open = array ? "[" : "{",
      close = array ? "]" : "}";
    if (!entries.length) return open + close;
    if (!indentSize) return open + entries.join(",") + close;
    const indent = " ".repeat(indentSize * (depth + 1));
    return `${open}\n${indent}${entries.join(`,\n${indent}`)}\n${" ".repeat(indentSize * depth)}${close}`;
  }
  return write(value, 0);
}
