import { createFileRoute } from "@tanstack/react-router";
import CameraPage from "@/features/tools/camera/page";
import { cameraHead } from "@/features/tools/camera/head";

import { CameraRouteSkeleton } from "@/features/tools/camera/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/camera")({
  head: cameraHead,
  pendingComponent: CameraRouteSkeleton,
  component: CameraPage,
});
