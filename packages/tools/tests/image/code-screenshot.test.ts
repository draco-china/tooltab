import { DOMParser } from "@xmldom/xmldom";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  CODE_SCREENSHOT_MAX_DIMENSION,
  CODE_SCREENSHOT_MAX_INPUT,
  CodeScreenshotError,
  codeScreenshotLanguages,
  defaultCodeScreenshotOptions,
  renderCodeScreenshot,
  validateCodeScreenshotOptions,
  type CodeScreenshotOptions,
} from "../../src/image/code-screenshot";

const options = (overrides: Partial<CodeScreenshotOptions> = {}) => ({
  ...defaultCodeScreenshotOptions,
  ...overrides,
});

const errorCode = (overrides: Partial<CodeScreenshotOptions>, code: string) => {
  expect(() => validateCodeScreenshotOptions(options(overrides))).toThrow(
    new CodeScreenshotError(code as never),
  );
};

describe("code screenshot options", () => {
  it("rejects inherited object keys before rendering", () => {
    for (const field of ["theme", "backgroundPreset"] as const) {
      for (const value of ["constructor", "toString", "__proto__"]) {
        const input = options({
          [field]: value,
        } as Partial<CodeScreenshotOptions>);
        for (const run of [
          validateCodeScreenshotOptions,
          renderCodeScreenshot,
        ]) {
          expect(() => run(input)).toThrow(
            new CodeScreenshotError("invalid_options"),
          );
        }
      }
    }
  });

  it("accepts the defaults and every registered language", () => {
    expect(() =>
      validateCodeScreenshotOptions(defaultCodeScreenshotOptions),
    ).not.toThrow();
    expect(codeScreenshotLanguages).toContain("auto");
    for (const language of codeScreenshotLanguages)
      expect(() =>
        validateCodeScreenshotOptions(options({ language })),
      ).not.toThrow();
  });

  it("rejects empty, oversized, and invalid enum or color input", () => {
    errorCode({ code: " \n\t" }, "invalid_input");
    errorCode({ code: "é".repeat(CODE_SCREENSHOT_MAX_INPUT) }, "too_large");
    errorCode(
      { language: "unknown" as CodeScreenshotOptions["language"] },
      "invalid_options",
    );
    errorCode(
      { theme: "unknown" as CodeScreenshotOptions["theme"] },
      "invalid_options",
    );
    errorCode(
      {
        backgroundPreset:
          "unknown" as CodeScreenshotOptions["backgroundPreset"],
      },
      "invalid_options",
    );
    errorCode(
      { renderMode: "unknown" as CodeScreenshotOptions["renderMode"] },
      "invalid_options",
    );
    errorCode(
      { backgroundMode: "unknown" as CodeScreenshotOptions["backgroundMode"] },
      "invalid_options",
    );
    errorCode(
      { windowStyle: "unknown" as CodeScreenshotOptions["windowStyle"] },
      "invalid_options",
    );
    for (const backgroundColor of ["red", "#12345", "#1234567", "#12gg34"])
      errorCode({ backgroundColor }, "invalid_options");
  });

  it("enforces finite numeric ranges", () => {
    const ranges = [
      ["fontSize", 10, 32],
      ["lineHeight", 1, 2.2],
      ["cardPadding", 8, 80],
      ["framePadding", 0, 120],
      ["radius", 0, 40],
      ["tabSize", 1, 8],
    ] as const;
    for (const [field, min, max] of ranges) {
      errorCode({ [field]: NaN }, "invalid_options");
      errorCode({ [field]: Infinity }, "invalid_options");
      errorCode({ [field]: min - 1 }, "invalid_options");
      errorCode({ [field]: max + 1 }, "invalid_options");
    }
  });
});

