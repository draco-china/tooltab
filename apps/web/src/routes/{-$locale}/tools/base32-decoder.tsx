import { createFileRoute } from "@tanstack/react-router";
import Base32DecoderPage from "@/features/tools/base32-decoder/page";
import { base32DecoderHead } from "@/features/tools/base32-decoder/head";

import { Base32DecoderSkeleton } from "@/features/tools/base32-decoder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/base32-decoder")({
  head: base32DecoderHead,
  pendingComponent: Base32DecoderSkeleton,
  component: Base32DecoderPage,
});
