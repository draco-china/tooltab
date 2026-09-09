import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { EncryptedPDFError, PDFDocument } from "@cantoo/pdf-lib";
import { MAX_PDF_INPUT, MAX_PDF_PAGES, PdfEditingError } from "./core";
export const MAX_TEXT_OUTPUT = 32 * 1024 * 1024;
export type ReadingSource = {
  bytes: Uint8Array;
  name: string;
  type?: string;
  lastModified?: number;
};
export type InfoResult = {
  kind: "info";
  file: { name: string; size: number; type: string; lastModified?: string };
  document: {
    encrypted: boolean;
    version?: string;
    pageCount?: number;
    firstPageSize?: { width: number; height: number };
  };
  metadata: Record<string, string | string[]>;
};
export function checkSource(source: ReadingSource) {
  if (!(source.bytes instanceof Uint8Array) || !source.bytes.length)
    throw new PdfEditingError("invalid_pdf");
  if (source.bytes.length > MAX_PDF_INPUT)
    throw new PdfEditingError("too_large");
}
export async function readInfo(source: ReadingSource): Promise<InfoResult> {
  checkSource(source);
  const result: InfoResult = {
    kind: "info",
    file: {
      name: source.name,
      size: source.bytes.length,
      type: source.type || "application/pdf",
      ...(source.lastModified !== undefined
        ? { lastModified: new Date(source.lastModified).toISOString() }
        : {}),
    },
    document: {
      encrypted: false,
      version: new TextDecoder()
        .decode(source.bytes.subarray(0, 32))
        .match(/%PDF-(\d+\.\d+)/)?.[1],
    },
    metadata: {},
  };
  try {
    const doc = await PDFDocument.load(source.bytes, { updateMetadata: false });
    if (doc.getPageCount() > MAX_PDF_PAGES)
      throw new PdfEditingError("too_large");
    result.document.pageCount = doc.getPageCount();
    result.document.firstPageSize = doc.getPages()[0]?.getSize();
    for (const [key, get] of Object.entries({
      title: () => doc.getTitle(),
      author: () => doc.getAuthor(),
      subject: () => doc.getSubject(),
      creator: () => doc.getCreator(),
      producer: () => doc.getProducer(),
    })) {
      const value = get()?.trim();
      if (value) result.metadata[key] = value;
    }
    const keywords = doc
      .getKeywords()
      ?.split(/[,;]/u)
      .map((s) => s.trim())
      .filter(Boolean);
    if (keywords?.length) result.metadata.keywords = keywords;
    for (const [key, get] of Object.entries({
      creationDate: () => doc.getCreationDate(),
      modificationDate: () => doc.getModificationDate(),
    })) {
      const value = get();
      if (value && !Number.isNaN(value.getTime()))
        result.metadata[key] = value.toISOString();
    }
  } catch (error) {
    if (error instanceof EncryptedPDFError) result.document.encrypted = true;
    else throw error;
  }
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_TEXT_OUTPUT)
    throw new PdfEditingError("too_large");
  return result;
}

export type TextPage = {
  pageNumber: number;
  text: string;
  characterCount: number;
  wordCount: number;
  likelyScanned: boolean;
};
export type TextResult = {
  kind: "text";
  text: string;
  pages: TextPage[];
  pageCount: number;
  characterCount: number;
  wordCount: number;
  textPages: number;
  emptyTextPages: number;
  likelyScannedPages: number;
};
export function wordCount(text: string) {
  return text.match(/\S+/gu)?.length ?? 0;
}
export async function readText(
  doc: PDFDocumentProxy,
  imageOps: ReadonlySet<number>,
  progress?: (done: number, total: number) => void,
): Promise<TextResult> {
  if (doc.numPages > MAX_PDF_PAGES) throw new PdfEditingError("too_large");
  const pages: TextPage[] = [];
  let size = 0;
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    try {
      const content = await page.getTextContent({
          disableNormalization: false,
          includeMarkedContent: false,
        }),
        parts: string[] = [];
      // PDF.js only includes TextMarkedContent when includeMarkedContent is true.
      for (const item of content.items as TextItem[]) {
        size += new TextEncoder().encode(item.str).length + 1;
        if (size > MAX_TEXT_OUTPUT) throw new PdfEditingError("too_large");
        parts.push(item.str, item.hasEOL ? "\n" : " ");
      }
      const text = parts
        .join("")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      const likelyScanned =
        !text &&
        (await page.getOperatorList()).fnArray.some((op) => imageOps.has(op));
      pages.push({
        pageNumber,
        text,
        characterCount: text.length,
        wordCount: wordCount(text),
        likelyScanned,
      });
      progress?.(pageNumber, doc.numPages);
    } finally {
      page.cleanup();
    }
  }
  const text = pages
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n\n");
  if (new TextEncoder().encode(text).length > MAX_TEXT_OUTPUT)
    throw new PdfEditingError("too_large");
  const emptyTextPages = pages.filter((p) => !p.text).length;
  return {
    kind: "text",
    text,
    pages,
    pageCount: doc.numPages,
    characterCount: text.length,
    wordCount: wordCount(text),
    emptyTextPages,
    textPages: doc.numPages - emptyTextPages,
    likelyScannedPages: pages.filter((p) => p.likelyScanned).length,
  };
}
