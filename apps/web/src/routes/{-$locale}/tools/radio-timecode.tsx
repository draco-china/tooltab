import { createFileRoute } from "@tanstack/react-router";
import RadioTimecode from "@/features/tools/radio-timecode/page";
import { radioTimecodeHead } from "@/features/tools/radio-timecode/head";

import { RadioTimecodeSkeleton } from "@/features/tools/radio-timecode/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/radio-timecode")({
  head: radioTimecodeHead,
  pendingComponent: RadioTimecodeSkeleton,
  component: RadioTimecode,
});
