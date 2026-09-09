import { createFileRoute } from "@tanstack/react-router";
import BicSwiftValidatorPage from "@/features/tools/bic-swift-validator/page";
import { bicSwiftValidatorHead } from "@/features/tools/bic-swift-validator/head";

import { BicSwiftValidatorRouteSkeleton } from "@/features/tools/bic-swift-validator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/bic-swift-validator")({
  head: bicSwiftValidatorHead,
  pendingComponent: BicSwiftValidatorRouteSkeleton,
  component: BicSwiftValidatorPage,
});
