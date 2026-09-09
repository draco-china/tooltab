import {
  PDFDocument,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
} from "@cantoo/pdf-lib";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { readText, wordCount, MAX_TEXT_OUTPUT } from "../../src/pdf/reading";

const loadingTasks: PDFDocumentLoadingTask[] = [];

afterEach(async () => {
  while (loadingTasks.length) await loadingTasks.pop()?.destroy();
});

async function loadPdf(bytes: Uint8Array) {
  const loading = getDocument({
    data: bytes,
    disableFontFace: true,
    useWorkerFetch: false,
  });
  loadingTasks.push(loading);
  return loading.promise;
}

async function textPdf() {
  const doc = await PDFDocument.create();
  const first = doc.addPage([300, 400]);
  first.drawText("Hello   PDF   world");
  doc.addPage([300, 400]);
  return doc.save();
}

describe("PDF text extraction", () => {
  it("extracts normalized text, counts words, identifies empty pages, and reports progress", async () => {
    const doc = await loadPdf(await textPdf());
    const progress: [number, number][] = [];
    const page = await doc.getPage(1);
    const cleanup = vi.spyOn(page, "cleanup");
    const result = await readText(doc, new Set(), (done, total) =>
      progress.push([done, total]),
    );

    expect(result).toMatchObject({
      kind: "text",
      pageCount: 2,
      text: "Hello PDF world",
      characterCount: 15,
      wordCount: 3,
      textPages: 1,
      emptyTextPages: 1,
      likelyScannedPages: 0,
    });
    expect(result.pages).toEqual([
      {
        pageNumber: 1,
        text: "Hello PDF world",
        characterCount: 15,
        wordCount: 3,
        likelyScanned: false,
      },
      {
        pageNumber: 2,
        text: "",
        characterCount: 0,
        wordCount: 0,
        likelyScanned: false,
      },
    ]);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(wordCount("  多词\nwith\tspaces ")).toBe(3);
    expect(wordCount(" \n\t ")).toBe(0);
  });

  it("preserves line breaks and separates nonempty pages while skipping blank pages", async () => {
    const source = await PDFDocument.create();
    source
      .addPage([300, 400])
      .drawText("First line\nSecond line", { x: 20, y: 300 });
    source.addPage([300, 400]);
    source.addPage([300, 400]).drawText("Final page", { x: 20, y: 300 });
    const doc = await loadPdf(await source.save());
    const result = await readText(doc, new Set());
    expect(result.text).toBe("First line\nSecond line\n\nFinal page");
    expect(result.pages.map((page) => page.text)).toEqual([
      "First line\nSecond line",
      "",
      "Final page",
    ]);
    expect(result.wordCount).toBe(6);
    expect(result.characterCount).toBe(result.text.length);
    expect(result.emptyTextPages).toBe(1);
  });

  it("extracts text inside marked content without requesting marker objects", async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([300, 400]);
    page.pushOperators(
      PDFOperator.of(PDFOperatorNames.BeginMarkedContent, [PDFName.of("Span")]),
    );
    page.drawText("Marked text", { x: 20, y: 300 });
    page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
    const doc = await loadPdf(await source.save());
    const parsedPage = await doc.getPage(1);
    const marked = await parsedPage.getTextContent({
      includeMarkedContent: true,
    });
    expect(
      marked.items.some(
        (item) => "type" in item && item.type === "beginMarkedContent",
      ),
    ).toBe(true);
    expect(
      marked.items.some(
        (item) => "type" in item && item.type === "endMarkedContent",
      ),
    ).toBe(true);
    const plain = await parsedPage.getTextContent({
      includeMarkedContent: false,
    });
    expect(plain.items.length).toBeGreaterThan(0);
    expect(plain.items.every((item) => "str" in item)).toBe(true);
    const result = await readText(doc, new Set());
    expect(result.text).toBe("Marked text");
    expect(result.wordCount).toBe(2);
  });

  it("detects a real image-only page as likely scanned", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([32, 32]);
    const image = await doc.embedPng(
      Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        ),
        (character) => character.charCodeAt(0),
      ),
    );
    page.drawImage(image, { x: 0, y: 0, width: 32, height: 32 });
    const pdf = await loadPdf(await doc.save());
    const result = await readText(pdf, new Set([OPS.paintImageXObject]));
    expect(result.pages[0]).toMatchObject({ text: "", likelyScanned: true });
    expect(result.likelyScannedPages).toBe(1);
  });

  it("cleans each real page when progress reporting throws", async () => {
    const doc = await loadPdf(await textPdf());
    const page = await doc.getPage(1);
    const cleanup = vi.spyOn(page, "cleanup");
    const failure = Error("progress stopped");
    await expect(
      readText(doc, new Set(), () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("rejects a real document over the page limit before extracting text", async () => {
    const source = await PDFDocument.create();
    for (let index = 0; index < 10_001; index += 1) source.addPage([1, 1]);
    const doc = await loadPdf(await source.save());
    await expect(readText(doc, new Set())).rejects.toThrow("too_large");
  });
});

describe("PDF text output capacity", () => {
  it.each([
    { charactersPerPage: 65_536, completedPages: 511 },
    { charactersPerPage: 65_535, completedPages: 512 },
  ])(
    "rejects 512 pages of $charactersPerPage characters at the correct stage",
    async ({ charactersPerPage, completedPages }) => {
      const source = await PDFDocument.create();
      const first = source.addPage([6000, 100]);
      // A small font keeps the complete line inside the real page bounds.
      first.drawText("A".repeat(charactersPerPage), { x: 1, y: 50, size: 0.1 });
      // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
      const contents = first.node.get(PDFName.of("Contents"))!;
      // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
      const resources = first.node.get(PDFName.of("Resources"))!;
      for (let index = 1; index < 512; index += 1) {
        const page = source.addPage([6000, 100]);
        page.node.set(PDFName.of("Contents"), contents);
        page.node.set(PDFName.of("Resources"), resources);
      }
      const bytes = await source.save();
      expect(bytes.length).toBeLessThan(1024 * 1024);
      const doc = await loadPdf(bytes);
      let completed = 0;
      await expect(
        readText(doc, new Set(), (done) => {
          completed = done;
        }),
      ).rejects.toThrow("too_large");
      expect(completed).toBe(completedPages);
      // The second case fits the per-item budget but overflows after the
      // two-character separators between nonempty pages are included.
      if (charactersPerPage === 65_535) {
        expect(512 * (charactersPerPage + 1)).toBe(MAX_TEXT_OUTPUT);
        expect(512 * charactersPerPage + 511 * 2).toBeGreaterThan(
          MAX_TEXT_OUTPUT,
        );
      }
    },
    30_000,
  );
});
