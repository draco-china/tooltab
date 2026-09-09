import {
  clip,
  EncryptedPDFError,
  endPath,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from "@cantoo/pdf-lib";
import {
  MAX_PDF_INPUT,
  MAX_PDF_OUTPUT,
  MAX_PDF_PAGES,
  PdfEditingError,
} from "./core";

export const imagePageSizes = [
  "a3",
  "a4",
  "a5",
  "b5",
  "letter",
  "legal",
  "tabloid",
] as const;
export type ImagePdfOptions = {
  pageSize: (typeof imagePageSizes)[number];
  orientation: "auto" | "portrait" | "landscape";
  fit: "contain" | "cover";
  marginMm: number;
  quality: "best" | "balanced" | "small";
};
export const imagePdfDefaults: ImagePdfOptions = {
  pageSize: "a4",
  orientation: "auto",
  fit: "contain",
  marginMm: 12,
  quality: "balanced",
};
export type ImageSource = {
  bytes: Uint8Array;
  name: string;
  rotation: 0 | 90 | 180 | 270;
};
export type PreparedImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};
export type FinishingJob =
  | { kind: "images"; sources: ImageSource[]; options: ImagePdfOptions }
  | { kind: "unlock"; bytes: Uint8Array };
export type FinishingResult = {
  bytes: Uint8Array;
  pages: number;
  wasEncrypted?: boolean;
  warnings: string[];
};
export const MAX_IMAGE_PIXELS = 64_000_000,
  MAX_IMAGE_EDGE = 16384,
  MAX_IMAGE_COUNT = 1000;
