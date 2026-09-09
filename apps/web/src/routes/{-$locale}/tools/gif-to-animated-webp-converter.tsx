import { createFileRoute } from "@tanstack/react-router";
import GifToAnimatedWebpConverterPage from "@/features/tools/gif-to-animated-webp-converter/page";
import { gifToAnimatedWebpConverterHead } from "@/features/tools/gif-to-animated-webp-converter/head";

import { GifToAnimatedWebpConverterRouteSkeleton } from "@/features/tools/gif-to-animated-webp-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/gif-to-animated-webp-converter",
)({
  head: gifToAnimatedWebpConverterHead,
  pendingComponent: GifToAnimatedWebpConverterRouteSkeleton,
  component: GifToAnimatedWebpConverterPage,
});
