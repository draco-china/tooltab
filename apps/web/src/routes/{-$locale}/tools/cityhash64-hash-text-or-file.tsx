import { createFileRoute } from "@tanstack/react-router";
import CityPage from "@/features/tools/cityhash64-hash-text-or-file/page";
import { cityhash64HashTextOrFileHead } from "@/features/tools/cityhash64-hash-text-or-file/head";

import { CityHash64RouteSkeleton } from "@/features/tools/cityhash64-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/cityhash64-hash-text-or-file",
)({
  head: cityhash64HashTextOrFileHead,
  pendingComponent: CityHash64RouteSkeleton,
  component: CityPage,
});
