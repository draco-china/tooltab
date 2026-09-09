import { createFileRoute } from "@tanstack/react-router";
import { ImageToPdfConverter } from "@/features/tools/image-to-pdf-converter/page";
import { imageToPdfConverterHead } from "@/features/tools/image-to-pdf-converter/head";

import { ImageToPdfConverterSkeleton } from "@/features/tools/image-to-pdf-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/image-to-pdf-converter",
)({
  head: imageToPdfConverterHead,
  pendingComponent: ImageToPdfConverterSkeleton,
  component: ImageToPdfConverter,
});
