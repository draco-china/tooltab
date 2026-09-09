import { createFileRoute } from "@tanstack/react-router";
import Base16EncoderPage from "@/features/tools/base16-encoder/page";
import { base16EncoderHead } from "@/features/tools/base16-encoder/head";

import { Base16EncoderRouteSkeleton } from "@/features/tools/base16-encoder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/base16-encoder")({
  head: base16EncoderHead,
  pendingComponent: Base16EncoderRouteSkeleton,
  component: Base16EncoderPage,
});
