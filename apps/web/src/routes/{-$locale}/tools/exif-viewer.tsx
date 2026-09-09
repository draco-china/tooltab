import { createFileRoute } from "@tanstack/react-router";
import { ExifViewerPage } from "@/features/tools/exif-viewer/page";
import { exifViewerHead } from "@/features/tools/exif-viewer/head";

import { ExifViewerRouteSkeleton } from "@/features/tools/exif-viewer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/exif-viewer")({
  head: exifViewerHead,
  pendingComponent: ExifViewerRouteSkeleton,
  component: ExifViewerPage,
});
