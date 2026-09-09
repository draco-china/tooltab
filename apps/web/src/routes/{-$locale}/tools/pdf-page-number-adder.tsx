import { createFileRoute } from "@tanstack/react-router";
import PdfPageNumberAdderPage from "@/features/tools/pdf-page-number-adder/page";
import { pdfPageNumberAdderHead } from "@/features/tools/pdf-page-number-adder/head";

import { PdfPageNumberAdderSkeleton } from "@/features/tools/pdf-page-number-adder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/pdf-page-number-adder")(
  {
    head: pdfPageNumberAdderHead,
    pendingComponent: PdfPageNumberAdderSkeleton,
    component: PdfPageNumberAdderPage,
  },
);
