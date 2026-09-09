import { createFileRoute } from "@tanstack/react-router";
import GifToApngConverterPage from "@/features/tools/gif-to-apng-converter/page";
import { gifToApngConverterHead } from "@/features/tools/gif-to-apng-converter/head";

import { GifToApngConverterRouteSkeleton } from "@/features/tools/gif-to-apng-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/gif-to-apng-converter")(
  {
    head: gifToApngConverterHead,
    pendingComponent: GifToApngConverterRouteSkeleton,
    component: GifToApngConverterPage,
  },
);
