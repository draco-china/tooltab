import { createFileRoute } from "@tanstack/react-router";
import PaletteExtractorPage from "@/features/tools/palette-extractor/page";
import { paletteExtractorHead } from "@/features/tools/palette-extractor/head";

import { PaletteExtractorRouteSkeleton } from "@/features/tools/palette-extractor/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/palette-extractor")({
  head: paletteExtractorHead,
  pendingComponent: PaletteExtractorRouteSkeleton,
  component: PaletteExtractorPage,
});
