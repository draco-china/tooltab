import { createFileRoute } from "@tanstack/react-router";
import BasicAuthDecoderPage from "@/features/tools/basic-auth-decoder/page";
import { basicAuthDecoderHead } from "@/features/tools/basic-auth-decoder/head";

import { BasicAuthDecoderRouteSkeleton } from "@/features/tools/basic-auth-decoder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/basic-auth-decoder")({
  head: basicAuthDecoderHead,
  pendingComponent: BasicAuthDecoderRouteSkeleton,
  component: BasicAuthDecoderPage,
});
