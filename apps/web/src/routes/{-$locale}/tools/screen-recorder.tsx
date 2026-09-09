import { createFileRoute } from "@tanstack/react-router";
import ScreenRecorder from "@/features/tools/screen-recorder/page";
import { screenRecorderHead } from "@/features/tools/screen-recorder/head";

import { ScreenRecorderSkeleton } from "@/features/tools/screen-recorder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/screen-recorder")({
  head: screenRecorderHead,
  pendingComponent: ScreenRecorderSkeleton,
  component: ScreenRecorder,
});
