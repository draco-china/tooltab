export const MAX_STATISTICS_LENGTH = 100_000;
export const READING_WORDS_PER_MINUTE = 220;
export const SPEAKING_WORDS_PER_MINUTE = 150;
export const MAX_REPEATED_TERMS = 8;
export class TextStatisticsError extends Error {
  constructor(public readonly code: "too-large" | "unsupported") {
    super(code);
    this.name = "TextStatisticsError";
  }
}
export interface TextStatistics {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  uniqueWords: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingSeconds: number;
  speakingSeconds: number;
  averageWordLength: number;
  averageSentenceWords: number;
  lexicalDiversity: number;
  longestSentenceWords: number;
  longestParagraphWords: number;
  repeatedTerms: { term: string; count: number }[];
}

/** Locale and counting rules are explicit so UI, API and MCP share one result. */
export function analyzeText(
  text: string,
  locale: "en-US" | "zh-CN" = "en-US",
): TextStatistics {
  if (text.length > MAX_STATISTICS_LENGTH)
    throw new TextStatisticsError("too-large");
  if (typeof Intl.Segmenter !== "function")
    throw new TextStatisticsError("unsupported");
  const graphemes = new Intl.Segmenter(locale, { granularity: "grapheme" });
  const words = new Intl.Segmenter(locale, { granularity: "word" });
  const sentences = new Intl.Segmenter(locale, { granularity: "sentence" });
  const countWords = (value: string) => {
    let count = 0;
    for (const segment of words.segment(value.normalize("NFKC")))
      if (segment.isWordLike && /\p{L}/u.test(segment.segment)) count++;
    return count;
  };
  let characters = 0;
  let charactersNoSpaces = 0;
  for (const segment of graphemes.segment(text)) {
    characters++;
    if (!/^\s+$/u.test(segment.segment)) charactersNoSpaces++;
  }
  const frequencies = new Map<string, number>();
  let wordCount = 0;
  let wordCharacters = 0;
  for (const segment of words.segment(text)) {
    if (!segment.isWordLike) continue;
    const normalized = segment.segment.normalize("NFKC");
    if (!/\p{L}/u.test(normalized)) continue;
    wordCount++;
    const term = normalized.toLocaleLowerCase(locale);
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    wordCharacters += [...graphemes.segment(normalized)].length;
  }
  let sentenceCount = 0;
  let longestSentenceWords = 0;
  for (const segment of sentences.segment(text.trim())) {
    if (!segment.segment.trim()) continue;
    const count = countWords(segment.segment);
    sentenceCount++;
    longestSentenceWords = Math.max(longestSentenceWords, count);
  }
  const normalizedLines = text.replace(/\r\n?|\u2028|\u2029/g, "\n");
  const paragraphs = normalizedLines
    .split(/\n\s*\n/)
    .filter((value) => value.trim());
  let longestParagraphWords = 0;
  for (const paragraph of paragraphs) {
    longestParagraphWords = Math.max(
      longestParagraphWords,
      countWords(paragraph),
    );
  }
  return {
    characters,
    charactersNoSpaces,
    words: wordCount,
    uniqueWords: frequencies.size,
    sentences: sentenceCount,
    paragraphs: paragraphs.length,
    lines: text.length ? normalizedLines.split("\n").length : 0,
    readingSeconds: wordCount
      ? Math.max(1, Math.round((wordCount / READING_WORDS_PER_MINUTE) * 60))
      : 0,
    speakingSeconds: wordCount
      ? Math.max(1, Math.round((wordCount / SPEAKING_WORDS_PER_MINUTE) * 60))
      : 0,
    averageWordLength: wordCount ? wordCharacters / wordCount : 0,
    averageSentenceWords: sentenceCount ? wordCount / sentenceCount : 0,
    lexicalDiversity: wordCount ? (frequencies.size / wordCount) * 100 : 0,
    longestSentenceWords,
    longestParagraphWords,
    repeatedTerms: [...frequencies]
      .filter(([, count]) => count > 1)
      .sort(
        ([a, countA], [b, countB]) =>
          countB - countA || a.localeCompare(b, locale),
      )
      .slice(0, MAX_REPEATED_TERMS)
      .map(([term, count]) => ({ term, count })),
  };
}
