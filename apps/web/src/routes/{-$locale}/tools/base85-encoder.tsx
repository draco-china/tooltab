import { createFileRoute } from "@tanstack/react-router";
import Base85EncoderPage from "@/features/tools/base85-encoder/page";
import { base85EncoderHead } from "@/features/tools/base85-encoder/head";

import { Base85EncoderRouteSkeleton } from "@/features/tools/base85-encoder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/base85-encoder")({
  head: base85EncoderHead,
  pendingComponent: Base85EncoderRouteSkeleton,
  component: Base85EncoderPage,
});
