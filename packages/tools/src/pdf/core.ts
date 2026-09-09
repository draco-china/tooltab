export type PdfEditingErrorCode =
  | "invalid_pdf"
  | "encrypted_pdf"
  | "invalid_range"
  | "duplicate_page"
  | "out_of_bounds"
  | "empty_selection"
  | "invalid_options"
  | "too_large"
  | "unsupported"
  | "timeout"
  | "busy"
  | "artifact_required"
  | "read_failed"
  | "unsupported_structure";

export class PdfEditingError extends Error {
  constructor(
    public code: PdfEditingErrorCode,
    public reason?: "descending",
  ) {
    super(code);
  }
}

export const MAX_PDF_INPUT = 128 * 1048576;
export const MAX_PDF_OUTPUT = 256 * 1048576;
export const MAX_PDF_PAGES = 10000;

export type PageRanges = { pages: number[]; segments: number[][] };

/** Parses one-based inclusive ranges while preserving the caller's segment order. */
export function pageRanges(
  text: string,
  total: number,
  emptyAll = false,
): PageRanges {
  if (!Number.isInteger(total) || total < 1 || total > MAX_PDF_PAGES)
    throw new PdfEditingError("out_of_bounds");
  if (text.length > 100000) throw new PdfEditingError("too_large");
  if (!text.trim()) {
    if (emptyAll) {
      return {
        pages: Array.from({ length: total }, (_, index) => index + 1),
        segments: [Array.from({ length: total }, (_, index) => index + 1)],
      };
    }
    throw new PdfEditingError("empty_selection");
  }

  const pages: number[] = [];
  const segments: number[][] = [];
  const seen = new Set<number>();
  for (const part of text.split(",")) {
    const token = part.trim();
    if (!/^[0-9]+(?:\s*-\s*[0-9]+)?(?![\s\S])/.test(token))
      throw new PdfEditingError("invalid_range");

    const ends = token.split("-").map(Number);
    const from = ends[0];
    const to = ends[1] ?? from;
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 1 ||
      to > total
    )
      throw new PdfEditingError("out_of_bounds");
    if (from > to) throw new PdfEditingError("invalid_range", "descending");

    const segment: number[] = [];
    for (let page = from; page <= to; page++) {
      if (seen.has(page)) throw new PdfEditingError("duplicate_page");
      seen.add(page);
      segment.push(page);
      pages.push(page);
    }
    segments.push(segment);
  }
  return { pages, segments };
}

/** Produces a portable PDF filename without changing ordinary Unicode names. */
export function pdfFilename(value: string, fallback = "result"): string {
  const name =
    [...value]
      .map((character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
          ? "-"
          : character,
      )
      .join("")
      .replace(/[<>:"/\\|?*]/g, "-")
      .trim()
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 180) || fallback;
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

/** Sorts and deduplicates a page selection into compact inclusive ranges. */
export function formatPagesToRanges(pages: readonly number[]) {
  if (
    pages.some(
      (page) => !Number.isInteger(page) || page < 1 || page > MAX_PDF_PAGES,
    )
  )
    throw new PdfEditingError("out_of_bounds");
  if (!pages.length) return "";
  const sorted = [...new Set(pages)].sort((left, right) => left - right);
  const ranges: string[] = [];
  let start = sorted[0] as number;
  let end = start;
  for (const page of sorted.slice(1)) {
    if (page === end + 1) end = page;
    else {
      ranges.push(start === end ? String(start) : `${start}-${end}`);
      start = page;
      end = page;
    }
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`);
  return ranges.join(",");
}

export function outputName(source: string, extension: string) {
  // Spread preserves Unicode code points when truncating the filename.
  return `${[...pdfFilename(source).slice(0, -4)].slice(0, 140).join("")}.${extension}`;
}
export function checkOutput(bytes: number) {
  if (bytes > MAX_PDF_OUTPUT) throw new PdfEditingError("too_large");
}
