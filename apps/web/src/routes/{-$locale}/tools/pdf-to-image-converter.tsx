import { createFileRoute } from "@tanstack/react-router";
import PdfImagePage from "@/features/tools/pdf-reading/image-page";
import { pdfToImageConverterHead } from "@/features/tools/pdf-reading/head";

import { PdfReadingRouteSkeleton } from "@/features/tools/pdf-reading/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/pdf-to-image-converter",
)({
  head: pdfToImageConverterHead,
  pendingComponent: PdfReadingRouteSkeleton,
  component: PdfImagePage,
});
