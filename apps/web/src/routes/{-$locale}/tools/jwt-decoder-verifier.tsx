import { createFileRoute } from "@tanstack/react-router";
import JwtDecoderVerifierPage from "@/features/tools/jwt-decoder-verifier/page";
import { jwtDecoderVerifierHead } from "@/features/tools/jwt-decoder-verifier/head";

import { JwtDecoderVerifierSkeleton } from "@/features/tools/jwt-decoder-verifier/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/jwt-decoder-verifier")({
  head: jwtDecoderVerifierHead,
  pendingComponent: JwtDecoderVerifierSkeleton,
  component: JwtDecoderVerifierPage,
});
