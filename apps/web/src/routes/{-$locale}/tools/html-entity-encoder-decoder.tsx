import { createFileRoute } from "@tanstack/react-router";
import HtmlEntityEncoderDecoder from "@/features/tools/html-entity-encoder-decoder/page";
import { htmlEntityEncoderDecoderHead } from "@/features/tools/html-entity-encoder-decoder/head";

import { HtmlEntityEncoderDecoderSkeleton } from "@/features/tools/html-entity-encoder-decoder/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/html-entity-encoder-decoder",
)({
  head: htmlEntityEncoderDecoderHead,
  pendingComponent: HtmlEntityEncoderDecoderSkeleton,
  component: HtmlEntityEncoderDecoder,
});