describe("renderCodeScreenshot", () => {
  it("renders real highlighted JavaScript and escapes source XML", () => {
    const result = renderCodeScreenshot(
      options({
        code: 'const value = "<script>&\\\'";\n// safe',
        language: "javascript",
        backgroundPreset: "ocean",
        windowStyle: "windows",
      }),
    );
    expect(result).toMatchObject({ lines: 2 });
    expect(result.width).toBeGreaterThan(200);
    expect(result.height).toBeGreaterThan(100);
    expect(result.svg).toContain("&lt;script&gt;&amp;");
    expect(result.svg).toContain("&quot;");
    expect(result.svg).toContain("&#39;");
    expect(result.svg).not.toContain("<script>");
    expect(result.svg).toContain("#2563eb");
    expect(result.svg).toContain('stroke="#94a3b8"');
    expect(result.svg).toContain('filter="url(#shot-shadow)"');
    expect(result.html).toContain("<!doctype html>");
    expect(result.html).toContain(result.svg);
  });

  it("renders plain code with normalized tabs, transparent background, and no chrome", () => {
    const result = renderCodeScreenshot(
      options({
        code: "a\tb\r\nc\t\n",
        renderMode: "plain",
        backgroundMode: "transparent",
        windowStyle: "none",
        lineNumbers: false,
        shadow: false,
        tabSize: 4,
      }),
    );
    expect(result.lines).toBe(3);
    expect(result.svg).toContain('fill="none"');
    expect(result.svg).toContain("a    b");
    expect(result.svg).toContain("c    ");
    expect(result.svg).toContain("&#160;");
    expect(result.svg).not.toContain("shot-shadow");
    expect(result.svg).not.toContain("<circle");
    expect(result.svg).not.toContain('text-anchor="end"');
  });

  it("supports solid, none, and preset gradients with each theme", () => {
    for (const theme of ["nebula", "sunrise", "paper", "terminal"] as const) {
      const preset = renderCodeScreenshot(
        options({
          theme,
          backgroundPreset: "noir",
          language: theme === "nebula" ? "auto" : "typescript",
        }),
      );
      expect(preset.svg).toContain("radialGradient");
      expect(preset.svg).toContain(
        `fill="${theme === "paper" ? "#f8fafc" : theme === "sunrise" ? "#151117" : theme === "terminal" ? "#0b0f0b" : "#0b1020"}"`,
      );
    }
    const solid = renderCodeScreenshot(
      options({ backgroundMode: "solid", backgroundColor: "#ABCDEF" }),
    );
    expect(solid.svg).toContain('fill="#abcdef"');
    expect(solid.svg).not.toContain("<linearGradient");
    const none = renderCodeScreenshot(
      options({ backgroundMode: "none", framePadding: 120, shadow: true }),
    );
    expect(none.svg).toContain('fill="none"');
    expect(none.svg).not.toContain("shot-shadow");
    expect(none.width).toBeLessThan(CODE_SCREENSHOT_MAX_DIMENSION);
  });

  it("renders both window controls and line number gutters", () => {
    const mac = renderCodeScreenshot(
      options({ code: "one\ntwo", windowStyle: "mac" }),
    );
    expect(mac.svg.match(/<circle /g)).toHaveLength(3);
    expect(mac.svg).toContain('text-anchor="end"');
    const noNumbers = renderCodeScreenshot(
      options({ code: "one\ntwo", windowStyle: "none", lineNumbers: false }),
    );
    expect(noNumbers.svg).not.toContain("<circle");
    expect(noNumbers.svg).not.toContain('text-anchor="end"');
    expect(noNumbers.height).toBeLessThan(mac.height);
  });

  it("rejects outputs exceeding dimension or pixel limits", () => {
    expect(() =>
      renderCodeScreenshot(
        options({
          code: "x",
          framePadding: 120,
          cardPadding: 80,
          fontSize: 32,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      renderCodeScreenshot(
        options({ code: "x".repeat(10_000), framePadding: 120 }),
      ),
    ).toThrow("too_large");
    expect(() =>
      renderCodeScreenshot(
        options({ code: "x\n".repeat(4_000), framePadding: 120 }),
      ),
    ).toThrow("too_large");
  });
});

it.each(["plain", "highlight"] as const)(
  "rejects unrepresentable XML characters in %s output",
  (renderMode) => {
    for (const character of [
      "\0",
      "\u0008",
      "\u000b",
      "\u000c",
      "\u000e",
      "\u001f",
      "\ud800",
      "\udfff",
      "\ufffe",
      "\uffff",
    ]) {
      expect(() =>
        renderCodeScreenshot(options({ code: `a${character}b`, renderMode })),
      ).toThrow(expect.objectContaining({ code: "invalid_input" }));
    }
  },
);

it.each(["plain", "highlight"] as const)(
  "exports parseable %s SVG for permitted whitespace and Unicode",
  async (renderMode) => {
    const code = 'const text = "😀 & < > e\u0301";\r\n\t// Unicode';
    const result = renderCodeScreenshot(options({ code, renderMode }));
    expect(result.svg).toContain("😀");
    expect(result.svg).toContain("e\u0301");
    const { info, data } = await sharp(Buffer.from(result.svg))
      .png()
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(result.width);
    expect(info.height).toBe(result.height);
    expect(data.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  },
);

it.each(codeScreenshotLanguages)(
  "preserves literal markup and Unicode through %s highlighting",
  (language) => {
    const code = `<span class="hljs-string">&amp; '界😀'</span>\nconst value = "<&>";`;
    const result = renderCodeScreenshot(
      options({ code, language, lineNumbers: false, windowStyle: "none" }),
    );
    const document = new DOMParser({
      onError: (level, message) => {
        throw new Error(`${level}: ${message}`);
      },
    }).parseFromString(result.svg, "image/svg+xml");
    const rows = Array.from(document.getElementsByTagName("text"));
    expect(rows.map((row) => row.textContent).join("\n")).toBe(code);
    expect(document.getElementsByTagName("span").length).toBe(0);
    expect(document.getElementsByTagName("script").length).toBe(0);
    expect(result.lines).toBe(2);
  },
);
