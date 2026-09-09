import { describe, expect, it } from "vitest";
import {
  MAX_PDF_INPUT,
  MAX_PDF_OUTPUT,
  MAX_PDF_PAGES,
  pageRanges,
  PdfEditingError,
  pdfFilename,
  formatPagesToRanges,
  outputName,
  checkOutput,
} from "../../src/pdf/core";

describe("PDF core", () => {
  it("formats normalized page selections without mutating the input", () => {
    const pages = [7, 3, 2, 1, 3, 9, 10, 11];
    expect(formatPagesToRanges(pages)).toBe("1-3,7,9-11");
    expect(pages).toEqual([7, 3, 2, 1, 3, 9, 10, 11]);
    expect(formatPagesToRanges([])).toBe("");
    expect(formatPagesToRanges([1])).toBe("1");
    expect(formatPagesToRanges([1, 2, 4])).toBe("1-2,4");
    for (const page of [NaN, Infinity, 1.5, 0, MAX_PDF_PAGES + 1])
      expect(() => formatPagesToRanges([page])).toThrow("out_of_bounds");
  });

  it("round-trips every selection from a small document through range text", () => {
    for (let mask = 1; mask < 256; mask++) {
      const pages = Array.from({ length: 8 }, (_, index) => index + 1).filter(
        (page) => mask & (1 << (page - 1)),
      );
      expect(
        pageRanges(formatPagesToRanges([...pages].reverse()), 8).pages,
      ).toEqual(pages);
    }
    expect(
      pageRanges(formatPagesToRanges([MAX_PDF_PAGES]), MAX_PDF_PAGES).pages,
    ).toEqual([MAX_PDF_PAGES]);
  });
  it("distinguishes descending ranges without changing the public error code", () => {
    expect(() => pageRanges("3-1", 4)).toThrow(
      expect.objectContaining({ code: "invalid_range", reason: "descending" }),
    );
    expect(() => pageRanges("1-", 4)).toThrow(
      expect.objectContaining({ code: "invalid_range", reason: undefined }),
    );
  });
  it("keeps input, output, and page limits stable", () => {
    expect(MAX_PDF_INPUT).toBe(128 * 1048576);
    expect(MAX_PDF_OUTPUT).toBe(256 * 1048576);
    expect(MAX_PDF_PAGES).toBe(10000);
  });

  it("expands ranges in segment order", () => {
    expect(pageRanges("4, 1 - 2", 4)).toEqual({
      pages: [4, 1, 2],
      segments: [[4], [1, 2]],
    });
    expect(pageRanges("1-3,5", 5).pages).toEqual([1, 2, 3, 5]);
  });

  it("uses every page only when explicitly requested", () => {
    const all = pageRanges(" \t", 3, true);
    expect(all).toEqual({
      pages: [1, 2, 3],
      segments: [[1, 2, 3]],
    });
    all.pages.pop();
    expect(all.segments[0]).toEqual([1, 2, 3]);
    expect(() => pageRanges("", 3)).toThrow(
      expect.objectContaining({ code: "empty_selection" }),
    );
  });

  it("rejects malformed, descending, duplicate, and out-of-bounds selections", () => {
    for (const range of ["a", "1e2", "1-", "1--2", "1,", "1 2"])
      expect(() => pageRanges(range, 4)).toThrow(
        expect.objectContaining({ code: "invalid_range" }),
      );
    expect(() => pageRanges("4-1", 4)).toThrow(
      expect.objectContaining({ code: "invalid_range" }),
    );
    expect(() => pageRanges("1,1", 4)).toThrow(
      expect.objectContaining({ code: "duplicate_page" }),
    );
    for (const range of ["0", "5", "1-5", "9007199254740992"])
      expect(() => pageRanges(range, 4)).toThrow(
        expect.objectContaining({ code: "out_of_bounds" }),
      );
  });

  it("rejects invalid document totals and oversized range text", () => {
    for (const total of [0, -1, 1.5, Number.NaN, MAX_PDF_PAGES + 1])
      expect(() => pageRanges("1", total)).toThrow(
        expect.objectContaining({ code: "out_of_bounds" }),
      );
    expect(() => pageRanges("1".repeat(100001), 1)).toThrow(
      expect.objectContaining({ code: "too_large" }),
    );
  });

  it("normalizes portable PDF filenames with fallback and extension handling", () => {
    expect(pdfFilename("merged")).toBe("merged.pdf");
    expect(pdfFilename("pages.PDF")).toBe("pages.PDF");
    expect(pdfFilename("../bad:name\u0000\u007f")).toBe("-bad-name--.pdf");
    expect(pdfFilename("  report  ")).toBe("report.pdf");
    expect(pdfFilename("...", "download")).toBe("download.pdf");
    expect(pdfFilename("文档")).toBe("文档.pdf");
    expect(pdfFilename("a".repeat(181))).toHaveLength(184);
  });

  it("preserves the structured PDF error code", () => {
    const error = new PdfEditingError("encrypted_pdf");
    expect(error).toMatchObject({ code: "encrypted_pdf" });
    expect(error.message).toBe("encrypted_pdf");
  });
});

describe("PDF output rules", () => {
  it("uses the sanitized source basename for each output kind", () => {
    expect(outputName("report.pdf", "txt")).toBe("report.txt");
    expect(outputName("report.PDF", "page-0001.png")).toBe(
      "report.page-0001.png",
    );
    expect(outputName("", "json")).toBe("result.json");
    expect(outputName(`${"界".repeat(160)}.pdf`, "zip")).toBe(
      `${"界".repeat(140)}.zip`,
    );
  });
  it("accepts the exact output capacity and rejects one excess byte", () => {
    expect(() => checkOutput(0)).not.toThrow();
    expect(() => checkOutput(MAX_PDF_OUTPUT)).not.toThrow();
    expect(() => checkOutput(MAX_PDF_OUTPUT + 1)).toThrow(
      new PdfEditingError("too_large"),
    );
  });
});
