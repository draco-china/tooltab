import { createFileRoute } from "@tanstack/react-router";
import Base58EncoderPage from "@/features/tools/base58-encoder/page";
import { base58EncoderHead } from "@/features/tools/base58-encoder/head";

import { Base58EncoderSkeleton } from "@/features/tools/base58-encoder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/base58-encoder")({
  head: base58EncoderHead,
  pendingComponent: Base58EncoderSkeleton,
  component: Base58EncoderPage,
});
