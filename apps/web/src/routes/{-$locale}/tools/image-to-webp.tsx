import { createFileRoute } from "@tanstack/react-router";
import ImageToWebpPage from "@/features/tools/image-to-webp/page";
import { imageToWebpHead } from "@/features/tools/image-to-webp/head";

import { ImageToWebpRouteSkeleton } from "@/features/tools/image-to-webp/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/image-to-webp")({
  head: imageToWebpHead,
  pendingComponent: ImageToWebpRouteSkeleton,
  component: ImageToWebpPage,
});
