import {
  degrees,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "@cantoo/pdf-lib";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { numberDefaults } from "../../src/pdf/numbering";
import { MAX_PDF_INPUT, MAX_PDF_OUTPUT } from "../../src/pdf/core";
import { inspectPdf, runPdfJob, type PdfJob } from "../../src/pdf/editing";

async function sample() {
  const doc = await PDFDocument.create();
  for (let index = 0; index < 4; index += 1) {
    const page = doc.addPage([300 + index * 20, 400 + index * 10]);
    page.drawText(`Original page ${index + 1}`);
    page.setRotation(degrees(index * 90));
  }
  return { bytes: await doc.save(), name: "source.pdf" };
}

describe("PDF inspection", () => {
  it("reports actual page sizes and normalized rotations", async () => {
    const source = await sample();
    await expect(inspectPdf(source)).resolves.toEqual({
      kind: "info",
      pages: [
        { page: 1, width: 300, height: 400, rotation: 0 },
        { page: 2, width: 320, height: 410, rotation: 90 },
        { page: 3, width: 340, height: 420, rotation: 180 },
        { page: 4, width: 360, height: 430, rotation: 270 },
      ],
      warnings: [],
    });
  });

  it("routes inspect jobs through runPdfJob and rejects empty bytes", async () => {
    const source = await sample();
    await expect(runPdfJob({ kind: "inspect", source })).resolves.toEqual(
      await inspectPdf(source),
    );
    await expect(
      runPdfJob({
        kind: "inspect",
        source: { bytes: new Uint8Array(), name: "empty.pdf" },
      }),
    ).rejects.toThrow("invalid_pdf");
  });

  it("rejects a real zero-page document and a document over the page limit", async () => {
    const empty = await PDFDocument.create();
    await expect(
      inspectPdf({
        bytes: await empty.save({ addDefaultPage: false }),
        name: "zero-pages.pdf",
      }),
    ).rejects.toThrow("invalid_pdf");

    const oversized = await PDFDocument.create();
    for (let index = 0; index < 10_001; index += 1) oversized.addPage([1, 1]);
    await expect(
      inspectPdf({ bytes: await oversized.save(), name: "too-many-pages.pdf" }),
    ).rejects.toThrow("too_large");
  }, 30_000);
});

describe("PDF output jobs", () => {
  it("maps page numbers from the visible crop box for all quarter-turn rotations", async () => {
    const doc = await PDFDocument.create();
    for (const angle of [0, 90, 180, 270]) {
      const page = doc.addPage([400, 500]);
      page.setCropBox(10, 20, 200, 300);
      page.setRotation(degrees(angle));
    }
    const result = await runPdfJob({
      kind: "number",
      source: { bytes: await doc.save(), name: "rotated.pdf" },
      options: { ...numberDefaults, position: "bottom-left" },
      filename: "numbered",
    });
    if (result.kind !== "output") throw new Error("expected output");
    const output = await PDFDocument.load(result.files[0].bytes);
    const expected = [
      [34, 44],
      [186, 44],
      [186, 296],
      [34, 296],
    ];
    for (const [index, page] of output.getPages().entries()) {
      const contents = page.node.Contents();
      if (!(contents instanceof PDFArray)) throw new Error("expected streams");
      let operators = "";
      for (const ref of contents.asArray()) {
        const stream = output.context.lookup(ref);
        if (!(stream instanceof PDFRawStream))
          throw new Error("expected raw stream");
        operators += new TextDecoder().decode(
          decodePDFRawStream(stream).decode(),
        );
      }
      const matrix = operators.split("\n").find((line) => line.endsWith(" Tm"));
      expect(matrix).toBeDefined();
      expect(matrix?.split(" ").slice(4, 6).map(Number)).toEqual(
        expected[index],
      );
      expect(operators).toContain(`<3${index + 1}> Tj`);
    }
  });

  it("reports named resources lost while merging page copies", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.catalog.set(PDFName.of("Names"), doc.context.obj({}));
    const source = { bytes: await doc.save(), name: "named.pdf" };
    const result = await runPdfJob({
      kind: "merge",
      sources: [source, source],
      filename: "merged",
    });
    if (result.kind !== "output") throw new Error("expected output");
    expect(result.warnings).toContain("named_resources_not_copied");
    expect(
      (await PDFDocument.load(result.files[0].bytes)).catalog.has(
        PDFName.of("Names"),
      ),
    ).toBe(false);
  });

  it("merges pages in source order and reports progress", async () => {
    const source = await sample();
    const progress: [number, number][] = [];
    const result = await runPdfJob(
      { kind: "merge", sources: [source, source], filename: "merged" },
      (done, total) => progress.push([done, total]),
    );
    if (result.kind !== "output") throw new Error("expected output");
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(result.files).toHaveLength(1);
    const doc = await PDFDocument.load(result.files[0].bytes);
    expect(doc.getPageCount()).toBe(8);
    expect(doc.getPages().map((page) => page.getWidth())).toEqual([
      300, 320, 340, 360, 300, 320, 340, 360,
    ]);
    expect(doc.getPage(2).getRotation().angle).toBe(180);
    expect(result.files[0].name).toBe("merged.pdf");
  });

  it("splits one file, ranges, pages, and complete ZIP entries", async () => {
    const source = await sample();
    for (const mode of ["single", "ranges", "pages"] as const) {
      const result = await runPdfJob({
        kind: "split",
        source,
        ranges: "4,1-2",
        outputMode: mode === "single" ? "single" : "multiple",
        multipleMode: mode === "pages" ? "pages" : "ranges",
        filename: "selected.pdf",
      });
      if (result.kind !== "output") throw new Error("expected output");
      expect(result.files.map((file) => file.pages)).toEqual(
        mode === "single" ? [3] : mode === "ranges" ? [1, 2] : [1, 1, 1],
      );
      if (mode === "single") expect(result.archive).toBeNull();
      else expect(result.archive).toBeInstanceOf(Uint8Array);
      if (result.archive) {
        expect(Object.keys(unzipSync(result.archive))).toEqual(
          result.files.map((file) => file.name),
        );
      }
      const doc = await PDFDocument.load(result.files[0].bytes);
      expect(doc.getPage(0).getWidth()).toBe(360);
    }
  });

  it("reorders, removes, and rotates selected pages", async () => {
    const result = await runPdfJob({
      kind: "organize",
      source: await sample(),
      plan: [
        { page: 4, rotation: 90 },
        { page: 2, rotation: 270 },
      ],
      filename: "organized",
    });
    if (result.kind !== "output") throw new Error("expected output");
    const doc = await PDFDocument.load(result.files[0].bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(
      doc.getPages().map((page) => [page.getWidth(), page.getRotation().angle]),
    ).toEqual([
      [360, 90],
      [320, 270],
    ]);
  });

  it("numbers selected pages while retaining forms and outlines", async () => {
    const source = await sample();
    const doc = await PDFDocument.load(source.bytes);
    const field = doc.getForm().createTextField("name");
    field.setText("retained value");
    field.addToPage(doc.getPage(0));
    const outlines = doc.context.obj({ Type: "Outlines", Count: 1 });
    const root = doc.context.register(outlines);
    const item = doc.context.register(
      doc.context.obj({
        Title: PDFString.of("First page"),
        Parent: root,
        Dest: [doc.getPage(0).ref, PDFName.of("Fit")],
      }),
    );
    outlines.set(PDFName.of("First"), item);
    outlines.set(PDFName.of("Last"), item);
    doc.catalog.set(PDFName.of("Outlines"), root);
    source.bytes = await doc.save();

    const result = await runPdfJob({
      kind: "number",
      source,
      options: {
        ...numberDefaults,
        pages: "4,1",
        format: "number-total",
        startNumber: 7,
      },
      filename: "numbered",
    });
    if (result.kind !== "output") throw new Error("expected output");
    const numbered = await PDFDocument.load(result.files[0].bytes);
    expect(numbered.getForm().getTextField("name").getText()).toBe(
      "retained value",
    );
    expect(numbered.catalog.has(PDFName.of("Outlines"))).toBe(true);
    expect(numbered.getPageCount()).toBe(4);
    expect(result.files[0].bytes).not.toEqual(source.bytes);

    const copied = await runPdfJob({
      kind: "split",
      source,
      ranges: "1",
      outputMode: "single",
      multipleMode: "ranges",
      filename: "copy",
    });
    if (copied.kind !== "output") throw new Error("expected output");
    expect(copied.warnings).toContain("forms_not_copied");
    expect(copied.warnings).toContain("bookmarks_not_copied");
  });

  it("supports sans-serif number-total output and works without a progress callback", async () => {
    const source = await sample();
    const numbered = await runPdfJob({
      kind: "number",
      source,
      options: {
        ...numberDefaults,
        fontFamily: "sans-serif",
        format: "number-total",
        pages: "1",
      },
      filename: "sans-serif",
    });
    if (numbered.kind !== "output") throw new Error("expected output");
    expect(numbered.files[0].pages).toBe(4);
    const merged = await runPdfJob({
      kind: "merge",
      sources: [source, source],
      filename: "no-progress",
    });
    if (merged.kind !== "output") throw new Error("expected output");
    expect(merged.files[0].pages).toBe(8);
  });
});

describe("PDF errors and warnings", () => {
  it("rejects a merge whose individual documents fit but combined pages exceed the limit", async () => {
    const doc = await PDFDocument.create();
    for (let index = 0; index < 5001; index++) doc.addPage([1, 1]);
    const source = { bytes: await doc.save(), name: "many-pages.pdf" };
    await expect(
      runPdfJob({
        kind: "merge",
        sources: [source, source],
        filename: "merged",
      }),
    ).rejects.toThrow("too_large");
  }, 30_000);

  it("rejects actual input bytes exceeding the per-file and combined budgets", async () => {
    const bytes = new Uint8Array(MAX_PDF_INPUT + 1);
    await expect(inspectPdf({ bytes, name: "oversized.pdf" })).rejects.toThrow(
      "too_large",
    );
    // Distinct selections can share a buffer; their lengths still count separately.
    const part = bytes.subarray(0, 2 * 1048576);
    await expect(
      runPdfJob({
        kind: "merge",
        sources: Array.from({ length: 65 }, (_, index) => ({
          bytes: part,
          name: `${index}.pdf`,
        })),
        filename: "combined",
      }),
    ).rejects.toThrow("too_large");
  });

  it("rejects invalid documents, encrypted PDFs, and invalid selections", async () => {
    await expect(
      inspectPdf({ bytes: new Uint8Array([1, 2, 3]), name: "bad.pdf" }),
    ).rejects.toThrow("invalid_pdf");
    const encrypted = await PDFDocument.create();
    encrypted.addPage();
    encrypted.encrypt({ userPassword: "test", ownerPassword: "owner" });
    await expect(
      inspectPdf({ bytes: await encrypted.save(), name: "encrypted.pdf" }),
    ).rejects.toThrow("encrypted_pdf");
    const source = await sample();
    const mergeJob: PdfJob = {
      kind: "merge",
      sources: [source],
      filename: "one",
    };
    await expect(runPdfJob(mergeJob)).rejects.toThrow("invalid_options");
    const emptyPlanJob: PdfJob = {
      kind: "organize",
      source,
      plan: [],
      filename: "empty",
    };
    await expect(runPdfJob(emptyPlanJob)).rejects.toThrow("empty_selection");
    const outOfBoundsJob: PdfJob = {
      kind: "organize",
      source,
      plan: [{ page: 0, rotation: 0 }],
      filename: "bounds",
    };
    await expect(runPdfJob(outOfBoundsJob)).rejects.toThrow("out_of_bounds");
    const invalidRotationJob: PdfJob = {
      kind: "organize",
      source,
      plan: [{ page: 1, rotation: 45 }],
      filename: "rotation",
    };
    await expect(runPdfJob(invalidRotationJob)).rejects.toThrow(
      "invalid_options",
    );
  });

  it("rejects duplicate, non-integer, over-page, oversized plans, and too many sources", async () => {
    const source = await sample();
    const duplicate: PdfJob = {
      kind: "organize",
      source,
      plan: [
        { page: 1, rotation: 0 },
        { page: 1, rotation: 0 },
      ],
      filename: "duplicate",
    };
    await expect(runPdfJob(duplicate)).rejects.toThrow("duplicate_page");
    const nonInteger: PdfJob = {
      kind: "organize",
      source,
      plan: [{ page: 1.5, rotation: 0 }],
      filename: "non-integer",
    };
    await expect(runPdfJob(nonInteger)).rejects.toThrow("out_of_bounds");
    const overPage: PdfJob = {
      kind: "organize",
      source,
      plan: [{ page: 5, rotation: 0 }],
      filename: "over-page",
    };
    await expect(runPdfJob(overPage)).rejects.toThrow("out_of_bounds");
    const oversizedPlan: PdfJob = {
      kind: "organize",
      source,
      plan: Array.from({ length: 10_001 }, () => ({ page: 1, rotation: 0 })),
      filename: "oversized-plan",
    };
    await expect(runPdfJob(oversizedPlan)).rejects.toThrow("too_large");
    const tooManySources: PdfJob = {
      kind: "merge",
      sources: Array.from({ length: 101 }, () => source),
      filename: "too-many-sources",
    };
    await expect(runPdfJob(tooManySources)).rejects.toThrow("invalid_options");
  });

  it("rejects an illegal rotation stored in a real PDF page dictionary", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 400]);
    page.node.set(PDFName.of("Rotate"), PDFNumber.of(45));
    const source = {
      bytes: await doc.save(),
      name: "illegal-rotation.pdf",
    };
    await expect(
      runPdfJob({
        kind: "number",
        source,
        options: numberDefaults,
        filename: "illegal-rotation",
      }),
    ).rejects.toThrow("invalid_options");
  });

  it("preserves all unique long output names", async () => {
    const source = await sample();
    const result = await runPdfJob({
      kind: "split",
      source,
      ranges: "1-4",
      outputMode: "multiple",
      multipleMode: "pages",
      filename: "文".repeat(180),
    });
    if (result.kind !== "output" || !result.archive)
      throw new Error("expected archive");
    expect(new Set(result.files.map((file) => file.name)).size).toBe(4);
    expect(Object.keys(unzipSync(result.archive))).toHaveLength(4);
  });
});

