import { createFileRoute } from "@tanstack/react-router";
import AudioRecorderPage from "@/features/tools/audio-recorder/page";
import { audioRecorderHead } from "@/features/tools/audio-recorder/head";

import { AudioRecorderRouteSkeleton } from "@/features/tools/audio-recorder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/audio-recorder")({
  head: audioRecorderHead,
  pendingComponent: AudioRecorderRouteSkeleton,
  component: AudioRecorderPage,
});
