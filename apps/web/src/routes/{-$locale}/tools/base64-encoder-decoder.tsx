import { createFileRoute } from "@tanstack/react-router";
import Base64EncoderDecoderPage from "@/features/tools/base64-encoder-decoder/page";
import { base64EncoderDecoderHead } from "@/features/tools/base64-encoder-decoder/head";

import { Base64EncoderDecoderSkeleton } from "@/features/tools/base64-encoder-decoder/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/base64-encoder-decoder",
)({
  head: base64EncoderDecoderHead,
  pendingComponent: Base64EncoderDecoderSkeleton,
  component: Base64EncoderDecoderPage,
});
