import { zipSync } from "fflate";
import type { PDFDocumentLoadingTask, PDFPageProxy } from "pdfjs-dist";
import { PdfEditingError } from "@workspace/tools/pdf/core";
import type { ImageFile, ReadingJob, ReadingResult } from "./types";
import { checkOutput, outputName } from "@workspace/tools/pdf/core";
import { checkSource, readInfo, readText } from "@workspace/tools/pdf/reading";
import { imagePages } from "@workspace/tools/pdf/rendering";
export type PdfRuntime = {
  pack?: (
    files: ImageFile[],
  ) => Promise<{ files: ImageFile[]; archive: Uint8Array | null }>;
  load: (bytes: Uint8Array) => PDFDocumentLoadingTask;
  imageOps: ReadonlySet<number>;
  render: (
    page: PDFPageProxy,
    job: Extract<ReadingJob, { kind: "image" }>,
  ) => Promise<{ bytes: Uint8Array; width: number; height: number }>;
};
export async function runReading(
  job: ReadingJob,
  runtime: PdfRuntime,
  progress?: (done: number, total: number) => void,
): Promise<ReadingResult> {
  checkSource(job.source);
  if (job.kind === "info") return readInfo(job.source);
  const loading = runtime.load(job.source.bytes);
  try {
    const doc = await loading.promise;
    if (job.kind === "text")
      return await readText(doc, runtime.imageOps, progress);
    const selected = imagePages(job, doc.numPages),
      files: ImageFile[] = [];
    let total = 0;
    for (const [index, pageNumber] of selected.entries()) {
      const page = await doc.getPage(pageNumber);
      try {
        const result = await runtime.render(page, job);
        total += result.bytes.length;
        checkOutput(total);
        files.push({
          ...result,
          page: pageNumber,
          name: outputName(
            job.source.name,
            `page-${String(pageNumber).padStart(4, "0")}.${job.format === "jpeg" ? "jpg" : job.format}`,
          ),
        });
        progress?.(index + 1, selected.length);
      } finally {
        page.cleanup();
      }
    }
    const packed = runtime.pack
      ? await runtime.pack(files)
      : {
          files,
          archive:
            files.length > 1
              ? zipSync(
                  Object.fromEntries(
                    files.map((file) => [file.name, file.bytes]),
                  ),
                  { level: 0 },
                )
              : null,
        };
    const archive = packed.archive;
    checkOutput(total + (archive?.length ?? 0));
    return {
      kind: "image",
      files: packed.files,
      archive,
      pageCount: doc.numPages,
      format: job.format,
      dpi: job.dpi,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException")
      throw new PdfEditingError("encrypted_pdf");
    throw error;
  } finally {
    await loading.destroy();
  }
}
