import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import {
  checkSource,
  MAX_TEXT_OUTPUT,
  readInfo,
  type ReadingSource,
} from "../../src/pdf/reading";
import { MAX_PDF_INPUT } from "../../src/pdf/core";

async function onePage() {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return doc.save();
}

describe("PDF reading metadata", () => {
  it("reads standard metadata, dates, file details, and preserves source bytes", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.setTitle("Title");
    doc.setAuthor("Author");
    doc.setSubject("Subject");
    doc.setKeywords(["one", "two"]);
    doc.setCreator("Creator");
    doc.setProducer("Producer");
    doc.setCreationDate(new Date("2020-01-02T03:04:05Z"));
    doc.setModificationDate(new Date("2021-01-02T03:04:05Z"));
    const bytes = await doc.save();
    const snapshot = bytes.slice();
    const info = await readInfo({
      bytes,
      name: "a.pdf",
      type: "application/custom-pdf",
      lastModified: 0,
    });

    expect(info).toEqual({
      kind: "info",
      file: {
        name: "a.pdf",
        size: bytes.length,
        type: "application/custom-pdf",
        lastModified: "1970-01-01T00:00:00.000Z",
      },
      document: {
        encrypted: false,
        version: "1.7",
        pageCount: 1,
        firstPageSize: { width: 612, height: 792 },
      },
      metadata: {
        title: "Title",
        author: "Author",
        subject: "Subject",
        keywords: ["one two"],
        creator: "Creator",
        producer: "Producer",
        creationDate: "2020-01-02T03:04:05.000Z",
        modificationDate: "2021-01-02T03:04:05.000Z",
      },
    });
    expect(bytes).toEqual(snapshot);
  });

  it("returns default file type and excludes unset user metadata", async () => {
    const bytes = await onePage();
    const info = await readInfo({ bytes, name: "plain.pdf" });
    expect(info.file.type).toBe("application/pdf");
    expect(info.file.lastModified).toBeUndefined();
    expect(info.metadata.title).toBeUndefined();
    expect(info.metadata.author).toBeUndefined();
    expect(info.metadata.subject).toBeUndefined();
    expect(info.metadata.keywords).toBeUndefined();
    expect(info.metadata.creator).toContain("pdf-lib");
  });

  it("omits absent dates and blank metadata without synthesizing them", async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage([120, 180]);
    doc.setTitle("   ");
    doc.setKeywords(["", " ; , "]);
    const bytes = await doc.save();
    const info = await readInfo({ bytes, name: "no-metadata.pdf" });
    expect(info.metadata).toEqual({});
    expect(info.document.firstPageSize).toEqual({ width: 120, height: 180 });
  });

  it("reports encrypted documents as a visible shell", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.setTitle("Secret");
    doc.encrypt({ userPassword: "secret", ownerPassword: "owner" });
    const info = await readInfo({
      bytes: await doc.save(),
      name: "encrypted.pdf",
    });
    expect(info.document.encrypted).toBe(true);
    expect(info.document.pageCount).toBeUndefined();
    expect(info.metadata).toEqual({});
  });
});

describe("PDF reading source and size boundaries", () => {
  it("rejects empty, non-Uint8Array, and genuinely oversized sources", () => {
    expect(() =>
      checkSource({ bytes: new Uint8Array(), name: "empty.pdf" }),
    ).toThrow("invalid_pdf");
    expect(() =>
      checkSource({
        bytes: new Uint8ClampedArray([1, 2, 3]) as never,
        name: "clamped.pdf",
      }),
    ).toThrow("invalid_pdf");
    const oversized = new Uint8Array(MAX_PDF_INPUT + 1);
    expect(() => checkSource({ bytes: oversized, name: "large.pdf" })).toThrow(
      "too_large",
    );
  }, 30_000);

  it("reports a real zero-page document and rejects more than 10000 pages", async () => {
    const empty = await PDFDocument.create();
    const zeroPageInfo = await readInfo({
      bytes: await empty.save({ addDefaultPage: false }),
      name: "zero-pages.pdf",
    });
    expect(zeroPageInfo.document.pageCount).toBe(0);
    expect(zeroPageInfo.document.firstPageSize).toBeUndefined();

    const oversized = await PDFDocument.create();
    for (let index = 0; index < 10_001; index += 1) oversized.addPage([1, 1]);
    await expect(
      readInfo({ bytes: await oversized.save(), name: "too-many-pages.pdf" }),
    ).rejects.toThrow("too_large");
  }, 30_000);

  it("enforces the 32 MiB result boundary through a long source name", async () => {
    const bytes = await onePage();
    const source: ReadingSource = {
      bytes,
      name: "x".repeat(MAX_TEXT_OUTPUT + 1),
    };
    await expect(readInfo(source)).rejects.toThrow("too_large");
  }, 30_000);

  it("rejects malformed PDF bytes", async () => {
    await expect(
      readInfo({ bytes: Uint8Array.from([1, 2, 3]), name: "bad.pdf" }),
    ).rejects.toThrow(/No PDF header found/);
  });
});
