import { createFileRoute } from "@tanstack/react-router";
import Base85DecoderPage from "@/features/tools/base85-decoder/page";
import { base85DecoderHead } from "@/features/tools/base85-decoder/head";

import { Base85DecoderSkeleton } from "@/features/tools/base85-decoder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/base85-decoder")({
  head: base85DecoderHead,
  pendingComponent: Base85DecoderSkeleton,
  component: Base85DecoderPage,
});