describe("PDF expanded output capacity", () => {
  it.each([129, 65])(
    "rejects %i separate outputs when files or files plus ZIP exceed capacity",
    async (pageCount) => {
      const doc = await PDFDocument.create();
      // Valid no-op PDF operators share one input stream. Separate output
      // documents each need their own copy, exercising real byte expansion.
      const streamBytes = 2 * 1024 * 1024;
      const content = doc.context.register(
        doc.context.stream("q\nQ\n".repeat(streamBytes / 4)),
      );
      for (let index = 0; index < pageCount; index += 1)
        doc.addPage().node.addContentStream(content);
      const bytes = await doc.save();
      expect(bytes.length).toBeLessThan(MAX_PDF_INPUT);
      if (pageCount === 129)
        expect(pageCount * streamBytes).toBeGreaterThan(MAX_PDF_OUTPUT);
      else {
        expect(pageCount * streamBytes).toBeLessThan(MAX_PDF_OUTPUT);
        expect(2 * pageCount * streamBytes).toBeGreaterThan(MAX_PDF_OUTPUT);
      }
      await expect(
        runPdfJob({
          kind: "split",
          source: { bytes, name: "shared-content.pdf" },
          ranges: `1-${pageCount}`,
          outputMode: "multiple",
          multipleMode: "pages",
          filename: "expanded",
        }),
      ).rejects.toThrow("too_large");
    },
    30_000,
  );
});
