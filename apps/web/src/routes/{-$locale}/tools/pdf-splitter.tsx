import { createFileRoute } from "@tanstack/react-router";
import PdfSplitterPage from "@/features/tools/pdf-splitter/page";
import { pdfSplitterHead } from "@/features/tools/pdf-splitter/head";

import { PdfSplitterSkeleton } from "@/features/tools/pdf-splitter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/pdf-splitter")({
  head: pdfSplitterHead,
  pendingComponent: PdfSplitterSkeleton,
  component: PdfSplitterPage,
});
