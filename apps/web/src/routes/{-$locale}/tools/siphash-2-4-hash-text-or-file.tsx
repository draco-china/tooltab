import { createFileRoute } from "@tanstack/react-router";
import SipHash64Tool from "@/features/tools/siphash/page";
import { siphash24HashTextOrFileHead } from "@/features/tools/siphash/head";

import { SipHashRouteSkeleton } from "@/features/tools/siphash/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/siphash-2-4-hash-text-or-file",
)({
  head: siphash24HashTextOrFileHead,
  pendingComponent: SipHashRouteSkeleton,
  component: SipHash64Tool,
});
