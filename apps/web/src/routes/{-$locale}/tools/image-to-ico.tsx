import { createFileRoute } from "@tanstack/react-router";
import ImageToIcoPage from "@/features/tools/image-formats/ico-page";
import { imageToIcoHead } from "@/features/tools/image-formats/head";

import { ImageToIcoRouteSkeleton } from "@/features/tools/image-formats/ico-skeleton";

export const Route = createFileRoute("/{-$locale}/tools/image-to-ico")({
  head: imageToIcoHead,
  pendingComponent: ImageToIcoRouteSkeleton,
  component: ImageToIcoPage,
});
