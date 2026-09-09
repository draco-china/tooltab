import { createFileRoute } from "@tanstack/react-router";
import ImeiValidatorPage from "@/features/tools/imei-validator/page";
import { imeiValidatorHead } from "@/features/tools/imei-validator/head";

import { ImeiValidatorRouteSkeleton } from "@/features/tools/imei-validator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/imei-validator")({
  head: imeiValidatorHead,
  pendingComponent: ImeiValidatorRouteSkeleton,
  component: ImeiValidatorPage,
});
