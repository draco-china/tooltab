import { createFileRoute } from "@tanstack/react-router";
import WhirlpoolHashTextOrFilePage from "@/features/tools/whirlpool-hash-text-or-file/page";
import { whirlpoolHashTextOrFileHead } from "@/features/tools/whirlpool-hash-text-or-file/head";

import { WhirlpoolHashTextOrFileRouteSkeleton } from "@/features/tools/whirlpool-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/whirlpool-hash-text-or-file",
)({
  head: whirlpoolHashTextOrFileHead,
  pendingComponent: WhirlpoolHashTextOrFileRouteSkeleton,
  component: WhirlpoolHashTextOrFilePage,
});
