import { createFileRoute } from "@tanstack/react-router";
import Base58DecoderPage from "@/features/tools/base58-decoder/page";
import { base58DecoderHead } from "@/features/tools/base58-decoder/head";

import { Base58DecoderSkeleton } from "@/features/tools/base58-decoder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/base58-decoder")({
  head: base58DecoderHead,
  pendingComponent: Base58DecoderSkeleton,
  component: Base58DecoderPage,
});
