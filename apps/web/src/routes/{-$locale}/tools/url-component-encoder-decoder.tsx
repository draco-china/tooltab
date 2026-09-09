import { createFileRoute } from "@tanstack/react-router";
import UrlEncoderDecoder from "@/features/tools/url-component-encoder-decoder/page";
import { urlComponentEncoderDecoderHead } from "@/features/tools/url-component-encoder-decoder/head";

import { UrlComponentEncoderDecoderSkeleton } from "@/features/tools/url-component-encoder-decoder/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/url-component-encoder-decoder",
)({
  head: urlComponentEncoderDecoderHead,
  pendingComponent: UrlComponentEncoderDecoderSkeleton,
  component: UrlEncoderDecoder,
});
