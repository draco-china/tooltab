import { createFileRoute } from "@tanstack/react-router";
import { UuidDecoderRouteSkeleton } from "@/features/tools/uuid-decoder/skeleton";
import { UuidDecoder } from "@/features/tools/uuid-inspector/page";
import { uuidDecoderHead } from "@/features/tools/uuid-inspector/head";

export const Route = createFileRoute("/{-$locale}/tools/uuid-decoder")({
  head: uuidDecoderHead,
  pendingComponent: UuidDecoderRouteSkeleton,
  component: UuidDecoder,
});
