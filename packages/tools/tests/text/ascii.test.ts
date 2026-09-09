import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import figlet from "figlet/node";
import { describe, expect, it } from "vitest";
import {
  ASCII_INPUT_LIMIT,
  AsciiError,
  generateAsciiArt,
} from "../../src/text/ascii";

figlet.loadFontSync("Standard");

const render = (
  text: string,
  options: { font: string; width: number; whitespaceBreak: boolean },
) => figlet.textSync(text, options);

describe("ascii core", () => {
  it("renders real FIGlet output for each source line and preserves metadata", () => {
    const result = generateAsciiArt(
      { text: "Hi\n\nBye", font: "Standard", align: "left", width: 80 },
      render,
    );
    expect(result.output).toBe(
      `${figlet.textSync("Hi", { font: "Standard", width: 80, whitespaceBreak: true })}\n\n${figlet.textSync("Bye", { font: "Standard", width: 80, whitespaceBreak: true })}`,
    );
    expect(result.filename).toBe("standard-ascii-art.txt");
    expect(result.bytes).toBe(new TextEncoder().encode(result.output).length);
    expect(result.lines).toBe(result.output.split("\n").length);
  });

  it("aligns every generated row in the selected width", () => {
    const left = generateAsciiArt(
      { text: "A", font: "Standard", align: "left", width: 40 },
      render,
    ).output.split("\n");
    for (const align of ["center", "right"] as const) {
      const rows = generateAsciiArt(
        { text: "A", font: "Standard", align, width: 40 },
        render,
      ).output.split("\n");
      for (const [index, row] of rows.entries()) {
        expect(row).toBe(
          `${" ".repeat(
            align === "right"
              ? 40 - left[index].length
              : Math.floor((40 - left[index].length) / 2),
          )}${left[index]}`,
        );
      }
    }
  });

  it("keeps validation and rendering errors distinct", () => {
    expect(() => generateAsciiArt({ text: "x", width: 39 }, render)).toThrow(
      new AsciiError("invalid_input"),
    );
    expect(() =>
      generateAsciiArt(
        { text: Array.from({ length: 129 }, () => "x").join("\n") },
        render,
      ),
    ).toThrow("too_many_lines");
    expect(() =>
      generateAsciiArt({ text: "x", font: "missing" }, render),
    ).toThrow("font_not_found");
  });

  it("normalizes CRLF and returns an empty result without rendering", () => {
    let calls = 0;
    const result = generateAsciiArt(
      { text: "\r\n", font: "Standard" },
      (...args) => {
        calls += 1;
        return render(...args);
      },
    );
    expect(calls).toBe(0);
    expect(result).toMatchObject({ output: "", bytes: 0, lines: 0 });
  });

  it("enforces the UTF-8 input byte limit after schema validation", () => {
    expect(() =>
      generateAsciiArt({ text: "界".repeat(ASCII_INPUT_LIMIT) }, render),
    ).toThrow("invalid_input");
  });
});

it("rejects actual FIGlet output amplification and permits subsequent rendering", () => {
  figlet.loadFontSync("Doh");
  const text = Array.from({ length: 64 }, () => "W".repeat(32)).join("\n");
  expect(new TextEncoder().encode(text).length).toBeLessThan(ASCII_INPUT_LIMIT);
  expect(() =>
    generateAsciiArt({ text, font: "Doh", width: 160 }, render),
  ).toThrow("output_too_large");
  expect(
    generateAsciiArt({ text: "OK", font: "Standard" }, render).output,
  ).toContain("_");
});

it("normalizes mixed line endings without changing rendered content", () => {
  const a = generateAsciiArt({ text: "A\rB\r\nC\n", font: "Standard" }, render);
  const b = generateAsciiArt({ text: "A\nB\nC\n", font: "Standard" }, render);
  expect(a).toEqual(b);
});

it("normalizes the filename for a real registered font with a punctuation-only name", () => {
  const require = createRequire(import.meta.url);
  figlet.parseFont(
    "!!!",
    readFileSync(
      resolve(dirname(require.resolve("figlet/node")), "../fonts/Standard.flf"),
      "utf8",
    ),
  );
  const result = generateAsciiArt({ text: "Hi", font: "!!!" }, render);
  expect(result.filename).toBe("--ascii-art.txt");
  expect(result.output).toBe(
    generateAsciiArt({ text: "Hi", font: "Standard" }, render).output,
  );
});

it("rejects empty and whitespace-only font names before rendering", () => {
  let calls = 0;
  const observedRender: typeof render = (...args) => {
    calls++;
    return render(...args);
  };
  for (const font of ["", " ", "\t\r\n"]) {
    expect(() =>
      generateAsciiArt({ text: "Hi", font }, observedRender),
    ).toThrow("invalid_input");
  }
  expect(calls).toBe(0);
});
