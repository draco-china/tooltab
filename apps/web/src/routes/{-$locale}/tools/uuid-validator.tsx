import { createFileRoute } from "@tanstack/react-router";
import UuidValidator from "@/features/tools/uuid-inspector/page";
import { uuidValidatorHead } from "@/features/tools/uuid-inspector/head";

import { UuidValidatorRouteSkeleton } from "@/features/tools/uuid-validator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/uuid-validator")({
  head: uuidValidatorHead,
  pendingComponent: UuidValidatorRouteSkeleton,
  component: UuidValidator,
});
