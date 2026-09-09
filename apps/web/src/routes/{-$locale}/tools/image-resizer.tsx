import { createFileRoute } from "@tanstack/react-router";
import ImageResizer from "@/features/tools/image-resizer/page";
import { imageResizerHead } from "@/features/tools/image-resizer/head";

import { ImageResizerRouteSkeleton } from "@/features/tools/image-resizer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/image-resizer")({
  head: imageResizerHead,
  pendingComponent: ImageResizerRouteSkeleton,
  component: ImageResizer,
});
