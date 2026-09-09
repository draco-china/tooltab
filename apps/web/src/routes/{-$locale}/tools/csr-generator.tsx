import { createFileRoute } from "@tanstack/react-router";
import CsrGeneratorPage from "@/features/tools/csr-generator/page";
import { csrGeneratorHead } from "@/features/tools/csr-generator/head";

import { CsrGeneratorSkeleton } from "@/features/tools/csr-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/csr-generator")({
  head: csrGeneratorHead,
  pendingComponent: CsrGeneratorSkeleton,
  component: CsrGeneratorPage,
});
