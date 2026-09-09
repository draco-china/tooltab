import { createFileRoute } from "@tanstack/react-router";
import MorseCodeConverterPage from "@/features/tools/morse-code-converter/page";
import { morseCodeConverterHead } from "@/features/tools/morse-code-converter/head";

import { MorseCodeConverterRouteSkeleton } from "@/features/tools/morse-code-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/morse-code-converter")({
  head: morseCodeConverterHead,
  pendingComponent: MorseCodeConverterRouteSkeleton,
  component: MorseCodeConverterPage,
});
