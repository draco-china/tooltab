import { createFileRoute } from "@tanstack/react-router";
import HighwayHashTextOrFile from "@/features/tools/highwayhash-hash-text-or-file/page";
import { highwayhashHashTextOrFileHead } from "@/features/tools/highwayhash-hash-text-or-file/head";

import { HighwayHashTextOrFileSkeleton } from "@/features/tools/highwayhash-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/highwayhash-hash-text-or-file",
)({
  head: highwayhashHashTextOrFileHead,
  pendingComponent: HighwayHashTextOrFileSkeleton,
  component: HighwayHashTextOrFile,
});
