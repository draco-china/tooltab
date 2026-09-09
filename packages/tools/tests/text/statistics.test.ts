import { describe, expect, it } from "vitest";
import {
  analyzeText,
  MAX_STATISTICS_LENGTH,
  TextStatisticsError,
} from "../../src/text/statistics";

describe("text statistics", () => {
  it("counts an editing sample including repetition and structural metrics", () => {
    const result = analyzeText("Hello world. Hello again!\n\nOne line.");
    expect(result.words).toBe(6);
    expect(result.uniqueWords).toBe(5);
    expect(result.sentences).toBe(3);
    expect(result.paragraphs).toBe(2);
    expect(result.lines).toBe(3);
    expect(result.longestSentenceWords).toBe(2);
    expect(result.longestParagraphWords).toBe(4);
    expect(result.averageSentenceWords).toBe(2);
    expect(result.averageWordLength).toBe(4.5);
    expect(result.lexicalDiversity).toBeCloseTo((100 * 5) / 6);
    expect(result.readingSeconds).toBe(2);
    expect(result.speakingSeconds).toBe(2);
    expect(result.repeatedTerms).toEqual([{ term: "hello", count: 2 }]);
  });
  it("counts graphemes rather than UTF-16 units and merges canonical word spellings", () => {
    const result = analyzeText("é e\u0301 👨‍👩‍👧‍👦");
    expect(result.characters).toBe(5);
    expect(result.charactersNoSpaces).toBe(3);
    expect(result.words).toBe(2);
    expect(result.uniqueWords).toBe(1);
    expect(result.averageWordLength).toBe(1);
    expect(result.repeatedTerms).toEqual([{ term: "é", count: 2 }]);
  });
  it("segments Chinese without whitespace and retains upstream sentence segments", () => {
    const result = analyzeText("你好世界。你好世界！", "zh-CN");
    expect(result.words).toBe(4);
    expect(result.sentences).toBe(2);
    expect(result.uniqueWords).toBe(2);
    expect(analyzeText("... !!!").sentences).toBe(1);
  });
  it("defines empty, blank and trailing lines without counting blank paragraphs", () => {
    expect(analyzeText("")).toEqual({
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      uniqueWords: 0,
      sentences: 0,
      paragraphs: 0,
      lines: 0,
      readingSeconds: 0,
      speakingSeconds: 0,
      averageWordLength: 0,
      averageSentenceWords: 0,
      lexicalDiversity: 0,
      longestSentenceWords: 0,
      longestParagraphWords: 0,
      repeatedTerms: [],
    });
    expect(analyzeText(" \t\n").charactersNoSpaces).toBe(0);
    expect(analyzeText(" \t\n").paragraphs).toBe(0);
    expect(analyzeText("one\r\ntwo\r\n").lines).toBe(3);
    expect(analyzeText("one\r\ntwo\r\n").paragraphs).toBe(1);
    expect(analyzeText("one\n \t\ntwo").paragraphs).toBe(2);
  });
  it("shows eight repeated terms in frequency order without filtering common words", () => {
    const text =
      "a a a " +
      Array.from({ length: 12 }, (_, n) => `word${n} word${n}`).join(" ");
    const result = analyzeText(text);
    expect(result.repeatedTerms).toHaveLength(8);
    expect(result.repeatedTerms[0]).toEqual({ term: "a", count: 3 });
  });
  it("normalizes compatibility spellings and excludes numeric-only tokens", () => {
    const result = analyzeText("Ｆｏｏ foo 123 123");
    expect(result.words).toBe(2);
    expect(result.uniqueWords).toBe(1);
    expect(result.repeatedTerms).toEqual([{ term: "foo", count: 2 }]);
  });
  it("rejects oversized inputs before segmentation", () => {
    expect(() => analyzeText("a".repeat(MAX_STATISTICS_LENGTH + 1))).toThrow(
      new TextStatisticsError("too-large"),
    );
  });
  it("reports unsupported segmentation rather than inventing approximate counts", () => {
    const original = Intl.Segmenter;
    Object.defineProperty(Intl, "Segmenter", {
      configurable: true,
      value: undefined,
    });
    try {
      expect(() => analyzeText("test")).toThrow(
        new TextStatisticsError("unsupported"),
      );
    } finally {
      Object.defineProperty(Intl, "Segmenter", {
        configurable: true,
        value: original,
      });
    }
  });
});
