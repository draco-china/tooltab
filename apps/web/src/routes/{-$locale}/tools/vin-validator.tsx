import { createFileRoute } from "@tanstack/react-router";
import VinValidatorPage from "@/features/tools/vin-validator/page";
import { vinValidatorHead } from "@/features/tools/vin-validator/head";

import { VinValidatorRouteSkeleton } from "@/features/tools/vin-validator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/vin-validator")({
  head: vinValidatorHead,
  pendingComponent: VinValidatorRouteSkeleton,
  component: VinValidatorPage,
});
