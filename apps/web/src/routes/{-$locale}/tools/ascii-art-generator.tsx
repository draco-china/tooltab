import { createFileRoute } from "@tanstack/react-router";
import AsciiArtGeneratorPage from "@/features/tools/ascii-art-generator/page";
import { asciiArtGeneratorHead } from "@/features/tools/ascii-art-generator/head";

import { AsciiArtGeneratorRouteSkeleton } from "@/features/tools/ascii-art-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/ascii-art-generator")({
  head: asciiArtGeneratorHead,
  pendingComponent: AsciiArtGeneratorRouteSkeleton,
  component: AsciiArtGeneratorPage,
});
