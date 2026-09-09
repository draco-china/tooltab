import { createFileRoute } from "@tanstack/react-router";
import FaviconAssetsGeneratorPage from "@/features/tools/favicon-assets-generator/page";
import { faviconAssetsGeneratorHead } from "@/features/tools/favicon-assets-generator/head";

import { FaviconAssetsGeneratorRouteSkeleton } from "@/features/tools/favicon-assets-generator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/favicon-assets-generator",
)({
  head: faviconAssetsGeneratorHead,
  pendingComponent: FaviconAssetsGeneratorRouteSkeleton,
  component: FaviconAssetsGeneratorPage,
});
