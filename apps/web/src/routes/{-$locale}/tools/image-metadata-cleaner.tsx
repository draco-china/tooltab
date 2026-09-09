import { createFileRoute } from "@tanstack/react-router";
import { ImageMetadataCleanerPage } from "@/features/tools/image-metadata-cleaner/page";
import { imageMetadataCleanerHead } from "@/features/tools/image-metadata-cleaner/head";

import { ImageMetadataCleanerRouteSkeleton } from "@/features/tools/image-metadata-cleaner/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/image-metadata-cleaner",
)({
  head: imageMetadataCleanerHead,
  pendingComponent: ImageMetadataCleanerRouteSkeleton,
  component: ImageMetadataCleanerPage,
});
