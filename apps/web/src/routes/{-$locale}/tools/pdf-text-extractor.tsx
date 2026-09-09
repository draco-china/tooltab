import { createFileRoute } from "@tanstack/react-router";
import { PdfReadingRouteSkeleton } from "@/features/tools/pdf-reading/skeleton";
import PdfTextPage from "@/features/tools/pdf-reading/text-page";
import { pdfTextExtractorHead } from "@/features/tools/pdf-reading/head";

export const Route = createFileRoute("/{-$locale}/tools/pdf-text-extractor")({
  head: pdfTextExtractorHead,
  pendingComponent: PdfReadingRouteSkeleton,
  component: PdfTextPage,
});
