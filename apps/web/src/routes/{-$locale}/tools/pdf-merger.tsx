import { createFileRoute } from "@tanstack/react-router";
import PdfMergerPage from "@/features/tools/pdf-merger/page";
import { pdfMergerHead } from "@/features/tools/pdf-merger/head";

import { PdfMergerSkeleton } from "@/features/tools/pdf-merger/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/pdf-merger")({
  head: pdfMergerHead,
  pendingComponent: PdfMergerSkeleton,
  component: PdfMergerPage,
});
