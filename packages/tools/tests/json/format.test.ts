import { describe, expect, it } from "vitest";
import {
  formatJson,
  JsonFormatError,
  MAX_JSON_DEPTH,
  MAX_JSON_LENGTH,
} from "../../src/json/format";

describe("JSON formatter core", () => {
  it("formats without changing large numeric lexemes", () => {
    expect(formatJson('{"id":9007199254740993}', "2")).toContain(
      "9007199254740993",
    );
  });

  it("formats and compacts exact numbers, ordering, duplicates, and escaped strings", () => {
    const source =
      '{"z":900719925474099312345,"a":1e999,"z":-0,"s":" \\u0041 \\" ","n":1.2300}';
    const formatted = formatJson(source);
    expect(formatted).toContain('"z": 900719925474099312345');
    expect(formatted).toContain('"a": 1e999');
    expect(formatJson(formatted, "compact")).toBe(source);
  });

  it("supports indentation modes, empty containers, and primitive roots", () => {
    expect(formatJson('{"a":[1,{}]}', "4")).toBe(
      '{\n    "a": [\n        1,\n        {}\n    ]\n}',
    );
    expect(formatJson("[true,null,[]]", "tab")).toBe(
      "[\n\ttrue,\n\tnull,\n\t[]\n]",
    );
    for (const size of ["1", "2", "3", "4", "5", "6", "7", "8"] as const)
      expect(formatJson('{"a":1}', size)).toBe(
        `{\n${" ".repeat(Number(size))}"a": 1\n}`,
      );
    for (const value of [
      '"hello"',
      "null",
      "true",
      "123456789012345678901",
      "{}",
      "[]",
    ])
      expect(formatJson(` \n${value} `)).toBe(value);
  });

  it("rejects invalid indentation", () => {
    expect(() => formatJson("{}", "0" as never)).toThrow("Invalid indentation");
  });

  it("rejects invalid JSON and preserves parser detail", () => {
    for (const value of [
      "",
      "{}{}",
      '{"a":1,}',
      "[1,]",
      "[01]",
      "NaN",
      "Infinity",
      "//x\n{}",
      '"x\n"',
      "undefined",
      "{a:1}",
      "[+1]",
    ])
      expect(() => formatJson(value)).toThrow("invalid");

    try {
      formatJson("{");
      throw new Error("expected formatter to reject input");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonFormatError);
      expect((error as JsonFormatError).code).toBe("invalid");
      expect((error as JsonFormatError).detail).toContain("JSON");
    }
  });

  it("keeps the invalid code when the parser boundary throws a non-Error", () => {
    const parse = JSON.parse;
    JSON.parse = (() => {
      throw "parser failed";
    }) as typeof JSON.parse;
    try {
      expect(() => formatJson("{}")).toThrow(JsonFormatError);
      try {
        formatJson("{}");
      } catch (error) {
        expect((error as JsonFormatError).code).toBe("invalid");
        expect((error as JsonFormatError).detail).toBeUndefined();
      }
    } finally {
      JSON.parse = parse;
    }
  });

  it("enforces bounded input and nesting while allowing brackets in strings", () => {
    expect(() => formatJson(" ".repeat(MAX_JSON_LENGTH + 1))).toThrow(
      "too_large",
    );
    expect(() =>
      formatJson(
        `${"[".repeat(MAX_JSON_DEPTH + 1)}0${"]".repeat(MAX_JSON_DEPTH + 1)}`,
      ),
    ).toThrow("too_deep");
    expect(formatJson(JSON.stringify("[".repeat(300)))).toBe(
      JSON.stringify("[".repeat(300)),
    );
  });

  it("bounds whitespace amplification before allocating formatted output", () => {
    const input = `${"[".repeat(250)}${Array(10_000).fill("0").join(",")}${"]".repeat(250)}`;
    expect(input.length).toBeLessThan(21_000);
    expect(() => formatJson(input, "4")).toThrow("output_too_large");
    expect(formatJson(input, "compact")).toBe(input);
  });
});
