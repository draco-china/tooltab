import { createFileRoute } from "@tanstack/react-router";
import Base32EncoderPage from "@/features/tools/base32-encoder/page";
import { base32EncoderHead } from "@/features/tools/base32-encoder/head";

import { Base32EncoderRouteSkeleton } from "@/features/tools/base32-encoder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/base32-encoder")({
  head: base32EncoderHead,
  pendingComponent: Base32EncoderRouteSkeleton,
  component: Base32EncoderPage,
});