const sizes = {
  a3: [841.89, 1190.55],
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  b5: [498.9, 708.66],
  letter: [612, 792],
  legal: [612, 1008],
  tabloid: [792, 1224],
} as const;
export function validateImageOptions(o: ImagePdfOptions) {
  if (
    !imagePageSizes.includes(o.pageSize) ||
    !["auto", "portrait", "landscape"].includes(o.orientation) ||
    !["contain", "cover"].includes(o.fit) ||
    !["best", "balanced", "small"].includes(o.quality) ||
    !Number.isInteger(o.marginMm) ||
    o.marginMm < 0 ||
    o.marginMm > 40
  )
    throw new PdfEditingError("invalid_options");
}
export function checkImageSize(width: number, height: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_EDGE ||
    height > MAX_IMAGE_EDGE ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new PdfEditingError("too_large");
}
export function imageLayout(o: ImagePdfOptions, width: number, height: number) {
  validateImageOptions(o);
  checkImageSize(width, height);
  const [a, b] = sizes[o.pageSize],
    landscape =
      o.orientation === "landscape" ||
      (o.orientation === "auto" && width > height),
    pageWidth = landscape ? b : a,
    pageHeight = landscape ? a : b,
    margin = (o.marginMm * 72) / 25.4,
    cw = pageWidth - 2 * margin,
    ch = pageHeight - 2 * margin,
    scale =
      o.fit === "cover"
        ? Math.max(cw / width, ch / height)
        : Math.min(cw / width, ch / height);
  return {
    pageWidth,
    pageHeight,
    margin,
    contentWidth: cw,
    contentHeight: ch,
    width: width * scale,
    height: height * scale,
    x: (pageWidth - width * scale) / 2,
    y: (pageHeight - height * scale) / 2,
  };
}
export function jpegQuality(value: ImagePdfOptions["quality"]) {
  return { best: 0.92, balanced: 0.82, small: 0.68 }[value];
}
export function imageKind(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, 32));
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes[0] === 137 && text.slice(1, 4) === "PNG") return "png";
  if (text.startsWith("GIF87a") || text.startsWith("GIF89a")) return "gif";
  if (text.startsWith("BM")) return "bmp";
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "webp";
  if (
    text.slice(4, 8) === "ftyp" &&
    (text.includes("avif") || text.includes("avis"))
  )
    return "avif";
  throw new PdfEditingError("unsupported");
}
export function checkImageSource(source: ImageSource) {
  if (!(source.bytes instanceof Uint8Array) || !source.bytes.length)
    throw new PdfEditingError("read_failed");
  if (source.bytes.length > MAX_PDF_INPUT)
    throw new PdfEditingError("too_large");
  if (![0, 90, 180, 270].includes(source.rotation))
    throw new PdfEditingError("invalid_options");
  return imageKind(source.bytes);
}
export async function imagesToPdf(
  job: Extract<FinishingJob, { kind: "images" }>,
  prepare: (source: ImageSource, quality: number) => Promise<PreparedImage>,
  progress?: (done: number, total: number) => void,
): Promise<FinishingResult> {
  validateImageOptions(job.options);
  if (!job.sources.length || job.sources.length > MAX_IMAGE_COUNT)
    throw new PdfEditingError("invalid_options");
  let input = 0;
  for (const source of job.sources) {
    checkImageSource(source);
    input += source.bytes.length;
    if (input > MAX_PDF_INPUT) throw new PdfEditingError("too_large");
  }
  const doc = await PDFDocument.create();
  let embeddedBytes = 0;
  for (const [index, source] of job.sources.entries()) {
    const image = await prepare(source, jpegQuality(job.options.quality));
    checkImageSize(image.width, image.height);
    embeddedBytes += image.bytes.length;
    if (embeddedBytes > MAX_PDF_OUTPUT) throw new PdfEditingError("too_large");
    const layout = imageLayout(job.options, image.width, image.height),
      embedded = await doc.embedJpg(image.bytes),
      page = doc.addPage([layout.pageWidth, layout.pageHeight]);
    page.pushOperators(
      pushGraphicsState(),
      rectangle(
        layout.margin,
        layout.margin,
        layout.contentWidth,
        layout.contentHeight,
      ),
      clip(),
      endPath(),
    );
    page.drawImage(embedded, {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    });
    page.pushOperators(popGraphicsState());
    progress?.(index + 1, job.sources.length);
  }
  const bytes = await doc.save();
  if (bytes.length > MAX_PDF_OUTPUT) throw new PdfEditingError("too_large");
  return {
    bytes,
    pages: job.sources.length,
    warnings: ["jpeg_reencoded", "white_background", "first_animation_frame"],
  };
}
export type Qpdf = {
  callMain: (args: string[]) => number;
  FS: {
    writeFile: (path: string, bytes: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
    unlink: (path: string) => void;
  };
};
export async function removeOwnerProtection(
  bytes: Uint8Array,
  create: () => Promise<Qpdf>,
): Promise<FinishingResult> {
  if (!bytes.length) throw new PdfEditingError("invalid_pdf");
  if (bytes.length > MAX_PDF_INPUT) throw new PdfEditingError("too_large");
  let encrypted = false;
  try {
    await PDFDocument.load(bytes, { updateMetadata: false, preserveXFA: true });
  } catch (error) {
    if (error instanceof EncryptedPDFError) encrypted = true;
    else throw new PdfEditingError("invalid_pdf");
  }
  const q = await create();
  try {
    q.FS.writeFile("/input.pdf", bytes);
    const needs = q.callMain(["--requires-password", "/input.pdf"]);
    if (needs === 0 || (encrypted && needs !== 3))
      throw new PdfEditingError("encrypted_pdf");
    if (needs !== 2 && needs !== 3) throw new PdfEditingError("invalid_pdf");
    const code = q.callMain(["--decrypt", "/input.pdf", "/output.pdf"]);
    if (code !== 0) throw new PdfEditingError("invalid_pdf");
    const output = q.FS.readFile("/output.pdf");
    if (output.length > MAX_PDF_OUTPUT) throw new PdfEditingError("too_large");
    if (
      q.callMain(["--is-encrypted", "/output.pdf"]) !== 2 ||
      q.callMain(["--check", "/output.pdf"]) !== 0
    )
      throw new PdfEditingError("invalid_pdf");
    const result = new Uint8Array(output),
      doc = await PDFDocument.load(result, {
        updateMetadata: false,
        preserveXFA: true,
      }).catch(() => {
        throw new PdfEditingError("invalid_pdf");
      });
    if (doc.getPageCount() > MAX_PDF_PAGES)
      throw new PdfEditingError("too_large");
    return {
      bytes: result,
      pages: doc.getPageCount(),
      wasEncrypted: needs === 3,
      warnings: [
        "signatures_invalidated",
        ...(needs === 2 ? ["already_unrestricted"] : []),
      ],
    };
  } finally {
    for (const path of ["/input.pdf", "/output.pdf"])
      try {
        q.FS.unlink(path);
      } catch {}
  }
}
export function qpdfRuntime(value: unknown): Qpdf {
  const valid = (module: unknown): module is Qpdf => {
    if (
      !module ||
      typeof module !== "object" ||
      !("callMain" in module) ||
      typeof module.callMain !== "function" ||
      !("FS" in module) ||
      !module.FS ||
      typeof module.FS !== "object"
    )
      return false;
    const fs = module.FS;
    return ["writeFile", "readFile", "unlink"].every(
      (key) => key in fs && typeof Reflect.get(fs, key) === "function",
    );
  };
  if (!valid(value)) throw new PdfEditingError("unsupported");
  return value;
}
