import { createFileRoute } from "@tanstack/react-router";
import PdfPageOrganizerPage from "@/features/tools/pdf-page-organizer/page";
import { pdfPageOrganizerHead } from "@/features/tools/pdf-page-organizer/head";

import { PdfPageOrganizerSkeleton } from "@/features/tools/pdf-page-organizer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/pdf-page-organizer")({
  head: pdfPageOrganizerHead,
  pendingComponent: PdfPageOrganizerSkeleton,
  component: PdfPageOrganizerPage,
});
