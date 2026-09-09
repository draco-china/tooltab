import { createFileRoute } from "@tanstack/react-router";
import PageContent from "@/features/tools/case-converter/page";
import { caseConverterHead } from "@/features/tools/case-converter/head";

import { CaseConverterRouteSkeleton } from "@/features/tools/case-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/case-converter")({
  head: caseConverterHead,
  pendingComponent: CaseConverterRouteSkeleton,
  component: PageContent,
});
