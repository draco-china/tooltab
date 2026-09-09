import { createFileRoute } from "@tanstack/react-router";
import ImageToAvifPage from "@/features/tools/image-formats/avif-page";
import { imageToAvifConverterHead } from "@/features/tools/image-formats/head";

import { ImageToAvifRouteSkeleton } from "@/features/tools/image-formats/avif-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/image-to-avif-converter",
)({
  head: imageToAvifConverterHead,
  pendingComponent: ImageToAvifRouteSkeleton,
  component: ImageToAvifPage,
});
