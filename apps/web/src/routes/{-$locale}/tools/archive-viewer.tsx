import { createFileRoute } from "@tanstack/react-router";
import ArchiveViewerPage from "@/features/tools/archive-viewer/page";
import { archiveViewerHead } from "@/features/tools/archive-viewer/head";

import { ArchiveViewerRouteSkeleton } from "@/features/tools/archive-viewer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/archive-viewer")({
  head: archiveViewerHead,
  pendingComponent: ArchiveViewerRouteSkeleton,
  component: ArchiveViewerPage,
});
