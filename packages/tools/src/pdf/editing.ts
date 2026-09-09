import {
  degrees,
  PDFDocument,
  PDFName,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib";
import { zipSync } from "fflate";
import {
  MAX_PDF_INPUT,
  checkOutput,
  MAX_PDF_PAGES,
  PdfEditingError,
  pageRanges,
  pdfFilename,
} from "./core";
import {
  type NumberOptions,
  numberOptions,
  numberPlacement,
} from "./numbering";

export type PdfSource = { bytes: Uint8Array; name: string };
export type PdfPagePlan = { page: number; rotation: number };
export type PdfInfo = {
  kind: "info";
  pages: { page: number; width: number; height: number; rotation: number }[];
  warnings: string[];
};
export type PdfFile = { name: string; bytes: Uint8Array; pages: number };
export type PdfOutput = {
  kind: "output";
  files: PdfFile[];
  archive: Uint8Array | null;
  warnings: string[];
};
export type PdfJob =
  | { kind: "inspect"; source: PdfSource }
  | { kind: "merge"; sources: PdfSource[]; filename: string }
  | {
      kind: "split";
      source: PdfSource;
      ranges: string;
      outputMode: "single" | "multiple";
      multipleMode: "ranges" | "pages";
      filename: string;
    }
  | {
      kind: "organize";
      source: PdfSource;
      plan: PdfPagePlan[];
      filename: string;
    }
  | {
      kind: "number";
      source: PdfSource;
      options: NumberOptions;
      filename: string;
    };
async function load(source: PdfSource) {
  if (!source.bytes.length) throw new PdfEditingError("invalid_pdf");
  if (source.bytes.length > MAX_PDF_INPUT)
    throw new PdfEditingError("too_large");
  try {
    const doc = await PDFDocument.load(source.bytes, {
      // Loading rejects encrypted documents before returning a document.
      ignoreEncryption: false,
      updateMetadata: false,
      preserveXFA: true,
    });
    if (doc.getPageCount() < 1) throw new PdfEditingError("invalid_pdf");
    if (doc.getPageCount() > MAX_PDF_PAGES)
      throw new PdfEditingError("too_large");
    return doc;
  } catch (e) {
    if (e instanceof PdfEditingError) throw e;
    throw new PdfEditingError(
      e instanceof Error && /encrypt|password/i.test(e.name + e.message)
        ? "encrypted_pdf"
        : "invalid_pdf",
    );
  }
}
function structures(doc: PDFDocument) {
  const warnings: string[] = [];
  for (const [name, warning] of [
    ["AcroForm", "forms"],
    ["Outlines", "bookmarks"],
    ["Names", "named_resources"],
    ["StructTreeRoot", "tagged_structure"],
    ["OCProperties", "layers"],
  ])
    if (doc.catalog.has(PDFName.of(name))) warnings.push(warning);
  return warnings;
}
export async function inspectPdf(source: PdfSource): Promise<PdfInfo> {
  const doc = await load(source);
  return {
    kind: "info",
    pages: doc.getPages().map((p, i) => ({
      page: i + 1,
      width: p.getWidth(),
      height: p.getHeight(),
      rotation: ((p.getRotation().angle % 360) + 360) % 360,
    })),
    warnings: structures(doc),
  };
}
async function numbered(doc: PDFDocument, options: NumberOptions) {
  const o = numberOptions(options),
    selection = pageRanges(o.pages, doc.getPageCount(), true).pages,
    font = await doc.embedFont(
      o.fontFamily === "serif"
        ? StandardFonts.TimesRoman
        : StandardFonts.Helvetica,
    );
  for (const [index, n] of selection.entries()) {
    const page = doc.getPage(n - 1),
      text =
        o.format === "number"
          ? String(o.startNumber + index)
          : `${o.startNumber + index}/${doc.getPageCount()}`,
      box = page.getCropBox(),
      r = ((page.getRotation().angle % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(r))
      throw new PdfEditingError("invalid_options");
    const width = r % 180 ? box.height : box.width,
      height = r % 180 ? box.width : box.height,
      pos = numberPlacement(
        width,
        height,
        font.widthOfTextAtSize(text, o.fontSize),
        o,
      );
    // Map visible crop-box coordinates back into unrotated PDF coordinates.
    const mapped =
      r === 90
        ? { x: box.x + box.width - pos.y, y: box.y + pos.x }
        : r === 180
          ? { x: box.x + box.width - pos.x, y: box.y + box.height - pos.y }
          : r === 270
            ? { x: box.x + pos.y, y: box.y + box.height - pos.x }
            : { x: box.x + pos.x, y: box.y + pos.y };
    page.drawText(text, {
      ...mapped,
      font,
      size: o.fontSize,
      color: rgb(0, 0, 0),
      rotate: degrees(r),
    });
  }
  return doc.save({ updateFieldAppearances: false });
}
export async function runPdfJob(
  job: PdfJob,
  onProgress?: (done: number, total: number) => void,
): Promise<PdfInfo | PdfOutput> {
  if (job.kind === "inspect") return inspectPdf(job.source);
  const files: PdfFile[] = [],
    warnings = new Set<string>([
      "signatures_invalidated",
      "not_secure_redaction",
    ]);
  let totalOutput = 0;
  const add = async (doc: PDFDocument, name: string) => {
    const bytes = await doc.save({ updateFieldAppearances: false });
    totalOutput += bytes.length;
    checkOutput(totalOutput);
    files.push({ name: pdfFilename(name), bytes, pages: doc.getPageCount() });
  };
  const copy = async (
    source: PDFDocument,
    pages: number[],
    name: string,
    rotations?: number[],
  ) => {
    const target = await PDFDocument.create();
    const copied = await target.copyPages(
      source,
      pages.map((p) => p - 1),
    );
    for (const [i, page] of copied.entries()) {
      if (rotations) page.setRotation(degrees(rotations[i]));
      target.addPage(page);
    }
    for (const w of structures(source)) warnings.add(`${w}_not_copied`);
    await add(target, name);
  };
  if (job.kind === "merge") {
    if (job.sources.length < 2 || job.sources.length > 100)
      throw new PdfEditingError("invalid_options");
    if (job.sources.reduce((n, s) => n + s.bytes.length, 0) > MAX_PDF_INPUT)
      throw new PdfEditingError("too_large");
    const target = await PDFDocument.create();
    let pageCount = 0;
    for (const [index, source] of job.sources.entries()) {
      const doc = await load(source);
      pageCount += doc.getPageCount();
      if (pageCount > MAX_PDF_PAGES) throw new PdfEditingError("too_large");
      for (const page of await target.copyPages(doc, doc.getPageIndices()))
        target.addPage(page);
      for (const w of structures(doc)) warnings.add(`${w}_not_copied`);
      onProgress?.(index + 1, job.sources.length);
    }
    await add(target, job.filename);
  } else {
    const doc = await load(job.source);
    if (job.kind === "number") {
      const bytes = await numbered(doc, job.options);
      checkOutput(bytes.length);
      files.push({
        name: pdfFilename(job.filename),
        bytes,
        pages: doc.getPageCount(),
      });
      for (const w of structures(doc))
        warnings.add(`${w}_retained_not_fully_validated`);
    } else if (job.kind === "organize") {
      if (!job.plan.length) throw new PdfEditingError("empty_selection");
      if (job.plan.length > MAX_PDF_PAGES)
        throw new PdfEditingError("too_large");
      const seen = new Set<number>();
      for (const p of job.plan) {
        if (
          !Number.isInteger(p.page) ||
          p.page < 1 ||
          p.page > doc.getPageCount()
        )
          throw new PdfEditingError("out_of_bounds");
        if (seen.has(p.page)) throw new PdfEditingError("duplicate_page");
        seen.add(p.page);
        if (![0, 90, 180, 270].includes(p.rotation))
          throw new PdfEditingError("invalid_options");
      }
      await copy(
        doc,
        job.plan.map((p) => p.page),
        job.filename,
        job.plan.map((p) => p.rotation),
      );
    } else {
      const selection = pageRanges(job.ranges, doc.getPageCount());
      if (job.outputMode === "single")
        await copy(doc, selection.pages, job.filename);
      else {
        const chunks =
            job.multipleMode === "ranges"
              ? selection.segments
              : selection.pages.map((p) => [p]),
          // Spread preserves Unicode code points when truncating the filename.
          base = [...pdfFilename(job.filename).slice(0, -4)]
            .slice(0, 140)
            .join("");
        for (const [i, pages] of chunks.entries())
          await copy(
            doc,
            pages,
            `${base}-${job.multipleMode === "ranges" ? "part" : "page"}-${String(job.multipleMode === "ranges" ? i + 1 : pages[0]).padStart(2, "0")}.pdf`,
          );
      }
    }
  }
  let archive: Uint8Array | null = null;
  if (files.length > 1) {
    archive = zipSync(Object.fromEntries(files.map((f) => [f.name, f.bytes])), {
      level: 0,
    });
    checkOutput(archive.length + totalOutput);
  }
  return { kind: "output", files, archive, warnings: [...warnings] };
}
