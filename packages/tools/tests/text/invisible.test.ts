import { describe, expect, it } from "vitest";
import { scanInvisible } from "../../src/text/invisible";

describe("invisible character checker", () => {
  it("finds and removes zero-width characters", () => {
    const result = scanInvisible("a\u200Bb");
    expect(result.total).toBe(1);
    expect(result.cleanedText).toBe("ab");
  });

  it("reports categories, lines, offsets, annotations, and filtering", () => {
    const result = scanInvisible("a\r\n\u200Bb\n\u202Ec", [
      "zero-width",
      "bidi-control",
    ]);
    expect(result.total).toBe(2);
    expect(
      result.findings.map((finding) => [finding.line, finding.column]),
    ).toEqual([
      [2, 1],
      [3, 1],
    ]);
    expect(result.annotatedText).toContain("[[ZWSP]]");
    expect(result.annotatedText).toContain("[[RLO]]");
    expect(result.findingsTsv).toContain("index\tline\tcolumn");
    expect(scanInvisible("a\u200Bb", []).total).toBe(0);
    expect(() => scanInvisible("x", ["bad"])).toThrow("invalid_options");
  });

  it("truncates findings while retaining complete cleaned output", () => {
    const result = scanInvisible("\u200B".repeat(501));
    expect(result.total).toBe(501);
    expect(result.findings).toHaveLength(500);
    expect(result.findingsTruncated).toBe(true);
    expect(result.cleanedText).toBe("");
  });
});
