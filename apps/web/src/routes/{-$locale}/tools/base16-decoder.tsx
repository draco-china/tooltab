import { createFileRoute } from "@tanstack/react-router";
import Base16DecoderPage from "@/features/tools/base16-decoder/page";
import { base16DecoderHead } from "@/features/tools/base16-decoder/head";

import { Base16DecoderSkeleton } from "@/features/tools/base16-decoder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/base16-decoder")({
  head: base16DecoderHead,
  pendingComponent: Base16DecoderSkeleton,
  component: Base16DecoderPage,
});
