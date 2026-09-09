import { createFileRoute } from "@tanstack/react-router";
import JwtSignerTool from "@/features/tools/jwt-signer/page";
import { jwtSignerHead } from "@/features/tools/jwt-signer/head";

import { JwtSignerSkeleton } from "@/features/tools/jwt-signer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/jwt-signer")({
  head: jwtSignerHead,
  pendingComponent: JwtSignerSkeleton,
  component: JwtSignerTool,
});
