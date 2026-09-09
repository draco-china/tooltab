import { createFileRoute } from "@tanstack/react-router";
import PrcIdValidator from "@/features/tools/prc-id-validator/page";
import { prcIdValidatorHead } from "@/features/tools/prc-id-validator/head";

import { PrcIdValidatorSkeleton } from "@/features/tools/prc-id-validator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/prc-id-validator")({
  head: prcIdValidatorHead,
  pendingComponent: PrcIdValidatorSkeleton,
  component: PrcIdValidator,
});
