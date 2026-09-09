import { createFileRoute } from "@tanstack/react-router";
import RemovePdfOwnerPasswordPage from "@/features/tools/remove-pdf-owner-password/page";
import { removePdfOwnerPasswordHead } from "@/features/tools/remove-pdf-owner-password/head";

import { RemovePdfOwnerPasswordSkeleton } from "@/features/tools/remove-pdf-owner-password/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/remove-pdf-owner-password",
)({
  head: removePdfOwnerPasswordHead,
  pendingComponent: RemovePdfOwnerPasswordSkeleton,
  component: RemovePdfOwnerPasswordPage,
});
