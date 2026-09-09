import { createFileRoute } from "@tanstack/react-router";
import Ripemd320Tool from "@/features/tools/ripemd320-hash-text-or-file/page";
import { ripemd320HashTextOrFileHead } from "@/features/tools/ripemd320-hash-text-or-file/head";

import { Ripemd320Skeleton } from "@/features/tools/ripemd320-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/ripemd320-hash-text-or-file",
)({
  head: ripemd320HashTextOrFileHead,
  pendingComponent: Ripemd320Skeleton,
  component: Ripemd320Tool,
});
