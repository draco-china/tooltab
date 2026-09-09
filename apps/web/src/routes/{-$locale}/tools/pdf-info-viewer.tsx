import { createFileRoute } from "@tanstack/react-router";
import PdfInfoPage from "@/features/tools/pdf-reading/info-page";
import { pdfInfoViewerHead } from "@/features/tools/pdf-reading/head";

import { PdfReadingRouteSkeleton } from "@/features/tools/pdf-reading/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/pdf-info-viewer")({
  head: pdfInfoViewerHead,
  pendingComponent: PdfReadingRouteSkeleton,
  component: PdfInfoPage,
});
