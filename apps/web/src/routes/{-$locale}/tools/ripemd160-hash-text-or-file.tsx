import { createFileRoute } from "@tanstack/react-router";
import Ripemd160Tool from "@/features/tools/ripemd160-hash-text-or-file/page";
import { ripemd160HashTextOrFileHead } from "@/features/tools/ripemd160-hash-text-or-file/head";

import { Ripemd160HashSkeleton } from "@/features/tools/ripemd160-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/ripemd160-hash-text-or-file",
)({
  head: ripemd160HashTextOrFileHead,
  pendingComponent: Ripemd160HashSkeleton,
  component: Ripemd160Tool,
});
